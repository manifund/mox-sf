import { describe, expect, it } from 'vitest'
import {
  addDays,
  diffDays,
  mondayOf,
  summarizeAttendance,
  type CheckIn,
} from './checkins'

function checkIn(personId: string, date: string): CheckIn {
  return { personId, date, firstSeen: null, lastSeen: null }
}

describe('addDays', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDays('2026-07-05', 1)).toBe('2026-07-06')
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('diffDays', () => {
  it('computes whole-day differences', () => {
    expect(diffDays('2026-07-01', '2026-07-05')).toBe(4)
    expect(diffDays('2026-07-05', '2026-07-05')).toBe(0)
    expect(diffDays('2026-07-05', '2026-07-01')).toBe(-4)
    expect(diffDays('2026-06-30', '2026-07-01')).toBe(1)
  })
})

describe('mondayOf', () => {
  it('returns the Monday of the containing week', () => {
    // 2026-07-05 is a Sunday; its week started Monday 2026-06-29.
    expect(mondayOf('2026-07-05')).toBe('2026-06-29')
    // 2026-07-06 is a Monday.
    expect(mondayOf('2026-07-06')).toBe('2026-07-06')
    // 2026-07-08 is a Wednesday.
    expect(mondayOf('2026-07-08')).toBe('2026-07-06')
  })
})

describe('summarizeAttendance', () => {
  const today = '2026-07-08' // Wednesday; week started Monday 2026-07-06

  it('returns an empty summary for people with no check-ins', () => {
    const summaries = summarizeAttendance(['a'], [], today)
    expect(summaries.get('a')).toEqual({
      dates: [],
      lastSeen: null,
      daysSinceSeen: null,
      daysThisWeek: 0,
      daysLast4Weeks: 0,
    })
  })

  it('counts days this week and in the last 4 weeks', () => {
    const checkIns = [
      checkIn('a', '2026-07-08'), // today (Wed, this week)
      checkIn('a', '2026-07-06'), // Monday, this week
      checkIn('a', '2026-07-03'), // last week
      checkIn('a', '2026-06-11'), // 27 days ago, inside 28-day window
      checkIn('a', '2026-06-10'), // 28 days ago, outside window
    ]
    const summary = summarizeAttendance(['a'], checkIns, today).get('a')!
    expect(summary.daysThisWeek).toBe(2)
    expect(summary.daysLast4Weeks).toBe(4)
    expect(summary.lastSeen).toBe('2026-07-08')
    expect(summary.daysSinceSeen).toBe(0)
  })

  it('deduplicates multiple check-ins on the same day', () => {
    const checkIns = [checkIn('a', '2026-07-07'), checkIn('a', '2026-07-07')]
    const summary = summarizeAttendance(['a'], checkIns, today).get('a')!
    expect(summary.dates).toEqual(['2026-07-07'])
    expect(summary.daysThisWeek).toBe(1)
    expect(summary.daysSinceSeen).toBe(1)
  })

  it('ignores check-ins for people not in the list', () => {
    const summaries = summarizeAttendance(
      ['a'],
      [checkIn('b', '2026-07-07')],
      today
    )
    expect(summaries.get('a')!.dates).toEqual([])
    expect(summaries.has('b')).toBe(false)
  })

  it('reports days since last seen', () => {
    const summary = summarizeAttendance(
      ['a'],
      [checkIn('a', '2026-06-30')],
      today
    ).get('a')!
    expect(summary.lastSeen).toBe('2026-06-30')
    expect(summary.daysSinceSeen).toBe(8)
    expect(summary.daysThisWeek).toBe(0)
  })
})
