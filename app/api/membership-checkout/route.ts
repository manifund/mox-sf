import { stripe } from '@/app/lib/stripe'
import { env } from '@/app/lib/env'
import {
  MEMBERSHIP_TIERS,
  TRIAL_DAYS,
  chargeCents,
  isBillingInterval,
  isMembershipTierId,
} from '@/app/lib/membership-pricing'

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
        trial_period_days: TRIAL_DAYS,
        metadata: { tier: tier.name, interval },
      },
      allow_promotion_codes: true,
      ...(typeof clientReferenceId === 'string' && clientReferenceId
        ? { client_reference_id: clientReferenceId }
        : {}),
      ...(typeof email === 'string' && email ? { customer_email: email } : {}),
      success_url: `${baseUrl}/portal/login?joined=1`,
      cancel_url: `${baseUrl}/join`,
    })

    return Response.json({ url: session.url })
  } catch (error) {
    console.error('[membership-checkout] Failed to create session:', error)
    return Response.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}
