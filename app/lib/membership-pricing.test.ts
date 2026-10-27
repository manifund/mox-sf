import { describe, expect, it } from 'vitest'
import {
  MEMBERSHIP_TIERS,
  chargeCents,
  formatDollars,
  isBillingInterval,
  isMembershipTierId,
  monthlyPriceCents,
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
})
