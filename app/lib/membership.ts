export interface MembershipFields {
  status?: string | null
  tier?: string | null
}

// Courtesy = comped or paid outside Stripe (e.g. a year upfront by invoice).
// They are treated like Core members; Stripe state is never consulted here.
const ACTIVE_MEMBER_TIERS = [
  'Friend',
  'Core',
  'Resident',
  'Private Office',
  'Program',
  'Guest Program',
  'Volunteer',
  'Courtesy',
] as const

const GUEST_PASS_ISSUING_TIERS = [
  'Friend',
  'Core',
  'Resident',
  'Private Office',
  'Volunteer',
  'Courtesy',
] as const

export function isActiveMember({ status, tier }: MembershipFields): boolean {
  if (tier === 'Staff') return true
  if (status !== 'Joined' || !tier) return false
  return (ACTIVE_MEMBER_TIERS as readonly string[]).includes(tier)
}

export function canIssueGuestDayPass({ status, tier }: MembershipFields): boolean {
  if (tier === 'Staff') return true
  if (status !== 'Joined' || !tier) return false
  return (GUEST_PASS_ISSUING_TIERS as readonly string[]).includes(tier)
}

// Meals follow the membership: someone keeps their Forkable club while the
// membership is live or paused, and loses it once it has ended.
const FORKABLE_KEEP_STATUSES = ['Joined', 'Paused'] as const

// Tiers billed through a Stripe subscription. Every other tier (Program,
// Private Office, Courtesy, Volunteer, ...) is managed by staff in Airtable.
const STRIPE_BILLED_TIERS = ['Friend', 'Core', 'Resident'] as const

/**
 * Whether this People record still entitles the person to their Forkable club.
 *
 * `stripeSubscriptionEnded` is for the moment Stripe reports that a
 * subscription is gone: Airtable is updated by hand and still says "Joined",
 * so a Stripe-billed record no longer counts. A record on a staff-managed tier
 * still does (e.g. a Core member who moved into a Private Office).
 */
export function keepsForkableAccess(
  { status, tier }: MembershipFields,
  { stripeSubscriptionEnded = false }: { stripeSubscriptionEnded?: boolean } = {}
): boolean {
  if (tier === 'Staff') return true
  if (!status || !(FORKABLE_KEEP_STATUSES as readonly string[]).includes(status)) {
    return false
  }
  if (stripeSubscriptionEnded) {
    return !!tier && !(STRIPE_BILLED_TIERS as readonly string[]).includes(tier)
  }
  return true
}
