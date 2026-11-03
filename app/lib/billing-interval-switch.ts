// Pure logic behind the portal's "switch to quarterly / month-to-month"
// button. Everything that talks to Stripe lives in
// app/portal/api/switch-billing-interval/route.ts; this module only decides
// whether a switch is allowed and what to send, so it can be unit tested.
//
// The switch itself is done with a Subscription Schedule: phase 1 keeps the
// member's current price until the end of the period they've already paid
// for, phase 2 bills the target price for one period, then the schedule is
// released and the subscription keeps renewing on the new price. That means
// nobody is charged mid-cycle, and a quarterly member who moves to monthly
// still gets the full quarter they committed to.

import {
  type BillingInterval,
  type MembershipTier,
  formatDollars,
  otherInterval,
  tierFromStripeProductId,
} from './membership-pricing'

export type PriceInterval = BillingInterval | 'other'

export interface Recurring {
  interval: string
  interval_count: number
}

/** monthly = every 1 month, quarterly = every 3 months, anything else = other. */
export function intervalFromRecurring(
  recurring: Recurring | null | undefined
): PriceInterval | null {
  if (!recurring) return null
  if (recurring.interval === 'month' && recurring.interval_count === 1) {
    return 'monthly'
  }
  if (recurring.interval === 'month' && recurring.interval_count === 3) {
    return 'quarterly'
  }
  return 'other'
}

/** "$595/month", "$1,350 every 3 months", "$5,000/year". */
export function formatRate(
  unitAmountCents: number | null | undefined,
  recurring: Recurring | null | undefined
): string {
  const dollars = formatDollars(unitAmountCents ?? 0)
  if (!recurring) return dollars
  if (recurring.interval_count === 1) return `${dollars}/${recurring.interval}`
  return `${dollars} every ${recurring.interval_count} ${recurring.interval}s`
}

/** The parts of a Stripe subscription the eligibility check cares about. */
export interface SubscriptionSummary {
  status: string
  isPaused: boolean
  cancelAtPeriodEnd: boolean
  hasDiscount: boolean
  itemCount: number
  quantity: number
  productId: string | null
  recurring: Recurring | null
}

export type SwitchBlockedReason =
  | 'status'
  | 'multiple_items'
  | 'not_membership'
  | 'unknown_interval'
  | 'paused'
  | 'cancelling'
  | 'discount'

export type SwitchEligibility =
  | {
      ok: true
      tier: MembershipTier
      current: BillingInterval
      target: BillingInterval
    }
  | { ok: false; reason: SwitchBlockedReason; message: string | null }

const CONTACT = 'email team@moxsf.com and we can switch it for you'

/**
 * Whether the member can self-serve a billing interval switch. `message` is
 * member-facing copy for the portal, or null when there is nothing useful to
 * show (e.g. a Friend subscription simply doesn't get the button).
 */
export function planSwitchEligibility(
  sub: SubscriptionSummary
): SwitchEligibility {
  if (!['active', 'trialing'].includes(sub.status)) {
    return {
      ok: false,
      reason: 'status',
      message:
        sub.status === 'past_due'
          ? `to change your billing plan, settle your open invoice first or ${CONTACT}.`
          : null,
    }
  }
  if (sub.itemCount !== 1 || sub.quantity !== 1) {
    return {
      ok: false,
      reason: 'multiple_items',
      message: `to change your billing plan, ${CONTACT}.`,
    }
  }
  const tier = tierFromStripeProductId(sub.productId)
  if (!tier) {
    return { ok: false, reason: 'not_membership', message: null }
  }
  const current = intervalFromRecurring(sub.recurring)
  if (current !== 'monthly' && current !== 'quarterly') {
    return {
      ok: false,
      reason: 'unknown_interval',
      message: `to change your billing plan, ${CONTACT}.`,
    }
  }
  if (sub.isPaused) {
    return {
      ok: false,
      reason: 'paused',
      message: 'resume your membership to change your billing plan.',
    }
  }
  if (sub.cancelAtPeriodEnd) {
    return {
      ok: false,
      reason: 'cancelling',
      message: `your membership is set to end at the end of this period. to keep it on a different plan instead, ${CONTACT}.`,
    }
  }
  if (sub.hasDiscount) {
    return {
      ok: false,
      reason: 'discount',
      message: `your membership has a discount applied. to change your billing plan without losing it, ${CONTACT}.`,
    }
  }
  return { ok: true, tier, current, target: otherInterval(current) }
}

/** The phase Stripe builds when a schedule is created `from_subscription`. */
export interface ExistingPhase {
  start_date: number
  end_date: number
  trial_end?: number | null
  items: { price: string; quantity?: number | null }[]
}

/** Stripe's phase `duration` (API 2025-10-29 and later; `iterations` is gone). */
export interface PhaseDuration {
  interval: 'day' | 'week' | 'month' | 'year'
  interval_count: number
}

export interface PhaseParams {
  items: { price: string; quantity: number }[]
  start_date?: number
  end_date?: number
  trial_end?: number
  duration?: PhaseDuration
  proration_behavior?: 'none'
}

export interface TargetPrice {
  id: string
  recurring: Recurring
}

const PHASE_INTERVALS = new Set(['day', 'week', 'month', 'year'])

/**
 * Phases for the schedule update: the current phase exactly as it is, then
 * one billing period on the target price. With `end_behavior: 'release'` the
 * subscription carries on renewing on the target price afterwards.
 *
 * The second phase's length comes from the target price's own interval
 * (quarterly = 3 months): since API version 2025-10-29 Stripe wants an
 * explicit `duration` here and rejects the old `iterations: 1`.
 */
export function buildSwitchPhases(
  existing: ExistingPhase,
  target: TargetPrice
): PhaseParams[] {
  if (!PHASE_INTERVALS.has(target.recurring.interval)) {
    throw new Error(
      `Price ${target.id} recurs every ${target.recurring.interval}, which a schedule phase cannot express`
    )
  }
  const current: PhaseParams = {
    items: existing.items.map((item) => ({
      price: item.price,
      quantity: item.quantity ?? 1,
    })),
    start_date: existing.start_date,
    end_date: existing.end_date,
  }
  if (existing.trial_end) current.trial_end = existing.trial_end
  return [
    current,
    {
      items: [{ price: target.id, quantity: 1 }],
      duration: {
        interval: target.recurring.interval as PhaseDuration['interval'],
        interval_count: target.recurring.interval_count,
      },
      proration_behavior: 'none',
    },
  ]
}

export interface ScheduleSummary {
  status: string
  phases: {
    start_date: number
    items: { price: string | { id: string } }[]
  }[]
}

export interface PendingSwitch {
  priceId: string
  effectiveAt: number
}

/**
 * If a schedule has a phase that hasn't started yet, that's a pending switch:
 * the price it will move to and when. Null when nothing is scheduled.
 */
export function pendingSwitchFromSchedule(
  schedule: ScheduleSummary | null | undefined,
  nowSeconds: number
): PendingSwitch | null {
  if (!schedule || schedule.status !== 'active') return null
  const upcoming = schedule.phases
    .filter((phase) => phase.start_date > nowSeconds)
    .sort((a, b) => a.start_date - b.start_date)[0]
  const item = upcoming?.items[0]
  if (!upcoming || !item) return null
  const priceId = typeof item.price === 'string' ? item.price : item.price.id
  return { priceId, effectiveAt: upcoming.start_date }
}
