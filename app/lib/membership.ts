import { CORE_PROMO_TRIAL_END } from './membership-pricing'

export interface MembershipFields {
  status?: string | null
  tier?: string | null
}

export interface DoorAccessFields extends MembershipFields {
  tags?: readonly string[] | null
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

// End-of-2026 promo: lapsed members were invited back for free until the same
// moment the Core free trial ends. Staff put them in the "Free through 2026"
// Verkada group and tagged them in Airtable, but their Status stays Paused or
// Cancelled (the Stripe sync would undo a hand edit to Joined). The tag alone
// gets them their door code in the portal, and stops by itself on Jan 1.
export const FREE_THRU_2026_LAPSED_TAG = 'Free Thru 2026: lapsed'

export function hasFreeThru2026Access(
  tags: readonly string[] | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (nowMs >= CORE_PROMO_TRIAL_END * 1000) return false
  return !!tags?.includes(FREE_THRU_2026_LAPSED_TAG)
}

// Who the portal's door-access box works for: active members, plus lapsed
// members on the free-through-2026 offer. Everything else that asks "is this
// a member?" (guest passes, studio, member pricing) still uses isActiveMember.
export function canUseDoor(
  { status, tier, tags }: DoorAccessFields,
  nowMs: number = Date.now()
): boolean {
  return isActiveMember({ status, tier }) || hasFreeThru2026Access(tags, nowMs)
}
