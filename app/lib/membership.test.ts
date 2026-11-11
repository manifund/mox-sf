import { describe, it, expect } from 'vitest'
import { isActiveMember, canIssueGuestDayPass } from './membership'

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

  it('accepts Joined paying tiers and Volunteer', () => {
    for (const tier of ['Friend', 'Core', 'Resident', 'Private Office', 'Volunteer']) {
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
    for (const tier of ['Courtesy', 'Paused']) {
      expect(canIssueGuestDayPass({ status: 'Joined', tier })).toBe(false)
    }
  })
})
