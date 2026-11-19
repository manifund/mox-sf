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

// Fellowship and guest-program members share one Verkada guest identity, and
// the portal shows them its code. Mirrors isGuestProgram in VerkadaPin.tsx.
const SHARED_GUEST_CODE_TIERS = ['Program', 'Guest Program'] as const

export function canSeeSharedGuestCode({ status, tier }: MembershipFields): boolean {
  if (!tier || !isActiveMember({ status, tier })) return false
  return (SHARED_GUEST_CODE_TIERS as readonly string[]).includes(tier)
}

export function canIssueGuestDayPass({ status, tier }: MembershipFields): boolean {
  if (tier === 'Staff') return true
  if (status !== 'Joined' || !tier) return false
  return (GUEST_PASS_ISSUING_TIERS as readonly string[]).includes(tier)
}
