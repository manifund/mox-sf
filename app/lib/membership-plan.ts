// Server-side view of a member's billing plan: which tier and interval they
// are on, whether they can switch intervals from the portal, and whether a
// switch is already scheduled. Used by GET /portal/api/subscription and the
// switch route. The decisions themselves live in billing-interval-switch.ts.

import type Stripe from 'stripe'
import { stripe } from './stripe'
import {
  type BillingInterval,
  type MembershipTierId,
  chargeCents,
  tierFromStripeProductId,
} from './membership-pricing'
import {
  type PendingSwitch,
  type SubscriptionSummary,
  type SwitchEligibility,
  formatRate,
  intervalFromRecurring,
  pendingSwitchFromSchedule,
  planSwitchEligibility,
} from './billing-interval-switch'

export function productIdOf(price: Stripe.Price): string {
  return typeof price.product === 'string' ? price.product : price.product.id
}

export function summarizeSubscription(
  sub: Stripe.Subscription
): SubscriptionSummary {
  const item = sub.items.data[0]
  return {
    status: sub.status,
    isPaused: !!sub.pause_collection,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    hasDiscount: (sub.discounts?.length ?? 0) > 0,
    itemCount: sub.items.data.length,
    quantity: item?.quantity ?? 1,
    productId: item ? productIdOf(item.price) : null,
    recurring: item?.price.recurring ?? null,
  }
}

/** Retrieve a subscription's schedule, if it has one. */
export async function scheduleOf(
  sub: Stripe.Subscription
): Promise<Stripe.SubscriptionSchedule | null> {
  if (!sub.schedule) return null
  if (typeof sub.schedule !== 'string') return sub.schedule
  return stripe.subscriptionSchedules.retrieve(sub.schedule)
}

export async function pendingSwitchOf(
  sub: Stripe.Subscription
): Promise<PendingSwitch | null> {
  const schedule = await scheduleOf(sub)
  return pendingSwitchFromSchedule(schedule, Math.floor(Date.now() / 1000))
}

export interface PendingSwitchView {
  interval: BillingInterval | 'other'
  effectiveDate: string
  rate: string
}

export interface PlanView {
  tierId: MembershipTierId | null
  interval: BillingInterval | 'other' | null
  rate: string
  // The interval the member can switch to from the portal, or null.
  canSwitchTo: BillingInterval | null
  // What the switch would cost per period, e.g. "$1,350 every 3 months".
  switchRate: string | null
  // Member-facing reason the button is missing, or null.
  switchNote: string | null
  pendingSwitch: PendingSwitchView | null
}

export async function describePlan(sub: Stripe.Subscription): Promise<PlanView> {
  const item = sub.items.data[0]
  const price = item?.price
  const tier = tierFromStripeProductId(price ? productIdOf(price) : null)
  const eligibility: SwitchEligibility = planSwitchEligibility(
    summarizeSubscription(sub)
  )

  let pendingSwitch: PendingSwitchView | null = null
  const pending = await pendingSwitchOf(sub)
  if (pending) {
    const target = await stripe.prices.retrieve(pending.priceId)
    pendingSwitch = {
      interval: intervalFromRecurring(target.recurring) ?? 'other',
      effectiveDate: new Date(pending.effectiveAt * 1000).toISOString(),
      rate: formatRate(target.unit_amount, target.recurring),
    }
  }

  const canSwitchTo = eligibility.ok && !pendingSwitch ? eligibility.target : null
  return {
    tierId: tier?.id ?? null,
    interval: price ? intervalFromRecurring(price.recurring) : null,
    rate: price ? formatRate(price.unit_amount, price.recurring) : '',
    canSwitchTo,
    switchRate:
      canSwitchTo && eligibility.ok
        ? formatRate(
            chargeCents(eligibility.tier, canSwitchTo),
            canSwitchTo === 'quarterly'
              ? { interval: 'month', interval_count: 3 }
              : { interval: 'month', interval_count: 1 }
          )
        : null,
    switchNote: eligibility.ok || pendingSwitch ? null : eligibility.message,
    pendingSwitch,
  }
}

/** The member's live subscription, if any: active or trialing first, then past due. */
export async function findLiveSubscription(
  customerId: string
): Promise<Stripe.Subscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 10,
  })
  return (
    subscriptions.data.find((s) => ['active', 'trialing'].includes(s.status)) ??
    subscriptions.data.find((s) => s.status === 'past_due') ??
    null
  )
}
