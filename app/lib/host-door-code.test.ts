import { beforeEach, describe, expect, it, vi } from 'vitest'

const findRecords = vi.fn()
const getAccessUserCredentials = vi.fn()

vi.mock('./airtable', () => ({
  Tables: { Events: 'Events' },
  findRecords: (...args: unknown[]) => findRecords(...args),
}))
vi.mock('./verkada', () => ({
  getAccessUserCredentials: (...args: unknown[]) =>
    getAccessUserCredentials(...args),
}))

import {
  getHostDoorCode,
  getTodaysHostedEventIds,
  todaysApprovedEventsFormula,
} from './host-door-code'

beforeEach(() => {
  findRecords.mockReset()
  getAccessUserCredentials.mockReset()
  process.env.VERKADA_WEEKLY_ACCESS_USER_ID = 'weekly-user'
})

describe('todaysApprovedEventsFormula', () => {
  it('matches approved statuses on the Pacific date', () => {
    const f = todaysApprovedEventsFormula('2026-11-19')
    expect(f).toContain("{Status}='Confirmed'")
    expect(f).not.toContain('Idea')
    expect(f).toContain("SET_TIMEZONE({Start Date}, 'America/Los_Angeles')")
    expect(f).toContain("='2026-11-19'")
  })
})

describe('getTodaysHostedEventIds', () => {
  it('uses the Pacific date, not the UTC one', async () => {
    findRecords.mockResolvedValue([])
    // 01:14 UTC on Nov 20 is still Nov 19 in San Francisco
    await getTodaysHostedEventIds('recA', new Date('2026-11-20T01:14:00Z'))
    expect(findRecords.mock.calls[0][1]).toContain("='2026-11-19'")
  })

  it('keeps only events the user hosts', async () => {
    findRecords.mockResolvedValue([
      { id: 'evt1', fields: { 'Hosted by': ['recA', 'recB'] } },
      { id: 'evt2', fields: { 'Hosted by': ['recB'] } },
      { id: 'evt3', fields: {} },
    ])
    expect(await getTodaysHostedEventIds('recA')).toEqual(['evt1'])
  })
})

describe('getHostDoorCode', () => {
  it('skips Verkada entirely when the user hosts nothing today', async () => {
    findRecords.mockResolvedValue([])
    expect(await getHostDoorCode('recA')).toBeNull()
    expect(getAccessUserCredentials).not.toHaveBeenCalled()
  })

  it("returns the weekly code with the host's events", async () => {
    findRecords.mockResolvedValue([
      { id: 'evt1', fields: { 'Hosted by': ['recA'] } },
    ])
    getAccessUserCredentials.mockResolvedValue({ entryCode: '4821' })
    expect(await getHostDoorCode('recA')).toEqual({
      code: '4821',
      eventIds: ['evt1'],
    })
    expect(getAccessUserCredentials.mock.calls[0][0]).toBe('weekly-user')
  })

  it('returns null rather than throwing when Verkada fails', async () => {
    findRecords.mockResolvedValue([
      { id: 'evt1', fields: { 'Hosted by': ['recA'] } },
    ])
    getAccessUserCredentials.mockRejectedValue(new Error('down'))
    expect(await getHostDoorCode('recA')).toBeNull()
  })
})
