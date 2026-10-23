import { describe, expect, it } from 'vitest'
import {
  GUEST_PASS_MAX_UNLOCKS,
  guestPassState,
  isIssuableDate,
  passWindow,
  remainingThisWeek,
  unlockBlocker,
  weekBounds,
  weeklyGuestPassAllowance,
} from './guest-passes'

describe('weeklyGuestPassAllowance', () => {
  it('maps tiers for joined members', () => {
    expect(weeklyGuestPassAllowance({ status: 'Joined', tier: 'Core' })).toBe(2)
    expect(
      weeklyGuestPassAllowance({ status: 'Joined', tier: 'Resident' })
    ).toBe(4)
    expect(
      weeklyGuestPassAllowance({ status: 'Joined', tier: 'Private Office' })
    ).toBe(6)
    expect(
      weeklyGuestPassAllowance({ status: 'Joined', tier: 'Volunteer' })
    ).toBe(2)
  })

  it('gives staff unlimited passes regardless of status', () => {
    expect(weeklyGuestPassAllowance({ status: null, tier: 'Staff' })).toBeNull()
  })

  it('gives nothing to paused, cancelled, or tierless people', () => {
    expect(weeklyGuestPassAllowance({ status: 'Paused', tier: 'Core' })).toBe(0)
    expect(
      weeklyGuestPassAllowance({ status: 'Cancelled', tier: 'Resident' })
    ).toBe(0)
    expect(weeklyGuestPassAllowance({ status: 'Joined', tier: null })).toBe(0)
    expect(weeklyGuestPassAllowance({ status: 'Joined', tier: 'Friend' })).toBe(
      0
    )
  })
})

describe('weekBounds', () => {
  it('runs Monday to Sunday', () => {
    // 2026-10-14 is a Wednesday.
    expect(weekBounds('2026-10-14')).toEqual({
      start: '2026-10-12',
      end: '2026-10-18',
    })
    expect(weekBounds('2026-10-18')).toEqual({
      start: '2026-10-12',
      end: '2026-10-18',
    })
    expect(weekBounds('2026-10-19')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    })
  })
})

describe('passWindow', () => {
  it('opens 8am and closes 11pm Pacific, respecting DST', () => {
    const oct = passWindow('2026-10-14') // PDT, UTC-7
    expect(oct.start.toISOString()).toBe('2026-10-14T15:00:00.000Z')
    expect(oct.end.toISOString()).toBe('2026-10-15T06:00:00.000Z')
    const jan = passWindow('2026-01-14') // PST, UTC-8
    expect(jan.start.toISOString()).toBe('2026-01-14T16:00:00.000Z')
  })
})

describe('isIssuableDate', () => {
  const now = new Date('2026-10-14T20:00:00Z') // 1pm PDT Oct 14
  it('allows today through seven days out', () => {
    expect(isIssuableDate('2026-10-14', now)).toBe(true)
    expect(isIssuableDate('2026-10-21', now)).toBe(true)
  })
  it('rejects the past, too far ahead, and junk', () => {
    expect(isIssuableDate('2026-10-13', now)).toBe(false)
    expect(isIssuableDate('2026-10-22', now)).toBe(false)
    expect(isIssuableDate('tomorrow', now)).toBe(false)
  })
  it('uses the Pacific date, not UTC', () => {
    // 11:30pm PDT Oct 14 is already Oct 15 in UTC.
    const late = new Date('2026-10-15T06:30:00Z')
    expect(isIssuableDate('2026-10-14', late)).toBe(true)
  })
})

describe('guestPassState and unlockBlocker', () => {
  const pass = { status: 'Unused', validDate: '2026-10-14', unlockCount: 0 }
  it('is upcoming before 8am, active during the day, expired after 11pm', () => {
    expect(guestPassState(pass, new Date('2026-10-14T14:00:00Z'))).toBe(
      'upcoming'
    )
    expect(guestPassState(pass, new Date('2026-10-14T20:00:00Z'))).toBe(
      'active'
    )
    expect(guestPassState(pass, new Date('2026-10-15T06:30:00Z'))).toBe(
      'expired'
    )
  })
  it('revoked wins over everything', () => {
    expect(
      guestPassState(
        { ...pass, status: 'Revoked' },
        new Date('2026-10-14T20:00:00Z')
      )
    ).toBe('revoked')
  })
  it('blocks unlocks outside the window, when revoked, or past the cap', () => {
    const during = new Date('2026-10-14T20:00:00Z')
    expect(unlockBlocker(pass, during)).toBeNull()
    expect(unlockBlocker(pass, new Date('2026-10-14T14:00:00Z'))).toBe(
      'not-yet'
    )
    expect(unlockBlocker(pass, new Date('2026-10-16T00:00:00Z'))).toBe(
      'expired'
    )
    expect(unlockBlocker({ ...pass, status: 'Revoked' }, during)).toBe(
      'revoked'
    )
    expect(
      unlockBlocker({ ...pass, unlockCount: GUEST_PASS_MAX_UNLOCKS }, during)
    ).toBe('limit')
  })
})

describe('remainingThisWeek', () => {
  it('counts down and never goes negative', () => {
    expect(remainingThisWeek(4, 1)).toBe(3)
    expect(remainingThisWeek(2, 5)).toBe(0)
    expect(remainingThisWeek(null, 99)).toBeNull()
  })
})
