// Single source of truth for membership pricing shown on /join and
// /portal/renew and transacted by /api/membership-checkout.
//
// Stripe side: each tier has two recurring Prices on its existing membership
// Product (Core: prod_RpkYg9EMJoi5oi, Resident: prod_RpkufjD9E3esG5) so the
// webhook's product → tier mapping keeps working. The checkout route finds
// Prices by their Stripe `lookup_key`, so nothing here needs to change when a
// Price is rotated — just move the lookup key to the new Price.

export type MembershipTierId = 'core' | 'resident'
export type BillingInterval = 'quarterly' | 'monthly'

export interface MembershipTier {
  id: MembershipTierId
  name: string
  // Monthly-equivalent price with a 3-month commitment, billed up front.
  quarterlyMonthlyCents: number
  // Price with no commitment, billed monthly.
  monthlyCents: number
  stripeLookupKeys: Record<BillingInterval, string>
}

export const TRIAL_DAYS = 7
export const QUARTER_MONTHS = 3

export const MEMBERSHIP_TIERS: Record<MembershipTierId, MembershipTier> = {
  core: {
    id: 'core',
    name: 'Core',
    quarterlyMonthlyCents: 45000,
    monthlyCents: 59500,
    stripeLookupKeys: {
      quarterly: 'membership_core_quarterly',
      monthly: 'membership_core_monthly',
    },
  },
  resident: {
    id: 'resident',
    name: 'Resident',
    quarterlyMonthlyCents: 85000,
    monthlyCents: 99500,
    stripeLookupKeys: {
      quarterly: 'membership_resident_quarterly',
      monthly: 'membership_resident_monthly',
    },
  },
}

// Private offices are quoted by headcount and handled by hand rather than
// through checkout. The quarterly rate is per person per month; OFFICE_SIZES
// is the grid /offices shows. Quarterly contracts are billed QUARTER_MONTHS
// months up front plus a deposit; month-to-month costs a flat markup; teams
// doing mission-aligned work get a flat discount.
export const OFFICE_PER_PERSON_MONTHLY_CENTS = 125000
export const OFFICE_CONTACT_EMAIL = 'robin@moxsf.com'
export const OFFICE_DEPOSIT_MONTHS = 1
export const OFFICE_MONTH_TO_MONTH_MARKUP_PERCENT = 25
export const OFFICE_MISSION_ALIGNED_DISCOUNT_PERCENT = 20

export interface OfficeSize {
  people: number
  // Standard monthly rate on a quarterly contract.
  quarterlyMonthlyCents: number
}

export const OFFICE_SIZES: OfficeSize[] = [4, 5, 6, 8].map((people) => ({
  people,
  quarterlyMonthlyCents: people * OFFICE_PER_PERSON_MONTHLY_CENTS,
}))

/** Office rate with the mission-aligned discount applied. */
export function officeMissionAlignedCents(cents: number): number {
  return Math.round(cents * (1 - OFFICE_MISSION_ALIGNED_DISCOUNT_PERCENT / 100))
}

/** Office rate with the month-to-month markup applied. */
export function officeMonthToMonthCents(cents: number): number {
  return Math.round(cents * (1 + OFFICE_MONTH_TO_MONTH_MARKUP_PERCENT / 100))
}

export function isMembershipTierId(value: unknown): value is MembershipTierId {
  return value === 'core' || value === 'resident'
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'quarterly' || value === 'monthly'
}

/** Monthly-equivalent price for a tier at a given billing interval. */
export function monthlyPriceCents(
  tier: MembershipTier,
  interval: BillingInterval
): number {
  return interval === 'quarterly'
    ? tier.quarterlyMonthlyCents
    : tier.monthlyCents
}

/** What Stripe charges per billing period: 3 months up front, or 1 month. */
export function chargeCents(
  tier: MembershipTier,
  interval: BillingInterval
): number {
  return interval === 'quarterly'
    ? tier.quarterlyMonthlyCents * QUARTER_MONTHS
    : tier.monthlyCents
}

/** Whole-percent saving of the quarterly rate versus month-to-month. */
export function quarterlySavingsPercent(tier: MembershipTier): number {
  return Math.round((1 - tier.quarterlyMonthlyCents / tier.monthlyCents) * 100)
}

/** "$450" / "$1,250" — whole dollars, no cents. */
export function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}
