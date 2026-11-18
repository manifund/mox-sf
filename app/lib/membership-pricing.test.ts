import { describe, expect, it } from 'vitest'
import {
  MEMBERSHIP_TIERS,
  OFFICE_PER_PERSON_MONTHLY_CENTS,
  OFFICE_SIZES,
  chargeCents,
  formatDollars,
  isBillingInterval,
  isMembershipTierId,
  monthlyPriceCents,
  officeMissionAlignedCents,
  officeMonthToMonthCents,
  quarterlySavingsPercent,
  CORE_PROMO_TRIAL_END,
  TRIAL_DAYS,
  checkoutTrial,
  corePromoTrialActive,
} from './membership-pricing'

describe('membership pricing', () => {
  it('quarterly is cheaper per month than month-to-month for every tier', () => {
    for (const tier of Object.values(MEMBERSHIP_TIERS)) {
      expect(tier.quarterlyMonthlyCents).toBeLessThan(tier.monthlyCents)
      expect(quarterlySavingsPercent(tier)).toBeGreaterThan(0)
    }
  })

  it('computes the savings percent the table advertises', () => {
    expect(quarterlySavingsPercent(MEMBERSHIP_TIERS.core)).toBe(24)
    expect(quarterlySavingsPercent(MEMBERSHIP_TIERS.resident)).toBe(15)
  })

  it('charges three months up front on the quarterly plan', () => {
    expect(chargeCents(MEMBERSHIP_TIERS.core, 'quarterly')).toBe(135000)
    expect(chargeCents(MEMBERSHIP_TIERS.core, 'monthly')).toBe(59500)
    expect(monthlyPriceCents(MEMBERSHIP_TIERS.resident, 'quarterly')).toBe(
      85000
    )
  })

  it('formats whole dollars with thousands separators', () => {
    expect(formatDollars(45000)).toBe('$450')
    expect(formatDollars(125000)).toBe('$1,250')
  })

  it('narrows untrusted request values', () => {
    expect(isMembershipTierId('core')).toBe(true)
    expect(isMembershipTierId('office')).toBe(false)
    expect(isBillingInterval('monthly')).toBe(true)
    expect(isBillingInterval('yearly')).toBe(false)
  })

  it('uses distinct Stripe lookup keys per tier and interval', () => {
    const keys = Object.values(MEMBERSHIP_TIERS).flatMap((t) =>
      Object.values(t.stripeLookupKeys)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('prices offices by headcount from the per-person rate', () => {
    expect(OFFICE_SIZES.map((s) => s.people)).toEqual([4, 5, 6, 8])
    expect(OFFICE_SIZES.map((s) => s.standardMonthlyCents)).toEqual([
      500000, 625000, 750000, 1000000,
    ])
    expect(OFFICE_SIZES[0].standardMonthlyCents).toBe(
      4 * OFFICE_PER_PERSON_MONTHLY_CENTS
    )
  })

  it('applies the mission-aligned discount and month-to-month markup', () => {
    expect(
      OFFICE_SIZES.map((s) => officeMissionAlignedCents(s.standardMonthlyCents))
    ).toEqual([400000, 500000, 600000, 800000])
    expect(
      OFFICE_SIZES.map((s) => officeMonthToMonthCents(s.standardMonthlyCents))
    ).toEqual([625000, 781250, 937500, 1250000])
    expect(officeMonthToMonthCents(officeMissionAlignedCents(500000))).toBe(
      500000
    )
  })
})

describe('checkoutTrial', () => {
  const pt = (iso: string) => Date.parse(iso)

  it('gives Core sign-ups a trial ending midnight Pacific on Jan 1, 2027', () => {
    expect(new Date(CORE_PROMO_TRIAL_END * 1000).toISOString()).toBe(
      '2027-01-01T08:00:00.000Z'
    )
    expect(checkoutTrial('core', pt('2026-11-17T12:00:00-08:00'))).toEqual({
      trial_end: CORE_PROMO_TRIAL_END,
    })
    expect(checkoutTrial('core', pt('2026-12-29T22:00:00-08:00'))).toEqual({
      trial_end: CORE_PROMO_TRIAL_END,
    })
  })

  it('falls back to the usual trial once Stripe would refuse the date', () => {
    expect(checkoutTrial('core', pt('2026-12-30T00:00:00-08:00'))).toEqual({
      trial_period_days: TRIAL_DAYS,
    })
    expect(checkoutTrial('core', pt('2027-02-01T00:00:00-08:00'))).toEqual({
      trial_period_days: TRIAL_DAYS,
    })
  })

  it('never applies to Resident', () => {
    expect(checkoutTrial('resident', pt('2026-11-17T12:00:00-08:00'))).toEqual({
      trial_period_days: TRIAL_DAYS,
    })
  })
})

describe('corePromoTrialActive', () => {
  it('is on through Dec 29 and off from Dec 30 (Pacific), matching checkout', () => {
    expect(corePromoTrialActive(Date.parse('2026-11-18T12:00:00-08:00'))).toBe(true)
    expect(corePromoTrialActive(Date.parse('2026-12-29T22:00:00-08:00'))).toBe(true)
    expect(corePromoTrialActive(Date.parse('2026-12-30T00:00:00-08:00'))).toBe(false)
  })
})
