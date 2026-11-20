import { stripe } from './stripe'
import { isHeldMembership } from './stripe-membership-sync'

export interface ExistingMembership {
  /** True when some Stripe customer for this person holds a live membership
   *  subscription (active, trialing, past due, unpaid or paused). */
  held: boolean
  /** A Stripe customer that exists for this person, to reuse at checkout
   *  instead of creating a duplicate customer. */
  customerId: string | null
}

const NONE: ExistingMembership = { held: false, customerId: null }

/**
 * Looks for a membership subscription this person already holds, so /join
 * can send them to the billing portal instead of starting a second
 * subscription. Checks the Stripe customer id on their Airtable record and
 * every Stripe customer with their email (the record's id can be missing or
 * stale when the Stripe → Airtable link didn't run).
 *
 * Fails open: if Stripe can't be reached this returns "no membership", since
 * blocking a real signup is worse than the rare duplicate staff can refund.
 */
export async function findExistingMembership({
  customerIds,
  email,
}: {
  customerIds?: (string | null | undefined)[]
  email?: string | null
}): Promise<ExistingMembership> {
  try {
    const ids = new Set(
      (customerIds ?? [])
        .flatMap((value) => (value ?? '').split(/[\s,]+/))
        .filter((id) => id.startsWith('cus_'))
    )
    if (email) {
      const byEmail = await stripe.customers.list({ email, limit: 10 })
      for (const customer of byEmail.data) ids.add(customer.id)
    }

    let reusable: string | null = null
    for (const id of ids) {
      // Listing without a status filter returns everything except cancelled.
      // A stale id typed into Airtable by hand throws; skip it.
      const subscriptions = await stripe.subscriptions
        .list({ customer: id, limit: 20 })
        .catch(() => null)
      if (!subscriptions) continue
      const held = subscriptions.data.some((sub) => {
        const product = sub.items.data[0]?.price.product
        const productId =
          typeof product === 'string' ? product : (product?.id ?? null)
        return isHeldMembership({ status: sub.status, productId })
      })
      if (held) return { held: true, customerId: id }
      if (!reusable) {
        const customer = await stripe.customers.retrieve(id).catch(() => null)
        if (customer && !customer.deleted) reusable = id
      }
    }
    return { held: false, customerId: reusable }
  } catch (error) {
    console.error('[existing-membership] Stripe lookup failed:', error)
    return NONE
  }
}
