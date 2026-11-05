// Rules for member-issued guest passes: weekly allowances by tier, the
// Monday-to-Sunday Pacific week they count against, and the hours a guest's
// door code works. Pure functions only; Airtable and Verkada calls live in
// guest-passes-server.ts. See docs/workflows/member-guest-passes.md.

import { fromZonedTime } from 'date-fns-tz'
import { MOX_TZ, addDays, mondayOf, ptDateString } from './checkins'
import type { MembershipFields } from './membership'

export const GUEST_PASS_TYPE = 'Guest Pass'
export const GUEST_PASS_START_HOUR = 8 // 8am Pacific
export const GUEST_PASS_END_HOUR = 23 // 11pm Pacific
export const GUEST_PASS_MAX_DAYS_AHEAD = 7
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

/**
 * The instants between which a pass dated `validDate` works. The guest's
 * Verkada access user gets exactly this start and end, so the keypad
 * enforces it without us.
 */
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

/**
 * Whether a pass can still be revoked: only while its code could still open
 * the door. Once the day is over the pass is a record of a visit, not a key.
 */
export function canRevokeGuestPass(
  pass: GuestPassLike,
  now: Date = new Date()
): boolean {
  const state = guestPassState(pass, now)
  return state === 'active' || state === 'upcoming'
}

/**
 * How a guest appears in Verkada Command: their own name, marked as a guest
 * of the host so staff can tell these short-lived users from members.
 */
export function verkadaGuestName(
  guestName: string,
  hostFirstName: string
): { firstName: string; lastName: string } {
  const parts = guestName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] || 'Guest'
  const rest = parts.slice(1).join(' ')
  const tag = hostFirstName ? `(guest of ${hostFirstName})` : '(guest)'
  return { firstName, lastName: rest ? `${rest} ${tag}` : tag }
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
  /** Keypad code, present while the pass is upcoming or active. */
  code: string | null
  /** Accepted keypad entries, filled in after the pass day ends. */
  unlockCount: number
  firstUsedAt: string | null
}
