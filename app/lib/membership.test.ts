import { describe, it, expect } from 'vitest'
import {
  isActiveMember,
  canIssueGuestDayPass,
  canUseDoor,
  hasFreeThru2026Access,
  FREE_THRU_2026_LAPSED_TAG,
} from './membership'

describe('isActiveMember', () => {
  it('lets Staff through regardless of status', () => {
    expect(isActiveMember({ status: 'Applied', tier: 'Staff' })).toBe(true)
    expect(isActiveMember({ status: null, tier: 'Staff' })).toBe(true)
  })

  it('accepts Joined paying tiers', () => {
    for (const tier of ['Friend', 'Core', 'Resident', 'Private Office']) {
      expect(isActiveMember({ status: 'Joined', tier })).toBe(true)
    }
  })

  it('accepts Joined Program, Guest Program, and Volunteer', () => {
    expect(isActiveMember({ status: 'Joined', tier: 'Program' })).toBe(true)
    expect(isActiveMember({ status: 'Joined', tier: 'Guest Program' })).toBe(true)
    expect(isActiveMember({ status: 'Joined', tier: 'Volunteer' })).toBe(true)
  })

  it('accepts Joined Courtesy (comped or paid outside Stripe)', () => {
    expect(isActiveMember({ status: 'Joined', tier: 'Courtesy' })).toBe(true)
    expect(isActiveMember({ status: 'Paused', tier: 'Courtesy' })).toBe(false)
  })

  it('rejects non-Joined statuses for non-Staff', () => {
    for (const status of ['Applied', 'Invited', 'Cancelled', 'Paused', null]) {
      expect(isActiveMember({ status, tier: 'Core' })).toBe(false)
    }
  })

  it('rejects inactive tiers even when Joined', () => {
    for (const tier of ['Paused', null, undefined]) {
      expect(isActiveMember({ status: 'Joined', tier })).toBe(false)
    }
  })
})

describe('canIssueGuestDayPass', () => {
  it('lets Staff through', () => {
    expect(canIssueGuestDayPass({ status: 'Applied', tier: 'Staff' })).toBe(true)
  })

  it('accepts Joined paying tiers, Volunteer, and Courtesy', () => {
    for (const tier of ['Friend', 'Core', 'Resident', 'Private Office', 'Volunteer', 'Courtesy']) {
      expect(canIssueGuestDayPass({ status: 'Joined', tier })).toBe(true)
    }
  })

  it('rejects Program and Guest Program (non-paying)', () => {
    expect(canIssueGuestDayPass({ status: 'Joined', tier: 'Program' })).toBe(false)
    expect(canIssueGuestDayPass({ status: 'Joined', tier: 'Guest Program' })).toBe(false)
  })

  it('rejects inactive statuses', () => {
    for (const status of ['Applied', 'Cancelled', 'Paused', null]) {
      expect(canIssueGuestDayPass({ status, tier: 'Core' })).toBe(false)
    }
  })

  it('rejects inactive tiers', () => {
    expect(canIssueGuestDayPass({ status: 'Joined', tier: 'Paused' })).toBe(false)
    expect(canIssueGuestDayPass({ status: 'Paused', tier: 'Courtesy' })).toBe(false)
  })
})

describe('free-through-2026 door access for lapsed members', () => {
  const duringPromo = Date.UTC(2026, 11, 15)
  const lastMinute = Date.UTC(2027, 0, 1, 7, 59) // 11:59pm Pacific, Dec 31
  const afterPromo = Date.UTC(2027, 0, 1, 8) // midnight Pacific, Jan 1
  const tags = ['form', FREE_THRU_2026_LAPSED_TAG]

  it('gives tagged lapsed members the door without making them active members', () => {
    for (const status of ['Paused', 'Cancelled', 'Cancelled ', 'Payment Issue']) {
      const member = { status, tier: 'Core', tags }
      expect(canUseDoor(member, duringPromo)).toBe(true)
      expect(isActiveMember(member)).toBe(false)
      expect(canIssueGuestDayPass(member)).toBe(false)
    }
  })

  it('works whatever the Tier says, including junk values and blank', () => {
    for (const tier of ['Paused', 'Canceled', null]) {
      expect(canUseDoor({ status: 'Paused', tier, tags }, duringPromo)).toBe(true)
    }
  })

  it('ends at midnight Pacific going into Jan 1, 2027', () => {
    expect(hasFreeThru2026Access(tags, lastMinute)).toBe(true)
    expect(hasFreeThru2026Access(tags, afterPromo)).toBe(false)
    expect(canUseDoor({ status: 'Paused', tier: 'Core', tags }, afterPromo)).toBe(false)
  })

  it('does nothing for lapsed members without the tag', () => {
    expect(canUseDoor({ status: 'Paused', tier: 'Core', tags: ['form'] }, duringPromo)).toBe(false)
    expect(canUseDoor({ status: 'Cancelled', tier: 'Core', tags: null }, duringPromo)).toBe(false)
    expect(canUseDoor({ status: 'Cancelled', tier: 'Core' }, duringPromo)).toBe(false)
  })

  it('keeps active members in after the promo ends, tagged or not', () => {
    expect(canUseDoor({ status: 'Joined', tier: 'Core', tags }, afterPromo)).toBe(true)
    expect(canUseDoor({ status: 'Joined', tier: 'Core' }, afterPromo)).toBe(true)
  })
})
