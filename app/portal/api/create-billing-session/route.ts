import { getSessionMember } from '@/app/lib/session-member'
import { stripe } from '@/app/lib/stripe'
import { env } from '@/app/lib/env'

// Opens Stripe's billing page for the logged-in person's own customer (or the
// member a staff user is viewing as). A customer id in the request body is
// ignored: it could be anyone's.
export async function POST() {
  try {
    const member = await getSessionMember()
    if (!member) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stripeCustomerId = member.stripeCustomerId
    if (!stripeCustomerId) {
      return Response.json(
        { error: 'No Stripe customer on your record' },
        { status: 400 }
      )
    }

    // Create a billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_BASE_URL}/portal`,
    })

    return Response.json({ url: portalSession.url })
  } catch (error) {
    console.error('Error creating billing portal session:', error)
    return Response.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
