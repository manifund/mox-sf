import { describe, it, expect } from 'vitest'
import {
  isActiveMember,
  canIssueGuestDayPass,
  keepsForkableAccess,
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

describe('keepsForkableAccess', () => {
  it('keeps Joined and Paused members on any tier', () => {
    for (const status of ['Joined', 'Paused']) {
      for (const tier of ['Core', 'Resident', 'Program', 'Private Office', null]) {
        expect(keepsForkableAccess({ status, tier })).toBe(true)
      }
    }
  })

  it('drops every other status', () => {
    for (const status of ['Cancelled', 'Payment Issue', 'Invited', 'Visited', 'Event Host', null, undefined]) {
      expect(keepsForkableAccess({ status, tier: 'Program' })).toBe(false)
    }
  })

  it('always keeps Staff', () => {
    expect(keepsForkableAccess({ status: 'Cancelled', tier: 'Staff' })).toBe(true)
    expect(keepsForkableAccess({ status: null, tier: 'Staff' })).toBe(true)
  })
})
