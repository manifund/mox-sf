// Membership lifecycle driven by Stripe webhook events.
//
// This replaces the Zapier "On new Mox subscription, ping Discord & update
// Airtable" Zap, which mapped the subscription's price *amount* to a tier via a
// lookup table and silently skipped the Airtable update whenever a price it
// didn't know about was used. Here the tier comes from the subscription
// metadata written by /api/membership-checkout, falling back to the Stripe
// Product, so a price change cannot break onboarding.
//
// Downstream effects that stay in Airtable / the app and key off these fields:
// - "Add member to Verkada" automation: Status = Joined → provisions door access
// - sync-discord-roles cron: Status = Joined + Tier → Discord tier role
// - portal door code / guest passes: Status = Joined + paid Tier
//
// Every handler is idempotent so the route can return 500 on failure and let
// Stripe retry the event.

import type Stripe from 'stripe'
import { Resend } from 'resend'
import { stripe } from '@/app/lib/stripe'
import {
  Tables,
  createRecord,
  findRecord,
  getRecord,
  updateRecord,
  escapeAirtableString,
  type AirtableRecord,
} from '@/app/lib/airtable'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { env } from '@/app/lib/env'
import { FORKABLE_CLUBS } from '@/app/lib/forkable'
import { removeMemberDoorAccess } from '@/app/lib/verkada'
import { getMembershipWelcomeEmail } from '@/app/lib/emails/membership-welcome'

export type MembershipTierName = 'Core' | 'Resident' | 'Friend'
const TIER_NAMES: readonly string[] = ['Core', 'Resident', 'Friend']

// Stripe membership Products → Airtable tier (and Forkable club for the
// subscription.created handler). Prices under these Products can change freely.
export const MEMBERSHIP_PRODUCTS: Record<
  string,
  { tier: MembershipTierName; forkableClubIds: number[] }
> = {
  prod_RpkYg9EMJoi5oi: {
    tier: 'Core',
    forkableClubIds: [FORKABLE_CLUBS.MOX_MEMBERS],
  },
  prod_RpkufjD9E3esG5: {
    tier: 'Resident',
    forkableClubIds: [FORKABLE_CLUBS.MOX_RESIDENTS],
  },
  prod_Rq9VzfM9QoJwPD: { tier: 'Friend', forkableClubIds: [] }, // No Forkable access
}

export const STATUS = {
  JOINED: 'Joined',
  PAYMENT_ISSUE: 'Payment Issue',
  CANCELLED: 'Cancelled',
} as const

export interface PersonFields {
  Name?: string
  Email?: string
  Status?: string
  Tier?: string
  'Stripe Customer ID'?: string
  'In Verkada'?: boolean
}

type Person = AirtableRecord<PersonFields>

const LOG = '[Stripe Membership]'
const FROM = 'Mox SF <noreply@account.moxsf.com>'
const REPLY_TO = 'robin@moxsf.com'

// Lazily constructed so importing this module never needs RESEND_API_KEY.
let resendClient: Resend | null = null
function resend(): Resend {
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY)
  return resendClient
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function idOf(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${customerId}`
}

function formatAmount(cents: number | null | undefined, currency: string) {
  if (cents == null) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatPacificDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  })
}

/** Staff-facing audit trail. Never throws; a Discord outage must not fail the webhook. */
export async function notifyStaff(message: string): Promise<void> {
  try {
    const sent = await sendChannelMessage(
      DISCORD_CHANNELS.NOTIFICATIONS,
      message
    )
    if (!sent.success) console.error(`${LOG} Failed to post staff notification`)
  } catch (error) {
    console.error(`${LOG} Failed to post staff notification:`, error)
  }
}

/** Called by the route when a membership handler throws and a 500 is returned. */
export async function alertWebhookFailure(
  eventType: string,
  eventId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await notifyStaff(
    `🚨 **Stripe webhook failed** (\`${eventType}\`, ${eventId}): ${message}\n` +
      `Returned 500 so Stripe will retry. If it keeps failing, check the Vercel logs and fix Airtable by hand.`
  )
}

/** Tier from checkout metadata first (written by /api/membership-checkout), then from the Product. */
export function resolveTier(
  subscription: Stripe.Subscription
): MembershipTierName | null {
  const fromMetadata = subscription.metadata?.tier
  if (fromMetadata && TIER_NAMES.includes(fromMetadata)) {
    return fromMetadata as MembershipTierName
  }
  const item = subscription.items?.data?.[0]
  const productId = idOf(item?.price?.product as string | { id: string } | null)
  if (productId && MEMBERSHIP_PRODUCTS[productId]) {
    return MEMBERSHIP_PRODUCTS[productId].tier
  }
  return null
}

async function findPersonByCustomerId(
  customerId: string
): Promise<Person | null> {
  return findRecord<PersonFields>(
    Tables.People,
    `{Stripe Customer ID}="${escapeAirtableString(customerId)}"`
  )
}

async function findPersonByEmail(email: string): Promise<Person | null> {
  return findRecord<PersonFields>(
    Tables.People,
    `LOWER({Email})="${escapeAirtableString(email.trim().toLowerCase())}"`
  )
}

async function customerEmailAndName(
  customerId: string
): Promise<{ email: string | null; name: string }> {
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return { email: null, name: '' }
  return { email: customer.email ?? null, name: customer.name ?? '' }
}

// ---------------------------------------------------------------------------
// checkout.session.completed (mode = subscription)
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  personId: string
  tier: MembershipTierName
  skipped: boolean
}

/**
 * A member finished Stripe Checkout for a membership. Marks them Joined with
 * the right tier and Stripe Customer ID, sends the welcome email, and posts to
 * Discord. Safe to re-run: a record that already reflects this subscription
 * is left alone and nothing is re-sent.
 */
export async function handleMembershipCheckout(
  session: Stripe.Checkout.Session
): Promise<CheckoutResult | null> {
  if (session.mode !== 'subscription') return null

  const customerId = idOf(session.customer)
  const subscriptionId = idOf(session.subscription)
  if (!customerId || !subscriptionId) {
    throw new Error(
      `Subscription checkout ${session.id} has no customer or subscription`
    )
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })
  const tier = resolveTier(subscription)
  if (!tier) {
    const item = subscription.items?.data?.[0]
    const productId = idOf(
      item?.price?.product as string | { id: string } | null
    )
    console.error(
      `${LOG} Unknown membership product ${productId} on ${subscriptionId}`
    )
    await notifyStaff(
      `⚠️ **Membership checkout with unknown product** ${productId ?? '(none)'} for ` +
        `<${stripeCustomerUrl(customerId)}>. Airtable was NOT updated; add the product to ` +
        `MEMBERSHIP_PRODUCTS in app/lib/stripe-membership.ts.`
    )
    return null
  }

  let email = session.customer_details?.email ?? null
  let name = session.customer_details?.name ?? ''
  if (!email) {
    const fromCustomer = await customerEmailAndName(customerId)
    email = fromCustomer.email
    name = name || fromCustomer.name
  }
  if (!email) {
    throw new Error(`Subscription checkout ${session.id} has no customer email`)
  }

  const person = await findOrCreatePerson({
    recordId: session.client_reference_id,
    email,
    name,
  })

  const alreadyDone =
    person.fields['Stripe Customer ID'] === customerId &&
    person.fields.Status === STATUS.JOINED &&
    person.fields.Tier === tier
  if (alreadyDone) {
    console.log(
      `${LOG} ${person.id} already Joined as ${tier} for ${customerId}, skipping`
    )
    return { personId: person.id, tier, skipped: true }
  }

  const displayName = person.fields.Name?.trim() || name || email

  // Email first: if the Airtable write below fails and Stripe retries, the
  // worst case is a second welcome email, never a paying member left un-Joined.
  await sendWelcomeEmail({ email, name: displayName, tier })

  const fields: Partial<PersonFields> = {
    Status: STATUS.JOINED,
    Tier: tier,
    'Stripe Customer ID': customerId,
  }
  if (!person.fields.Name?.trim()) fields.Name = name || email
  await updateRecord<PersonFields>(Tables.People, person.id, fields)
  console.log(`${LOG} ${person.id} → Joined / ${tier} / ${customerId}`)

  await sendChannelMessage(
    DISCORD_CHANNELS.NEW_MEMBERS,
    `**${displayName} just started their Mox membership** 🎉`
  )

  const recordEmail = person.fields.Email?.trim().toLowerCase()
  const emailNote =
    recordEmail && recordEmail !== email.trim().toLowerCase()
      ? `\n⚠️ Checkout email (${email}) differs from the Airtable email (${person.fields.Email}); one of them is probably a typo.`
      : ''
  await notifyStaff(
    `✅ **New membership:** ${displayName} (${email}) → Joined, ${tier}. ` +
      `<${stripeCustomerUrl(customerId)}>${emailNote}`
  )

  return { personId: person.id, tier, skipped: false }
}

async function findOrCreatePerson({
  recordId,
  email,
  name,
}: {
  recordId: string | null | undefined
  email: string
  name: string
}): Promise<Person> {
  // 1. The Airtable record id that /join passed through checkout.
  if (recordId && /^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    const byId = await getRecord<PersonFields>(Tables.People, recordId)
    if (byId) return byId
    console.warn(
      `${LOG} client_reference_id ${recordId} not found, falling back to email`
    )
  }
  // 2. An existing person with this email (applications, day passes, old members).
  const byEmail = await findPersonByEmail(email)
  if (byEmail) return byEmail
  // 3. Brand new.
  const created = await createRecord<PersonFields>(Tables.People, {
    Name: name || email,
    Email: email,
  })
  console.log(`${LOG} Created new person ${created.id} for ${email}`)
  return created
}

async function sendWelcomeEmail({
  email,
  name,
  tier,
}: {
  email: string
  name: string
  tier: string
}) {
  const { subject, text } = getMembershipWelcomeEmail({
    customerName: name,
    tier,
  })
  const result = await resend().emails.send({
    from: FROM,
    to: email,
    replyTo: REPLY_TO,
    subject,
    text,
  })
  if (result.error) {
    throw new Error(`Welcome email rejected: ${result.error.message}`)
  }
  console.log(`${LOG} Sent welcome email to ${email}:`, result.data?.id)
}

// ---------------------------------------------------------------------------
// invoice.payment_failed — first failure, Stripe is still retrying
// ---------------------------------------------------------------------------

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // API 2025-10-29 moved the subscription under `parent`; older payloads put it
  // at the top level. Accept either.
  const fromParent = invoice.parent?.subscription_details?.subscription
  if (fromParent) return idOf(fromParent)
  const legacy = (
    invoice as unknown as { subscription?: string | { id: string } }
  ).subscription
  return idOf(legacy)
}

/** Heads-up to staff only. Access is unchanged until Stripe exhausts its retries. */
export async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = idOf(invoice.customer)
  if (!customerId || !invoiceSubscriptionId(invoice)) return

  const person = await findPersonByCustomerId(customerId)
  const email = invoice.customer_email ?? person?.fields.Email ?? ''
  const name = person?.fields.Name?.trim() || invoice.customer_name || email
  const amount = formatAmount(invoice.amount_due, invoice.currency)
  const retry = invoice.next_payment_attempt
    ? `Stripe retries on ${formatPacificDate(invoice.next_payment_attempt)}`
    : 'No further retry scheduled'

  await notifyStaff(
    `⚠️ **Payment failed:** ${name} (${email}), ${amount}, attempt ${invoice.attempt_count}. ` +
      `${retry}; access is unchanged until Stripe gives up. <${stripeCustomerUrl(customerId)}>` +
      (person ? '' : '\n⚠️ No Airtable record has this Stripe Customer ID.')
  )
}

// ---------------------------------------------------------------------------
// customer.subscription.updated / .deleted — lapse and recovery
// ---------------------------------------------------------------------------

const STILL_ACTIVE: readonly Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
]

/**
 * Stripe exhausted its retries (status → unpaid) or the member recovered
 * (unpaid/past_due → active). Other updates (plan switches, renewals, pause
 * collection, metadata) are ignored here.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttributes: Partial<Stripe.Subscription> | undefined
): Promise<void> {
  const previousStatus = previousAttributes?.status
  if (!previousStatus || previousStatus === subscription.status) return

  const customerId = idOf(subscription.customer)
  if (!customerId) return

  if (subscription.status === 'unpaid') {
    await lapseMembership({
      customerId,
      newStatus: STATUS.PAYMENT_ISSUE,
      reason: 'Payment failed after all retries',
    })
    return
  }

  const recovered =
    subscription.status === 'active' &&
    (previousStatus === 'unpaid' || previousStatus === 'past_due')
  if (recovered) {
    await recoverMembership(customerId)
  }
}

/** The subscription is gone. Unless the customer still has another live one, mark them Cancelled. */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = idOf(subscription.customer)
  if (!customerId) return

  const others = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
  })
  const stillLive = others.data.filter(
    (s) => s.id !== subscription.id && STILL_ACTIVE.includes(s.status)
  )
  if (stillLive.length > 0) {
    console.log(
      `${LOG} ${customerId} still has ${stillLive.length} live subscription(s); not cancelling`
    )
    return
  }

  await lapseMembership({
    customerId,
    newStatus: STATUS.CANCELLED,
    reason: 'Subscription cancelled',
  })
}

async function lapseMembership({
  customerId,
  newStatus,
  reason,
}: {
  customerId: string
  newStatus: typeof STATUS.PAYMENT_ISSUE | typeof STATUS.CANCELLED
  reason: string
}): Promise<void> {
  const person = await findPersonByCustomerId(customerId)
  if (!person) {
    await notifyStaff(
      `⚠️ **${reason}** for <${stripeCustomerUrl(customerId)}> but no Airtable record has that ` +
        `Stripe Customer ID. Set their Status to "${newStatus}" and remove door access by hand.`
    )
    return
  }

  const name = person.fields.Name?.trim() || person.fields.Email || person.id
  const email = person.fields.Email?.trim() ?? ''

  if (person.fields.Status === newStatus) {
    console.log(`${LOG} ${person.id} already ${newStatus}, skipping`)
    return
  }

  // Airtable is the source of truth; portal access and the Discord role sync
  // key off Status, so this alone removes everything except the physical door.
  await updateRecord<PersonFields>(Tables.People, person.id, {
    Status: newStatus,
    'In Verkada': false,
  })
  console.log(`${LOG} ${person.id} → ${newStatus} (${reason})`)

  const door = email
    ? await removeMemberDoorAccess(email)
    : { ok: false, error: 'No email on the Airtable record' }
  const doorNote = door.ok
    ? 'Door access removed.'
    : `⚠️ Door access NOT removed (${door.error}); remove them from the Verkada member group by hand.`

  await notifyStaff(
    `⛔ **${reason}:** ${name} (${email}) → ${newStatus}. ${doorNote} ` +
      `Discord role drops on the next sync. <${stripeCustomerUrl(customerId)}>`
  )
}

async function recoverMembership(customerId: string): Promise<void> {
  const person = await findPersonByCustomerId(customerId)
  if (!person) return
  if (person.fields.Status !== STATUS.PAYMENT_ISSUE) {
    console.log(
      `${LOG} ${person.id} is ${person.fields.Status}, not Payment Issue; nothing to recover`
    )
    return
  }

  // "In Verkada" was unchecked on lapse, so flipping back to Joined re-fires
  // the Airtable "Add member to Verkada" automation.
  await updateRecord<PersonFields>(Tables.People, person.id, {
    Status: STATUS.JOINED,
  })
  const name = person.fields.Name?.trim() || person.fields.Email || person.id
  console.log(`${LOG} ${person.id} → Joined (payment recovered)`)
  await notifyStaff(
    `✅ **Payment recovered:** ${name} → Joined again. Door access is being re-provisioned by Airtable. ` +
      `<${stripeCustomerUrl(customerId)}>`
  )
}
