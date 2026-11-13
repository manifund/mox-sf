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

/** Whether this People record still entitles the person to their Forkable club. */
export function keepsForkableAccess({ status, tier }: MembershipFields): boolean {
  if (tier === 'Staff') return true
  return !!status && (FORKABLE_KEEP_STATUSES as readonly string[]).includes(status)
}

/**
 * Whether this status means the membership is over. Deliberately narrower
 * than "not Joined or Paused": Invited, Applied, Payment Issue and the like
 * are not an ended membership. Airtable has two "Cancelled" options, one with
 * a trailing space.
 */
export function hasEndedMembership(status: string | null | undefined): boolean {
  return status?.trim() === 'Cancelled'
}
