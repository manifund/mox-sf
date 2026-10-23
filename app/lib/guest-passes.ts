// Rules for member-issued guest passes: weekly allowances by tier, the
// Monday-to-Sunday Pacific week they count against, and the hours a pass
// opens the door. Pure functions only; Airtable and Verkada calls live in the
// API routes. See docs/workflows/member-guest-passes.md.

import { fromZonedTime } from 'date-fns-tz'
import { MOX_TZ, addDays, mondayOf, ptDateString } from './checkins'
import type { MembershipFields } from './membership'

export const GUEST_PASS_TYPE = 'Guest Pass'
export const GUEST_PASS_START_HOUR = 8 // 8am Pacific
export const GUEST_PASS_END_HOUR = 23 // 11pm Pacific
export const GUEST_PASS_MAX_DAYS_AHEAD = 7
export const GUEST_PASS_MAX_UNLOCKS = 10
export const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9]{12}$/

/** Passes per Monday-to-Sunday week. `null` means unlimited. */
export const WEEKLY_GUEST_PASS_ALLOWANCE: Record<string, number | null> = {
  Staff: null,
  Core: 2,
  Resident: 4,
  'Private Office': 6,
  Volunteer: 2,
}

/**
 * Weekly allowance for a member. Staff are unlimited regardless of status;
 * everyone else must have Status "Joined" and a tier with an allowance.
 */
export function weeklyGuestPassAllowance({
  status,
  tier,
}: MembershipFields): number | null {
  if (tier === 'Staff') return null
  if (status !== 'Joined' || !tier) return 0
  const allowance = WEEKLY_GUEST_PASS_ALLOWANCE[tier]
  return allowance === undefined ? 0 : allowance
}

/** Monday and Sunday (inclusive, yyyy-MM-dd) of the week containing `date`. */
export function weekBounds(date: string): { start: string; end: string } {
  const start = mondayOf(date)
  return { start, end: addDays(start, 6) }
}

/** Today's date in Pacific time, yyyy-MM-dd. */
export function todayPT(now: Date = new Date()): string {
  return ptDateString(now)
}

/** The instants between which a pass dated `validDate` opens the door. */
export function passWindow(validDate: string): { start: Date; end: Date } {
  const hh = (h: number) => String(h).padStart(2, '0')
  return {
    start: fromZonedTime(
      `${validDate}T${hh(GUEST_PASS_START_HOUR)}:00:00`,
      MOX_TZ
    ),
    end: fromZonedTime(`${validDate}T${hh(GUEST_PASS_END_HOUR)}:00:00`, MOX_TZ),
  }
}

/** Whether a member may issue a pass for `validDate` today. */
export function isIssuableDate(
  validDate: string,
  now: Date = new Date()
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validDate)) return false
  const today = todayPT(now)
  const latest = addDays(today, GUEST_PASS_MAX_DAYS_AHEAD)
  return validDate >= today && validDate <= latest
}

export type GuestPassState = 'upcoming' | 'active' | 'expired' | 'revoked'

export interface GuestPassLike {
  status: string | null
  validDate: string
}

/** Where a pass is in its lifecycle right now. */
export function guestPassState(
  pass: GuestPassLike,
  now: Date = new Date()
): GuestPassState {
  if (pass.status === 'Revoked') return 'revoked'
  const { start, end } = passWindow(pass.validDate)
  if (now > end) return 'expired'
  if (now < start) return 'upcoming'
  return 'active'
}

/** Why a pass can't open the door right now, or null if it can. */
export function unlockBlocker(
  pass: GuestPassLike & { unlockCount: number },
  now: Date = new Date()
): 'revoked' | 'expired' | 'not-yet' | 'limit' | null {
  const state = guestPassState(pass, now)
  if (state === 'revoked') return 'revoked'
  if (state === 'expired') return 'expired'
  if (state === 'upcoming') return 'not-yet'
  if (pass.unlockCount >= GUEST_PASS_MAX_UNLOCKS) return 'limit'
  return null
}

/** Passes left this week given the allowance and passes already dated in it. */
export function remainingThisWeek(
  allowance: number | null,
  issuedThisWeek: number
): number | null {
  if (allowance === null) return null
  return Math.max(0, allowance - issuedThisWeek)
}

export interface GuestPassSummary {
  id: string
  token: string
  guestName: string
  guestEmail: string
  validDate: string
  state: GuestPassState
  unlockCount: number
  firstUsedAt: string | null
}
