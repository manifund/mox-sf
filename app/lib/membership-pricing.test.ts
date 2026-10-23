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
    expect(OFFICE_SIZES.map((s) => s.quarterlyMonthlyCents)).toEqual([
      500000, 625000, 750000, 1000000,
    ])
    expect(OFFICE_SIZES[0].quarterlyMonthlyCents).toBe(
      4 * OFFICE_PER_PERSON_MONTHLY_CENTS
    )
  })

  it('applies the mission-aligned discount and month-to-month markup', () => {
    expect(
      OFFICE_SIZES.map((s) =>
        officeMissionAlignedCents(s.quarterlyMonthlyCents)
      )
    ).toEqual([400000, 500000, 600000, 800000])
    expect(
      OFFICE_SIZES.map((s) => officeMonthToMonthCents(s.quarterlyMonthlyCents))
    ).toEqual([625000, 781250, 937500, 1250000])
    expect(officeMonthToMonthCents(officeMissionAlignedCents(500000))).toBe(
      500000
    )
  })
})
