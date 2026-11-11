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
