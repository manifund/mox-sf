import { stripe } from '@/app/lib/stripe'
import { env } from '@/app/lib/env'
import { getRecord, Tables } from '@/app/lib/airtable'
import { getSession } from '@/app/lib/session'
import { findExistingMembership } from '@/app/lib/existing-membership'
import {
  STRIPE_BILLING_LOGIN_URL,
  MEMBERSHIP_TIERS,
  chargeCents,
  checkoutTrial,
  isBillingInterval,
  isMembershipTierId,
} from '@/app/lib/membership-pricing'

interface PersonFields {
  Email?: string
  'Stripe Customer ID'?: string
}

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/

// Whose membership to check: the invite link's record, else the logged-in
// member's own (e.g. /portal/renew). Never an email from the request body, or
// this endpoint would tell anyone whether an address belongs to a member.
async function personForCheckout(clientReferenceId: unknown) {
  if (typeof clientReferenceId === 'string' && RECORD_ID.test(clientReferenceId)) {
    return getRecord<PersonFields>(Tables.People, clientReferenceId)
  }
  const session = await getSession()
  if (!session.isLoggedIn) return null
  return getRecord<PersonFields>(
    Tables.People,
    session.viewingAsUserId || session.userId
  )
}

// Starts a Stripe Checkout subscription for a membership tier. Unauthenticated
// on purpose: /join is reached by invite link before the person has a portal
// login, same as the Stripe pricing table it replaces. The Airtable record id
// rides along as client_reference_id so downstream automations can link the
// subscription to the person.
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tier: tierId, interval, clientReferenceId, email } = body
  if (!isMembershipTierId(tierId) || !isBillingInterval(interval)) {
    return Response.json(
      { error: 'tier must be core|resident and interval quarterly|monthly' },
      { status: 400 }
    )
  }
  const tier = MEMBERSHIP_TIERS[tierId]
  const lookupKey = tier.stripeLookupKeys[interval]

  try {
    // Don't start a second subscription for someone who already pays. Tier
    // changes for existing members go through the Stripe billing portal.
    const person = await personForCheckout(clientReferenceId)
    const existing = person
      ? await findExistingMembership({
          customerIds: [person.fields['Stripe Customer ID']],
          email: person.fields.Email,
        })
      : { held: false, customerId: null }
    const checkoutEmail =
      person?.fields.Email || (typeof email === 'string' && email) || null
    if (existing.held) {
      return Response.json(
        {
          error:
            'You already have a Mox membership. Change your tier from the billing portal instead.',
          manageUrl: STRIPE_BILLING_LOGIN_URL,
        },
        { status: 409 }
      )
    }

    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    })
    const price = prices.data[0]
    if (!price) {
      console.error(
        `[membership-checkout] No active Stripe price with lookup_key ${lookupKey}`
      )
      return Response.json(
        { error: `The ${tier.name} ${interval} plan isn't set up yet` },
        { status: 500 }
      )
    }
    const expected = chargeCents(tier, interval)
    if (price.unit_amount !== expected) {
      // Stripe is what actually charges; the table shows our config. Flag
      // drift loudly so nobody is quoted one number and billed another.
      console.warn(
        `[membership-checkout] Price ${price.id} (${lookupKey}) charges ${price.unit_amount} but membership-pricing.ts expects ${expected}`
      )
    }

    const requestUrl = new URL(request.url)
    const baseUrl =
      env.NEXT_PUBLIC_BASE_URL || `${requestUrl.protocol}//${requestUrl.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        ...checkoutTrial(tierId),
        metadata: { tier: tier.name, interval },
      },
      allow_promotion_codes: true,
      ...(typeof clientReferenceId === 'string' && clientReferenceId
        ? { client_reference_id: clientReferenceId }
        : {}),
      // Reuse their Stripe customer if they have one (e.g. a lapsed member),
      // so Stripe doesn't end up with two customers for one person.
      ...(existing.customerId
        ? { customer: existing.customerId }
        : checkoutEmail
          ? { customer_email: checkoutEmail }
          : {}),
      success_url: `${baseUrl}/portal/login?joined=1`,
      cancel_url: `${baseUrl}/join`,
    })

    return Response.json({ url: session.url })
  } catch (error) {
    console.error('[membership-checkout] Failed to create session:', error)
    return Response.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}
