// Single source of truth for membership pricing shown on /join and
// /renew and transacted by /api/membership-checkout.
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
  // The Stripe Product every Price for this tier lives under. The webhook and
  // the active-members page derive tier from product, so Prices must stay here.
  stripeProductId: string
  stripeLookupKeys: Record<BillingInterval, string>
}

export const TRIAL_DAYS = 7
export const QUARTER_MONTHS = 3

// End-of-2026 promo: Core sign-ups are free until midnight Pacific going into
// Jan 1, 2027 (08:00 UTC), however late in the year they join. Other tiers,
// and Core sign-ups once the date has passed, get the usual TRIAL_DAYS.
export const CORE_PROMO_TRIAL_END = Date.UTC(2027, 0, 1, 8) / 1000
// Stripe Checkout refuses a trial_end less than 48 hours away; keep an hour
// of slack so a session created near the cutoff isn't rejected.
const MIN_CHECKOUT_TRIAL_MS = 49 * 60 * 60 * 1000

/**
 * Whether Core sign-ups currently get the free-through-Dec-31 trial. Site copy
 * uses this too, so the wording flips back to the usual trial at the same
 * moment checkout does.
 */
export function corePromoTrialActive(nowMs: number = Date.now()): boolean {
  return CORE_PROMO_TRIAL_END * 1000 - nowMs >= MIN_CHECKOUT_TRIAL_MS
}

/** Trial settings for a new membership's Stripe Checkout subscription. */
export function checkoutTrial(
  tierId: MembershipTierId,
  nowMs: number = Date.now()
): { trial_end: number } | { trial_period_days: number } {
  if (tierId === 'core' && corePromoTrialActive(nowMs)) {
    return { trial_end: CORE_PROMO_TRIAL_END }
  }
  return { trial_period_days: TRIAL_DAYS }
}

// Legacy Friend product. It has no tier here because nobody can sign up for
// it any more, but paused Friend subscriptions still exist and can be resumed.
const FRIEND_PRODUCT_ID = 'prod_Rq9VzfM9QoJwPD'

/**
 * Extra Stripe update params for resuming a paused subscription from the
 * portal. During the free-through-2026 promo a resumed Core or Friend
 * subscription goes onto the same free trial as everyone else, so coming back
 * never charges anyone before Jan 1, 2027. Without this, clearing the pause
 * leaves the old billing date in place and Stripe charges full price on it.
 * Other products, and resumes after the promo, get nothing extra.
 */
export function promoResumeTrial(
  productId: string | null | undefined,
  nowMs: number = Date.now()
): { trial_end: number; proration_behavior: 'none' } | Record<string, never> {
  if (nowMs >= CORE_PROMO_TRIAL_END * 1000) return {}
  if (productId !== CORE_PRODUCT_ID && productId !== FRIEND_PRODUCT_ID) return {}
  return { trial_end: CORE_PROMO_TRIAL_END, proration_behavior: 'none' }
}

const CORE_PRODUCT_ID = 'prod_RpkYg9EMJoi5oi'

export const MEMBERSHIP_TIERS: Record<MembershipTierId, MembershipTier> = {
  core: {
    id: 'core',
    name: 'Core',
    quarterlyMonthlyCents: 45000,
    monthlyCents: 59500,
    stripeProductId: CORE_PRODUCT_ID,
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
    stripeProductId: 'prod_RpkufjD9E3esG5',
    stripeLookupKeys: {
      quarterly: 'membership_resident_quarterly',
      monthly: 'membership_resident_monthly',
    },
  },
}

// Private offices are quoted by headcount and handled by hand rather than
// through checkout. The standard rate is per person per month on a 90-day
// rolling contract: billed monthly, with OFFICE_NOTICE_MONTHS months' notice
// before moving out, plus a deposit. OFFICE_SIZES is the grid /offices shows.
// Month-to-month (no notice commitment) costs a flat markup; teams doing
// mission-aligned work get a flat discount.
export const OFFICE_PER_PERSON_MONTHLY_CENTS = 125000
export const OFFICE_CONTACT_EMAIL = 'robin@moxsf.com'
// Stripe's email-verified customer-portal login, where members change tier,
// switch billing interval, update cards, or cancel.
export const STRIPE_BILLING_LOGIN_URL =
  'https://billing.stripe.com/p/login/5kAbIOdVF0Oa1vq6oo'
// Airtable "Mox | New Office - EOI" form; submissions land in the Orgs table.
export const OFFICE_EOI_FORM_URL =
  'https://airtable.com/appkHZ2UvU6SouT5y/pagUHw8dM9CX2W6h1/form'
export const OFFICE_NOTICE_MONTHS = 3
export const OFFICE_DEPOSIT_MONTHS = 1
export const OFFICE_MONTH_TO_MONTH_MARKUP_PERCENT = 25
export const OFFICE_MISSION_ALIGNED_DISCOUNT_PERCENT = 20

export interface OfficeSize {
  people: number
  // Standard monthly rate on the 90-day rolling contract.
  standardMonthlyCents: number
}

export const OFFICE_SIZES: OfficeSize[] = [4, 5, 6, 8].map((people) => ({
  people,
  standardMonthlyCents: people * OFFICE_PER_PERSON_MONTHLY_CENTS,
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

/** The tier whose Stripe Product this is, or null for Friend/day-pass/etc. */
export function tierFromStripeProductId(
  productId: string | null | undefined
): MembershipTier | null {
  if (!productId) return null
  return (
    Object.values(MEMBERSHIP_TIERS).find((t) => t.stripeProductId === productId) ??
    null
  )
}

/** The other billing interval. */
export function otherInterval(interval: BillingInterval): BillingInterval {
  return interval === 'quarterly' ? 'monthly' : 'quarterly'
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
