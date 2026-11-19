import { stripe } from '@/app/lib/stripe'
import { env } from '@/app/lib/env'
import {
  MEMBERSHIP_TIERS,
  chargeCents,
  checkoutTrial,
  isBillingInterval,
  isMembershipTierId,
} from '@/app/lib/membership-pricing'
import { getSessionMember } from '@/app/lib/session-member'

// Starts a Stripe Checkout subscription for a membership tier. Works without
// a login on purpose: /join is reached by invite link before the person has a
// portal account. The Airtable record id rides along as client_reference_id so
// the Stripe webhook can link the subscription to the person.
//
// When the request does come from a logged-in portal session (/portal/renew,
// or a member who opens /join while signed in), checkout reuses the Stripe
// customer already on their People record. Without that every sign-up creates
// another Stripe customer for the same person. An anonymous request never
// reuses a customer: the record id it sends comes from the URL and could be
// anyone's.
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

    const who = await checkoutIdentity(clientReferenceId, email)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        ...checkoutTrial(tierId),
        metadata: { tier: tier.name, interval },
      },
      allow_promotion_codes: true,
      ...who,
      success_url: `${baseUrl}/portal/login?joined=1`,
      cancel_url: `${baseUrl}/join`,
    })

    return Response.json({ url: session.url })
  } catch (error) {
    console.error('[membership-checkout] Failed to create session:', error)
    return Response.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}

// Who Checkout should bill and which People record the sign-up belongs to.
async function checkoutIdentity(
  clientReferenceId: unknown,
  email: unknown
): Promise<{
  client_reference_id?: string
  customer?: string
  customer_email?: string
}> {
  const member = await getSessionMember().catch(() => null)
  if (member) {
    if (member.stripeCustomerId && (await customerExists(member.stripeCustomerId))) {
      return {
        client_reference_id: member.recordId,
        customer: member.stripeCustomerId,
      }
    }
    return {
      client_reference_id: member.recordId,
      ...(member.email ? { customer_email: member.email } : {}),
    }
  }

  return {
    ...(typeof clientReferenceId === 'string' && clientReferenceId
      ? { client_reference_id: clientReferenceId }
      : {}),
    ...(typeof email === 'string' && email ? { customer_email: email } : {}),
  }
}

// A stale or deleted customer id would make Checkout fail outright; fall back
// to a fresh customer instead.
async function customerExists(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    return !customer.deleted
  } catch {
    return false
  }
}
