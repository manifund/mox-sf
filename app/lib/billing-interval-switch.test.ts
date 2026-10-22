import { describe, expect, it } from 'vitest'
import {
  type SubscriptionSummary,
  buildSwitchPhases,
  formatRate,
  intervalFromRecurring,
  pendingSwitchFromSchedule,
  planSwitchEligibility,
} from './billing-interval-switch'
import { MEMBERSHIP_TIERS } from './membership-pricing'

const monthlyCore: SubscriptionSummary = {
  status: 'active',
  isPaused: false,
  cancelAtPeriodEnd: false,
  hasDiscount: false,
  itemCount: 1,
  quantity: 1,
  productId: MEMBERSHIP_TIERS.core.stripeProductId,
  recurring: { interval: 'month', interval_count: 1 },
}

describe('intervalFromRecurring', () => {
  it('recognises monthly and quarterly prices', () => {
    expect(intervalFromRecurring({ interval: 'month', interval_count: 1 })).toBe(
      'monthly'
    )
    expect(intervalFromRecurring({ interval: 'month', interval_count: 3 })).toBe(
      'quarterly'
    )
  })

  it('treats anything else as other', () => {
    expect(intervalFromRecurring({ interval: 'year', interval_count: 1 })).toBe(
      'other'
    )
    expect(intervalFromRecurring({ interval: 'month', interval_count: 6 })).toBe(
      'other'
    )
    expect(intervalFromRecurring(null)).toBeNull()
  })
})

describe('formatRate', () => {
  it('formats monthly, quarterly and one-off amounts', () => {
    expect(formatRate(59500, { interval: 'month', interval_count: 1 })).toBe(
      '$595/month'
    )
    expect(formatRate(135000, { interval: 'month', interval_count: 3 })).toBe(
      '$1,350 every 3 months'
    )
    expect(formatRate(7000, null)).toBe('$70')
  })
})

describe('planSwitchEligibility', () => {
  it('lets a monthly Core member switch to quarterly', () => {
    const result = planSwitchEligibility(monthlyCore)
    expect(result).toEqual({
      ok: true,
      tier: MEMBERSHIP_TIERS.core,
      current: 'monthly',
      target: 'quarterly',
    })
  })

  it('lets a quarterly Resident member switch to monthly', () => {
    const result = planSwitchEligibility({
      ...monthlyCore,
      productId: MEMBERSHIP_TIERS.resident.stripeProductId,
      recurring: { interval: 'month', interval_count: 3 },
    })
    expect(result).toMatchObject({
      ok: true,
      current: 'quarterly',
      target: 'monthly',
    })
  })

  it('allows switching during the trial', () => {
    expect(planSwitchEligibility({ ...monthlyCore, status: 'trialing' })).toMatchObject(
      { ok: true }
    )
  })

  it('blocks past-due subscriptions with a message', () => {
    const result = planSwitchEligibility({ ...monthlyCore, status: 'past_due' })
    expect(result).toMatchObject({ ok: false, reason: 'status' })
    expect(result.ok === false && result.message).toMatch(/open invoice/)
  })

  it('gives non-membership products no button and no message', () => {
    expect(
      planSwitchEligibility({ ...monthlyCore, productId: 'prod_Rq9VzfM9QoJwPD' })
    ).toEqual({ ok: false, reason: 'not_membership', message: null })
  })

  it('blocks legacy intervals, pauses, cancellations and discounts', () => {
    expect(
      planSwitchEligibility({
        ...monthlyCore,
        recurring: { interval: 'year', interval_count: 1 },
      })
    ).toMatchObject({ ok: false, reason: 'unknown_interval' })
    expect(planSwitchEligibility({ ...monthlyCore, isPaused: true })).toMatchObject({
      ok: false,
      reason: 'paused',
    })
    expect(
      planSwitchEligibility({ ...monthlyCore, cancelAtPeriodEnd: true })
    ).toMatchObject({ ok: false, reason: 'cancelling' })
    expect(planSwitchEligibility({ ...monthlyCore, hasDiscount: true })).toMatchObject(
      { ok: false, reason: 'discount' }
    )
  })

  it('blocks subscriptions with several items or seats', () => {
    expect(planSwitchEligibility({ ...monthlyCore, itemCount: 2 })).toMatchObject({
      ok: false,
      reason: 'multiple_items',
    })
    expect(planSwitchEligibility({ ...monthlyCore, quantity: 2 })).toMatchObject({
      ok: false,
      reason: 'multiple_items',
    })
  })
})

describe('buildSwitchPhases', () => {
  it('keeps the current phase intact and adds one period on the new price', () => {
    const phases = buildSwitchPhases(
      {
        start_date: 1_700_000_000,
        end_date: 1_702_592_000,
        items: [{ price: 'price_old', quantity: 1 }],
      },
      'price_new'
    )
    expect(phases).toEqual([
      {
        items: [{ price: 'price_old', quantity: 1 }],
        start_date: 1_700_000_000,
        end_date: 1_702_592_000,
      },
      {
        items: [{ price: 'price_new', quantity: 1 }],
        iterations: 1,
        proration_behavior: 'none',
      },
    ])
  })

  it('carries an in-progress trial through the current phase', () => {
    const [current] = buildSwitchPhases(
      {
        start_date: 1,
        end_date: 2,
        trial_end: 2,
        items: [{ price: 'price_old', quantity: null }],
      },
      'price_new'
    )
    expect(current.trial_end).toBe(2)
    expect(current.items[0].quantity).toBe(1)
  })
})

describe('pendingSwitchFromSchedule', () => {
  const schedule = {
    status: 'active',
    phases: [
      { start_date: 100, items: [{ price: 'price_old' }] },
      { start_date: 200, items: [{ price: { id: 'price_new' } }] },
    ],
  }

  it('reports the next phase that has not started yet', () => {
    expect(pendingSwitchFromSchedule(schedule, 150)).toEqual({
      priceId: 'price_new',
      effectiveAt: 200,
    })
  })

  it('reports nothing once the switch has happened or the schedule ended', () => {
    expect(pendingSwitchFromSchedule(schedule, 250)).toBeNull()
    expect(
      pendingSwitchFromSchedule({ ...schedule, status: 'released' }, 150)
    ).toBeNull()
    expect(pendingSwitchFromSchedule(null, 150)).toBeNull()
  })
})
