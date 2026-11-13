import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  offboardFromForkable,
  describeOffboardResult,
} from './forkable-offboard'

const m = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./airtable', () => ({
  Tables: { People: 'People' },
  findRecords: m.find,
  updateRecord: m.update,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('./forkable', () => ({ removeMemberFromForkable: m.remove }))

const person = (id: string, fields: Record<string, unknown>) => ({ id, fields })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  m.remove.mockResolvedValue({ success: true })
  m.update.mockResolvedValue({})
})

describe('offboardFromForkable', () => {
  it('removes a cancelled member and clears the checkbox', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Name: 'Ada', Status: 'Cancelled', 'In Forkable': true }),
    ])
    const result = await offboardFromForkable(' Ada@Example.com ')
    expect(result).toEqual({
      email: 'ada@example.com',
      outcome: 'removed',
      name: 'Ada',
    })
    expect(m.find.mock.calls[0][1]).toBe(
      "LOWER(TRIM({Email})) = 'ada@example.com'"
    )
    expect(m.remove).toHaveBeenCalledWith({
      email: 'ada@example.com',
      clubIds: undefined,
    })
    expect(m.update).toHaveBeenCalledWith('People', 'rec1', {
      'In Forkable': false,
    })
  })

  it.each(['Joined', 'Paused'])('keeps a %s member', async (Status) => {
    m.find.mockResolvedValue([person('rec1', { Status, Tier: 'Core' })])
    const result = await offboardFromForkable('ada@example.com')
    expect(result.outcome).toBe('skipped')
    expect(m.remove).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  it('keeps someone if any one of their records is still live', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Status: 'Cancelled', Tier: 'Program' }),
      person('rec2', { Status: 'Joined', Tier: 'Core' }),
    ])
    expect((await offboardFromForkable('ada@example.com')).outcome).toBe(
      'skipped'
    )
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('removes someone with no People record at all', async () => {
    m.find.mockResolvedValue([])
    expect(await offboardFromForkable('ghost@example.com')).toEqual({
      email: 'ghost@example.com',
      outcome: 'removed',
      name: undefined,
    })
    expect(m.update).not.toHaveBeenCalled()
  })

  it('only clears the checkbox on records that have it set', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Status: 'Cancelled', 'In Forkable': true }),
      person('rec2', { Status: 'Event Host' }),
    ])
    await offboardFromForkable('ada@example.com')
    expect(m.update).toHaveBeenCalledTimes(1)
    expect(m.update.mock.calls[0][1]).toBe('rec1')
  })

  it('leaves Airtable alone when Forkable refuses', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Status: 'Cancelled', 'In Forkable': true }),
    ])
    m.remove.mockResolvedValue({
      success: false,
      errors: ['HTTP 401: Unauthorized'],
    })
    expect(await offboardFromForkable('ada@example.com')).toEqual({
      email: 'ada@example.com',
      outcome: 'failed',
      errors: ['HTTP 401: Unauthorized'],
      name: undefined,
    })
    expect(m.update).not.toHaveBeenCalled()
  })

  it('still reports removed when clearing the checkbox fails', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Status: 'Cancelled', 'In Forkable': true }),
    ])
    m.update.mockRejectedValue(new Error('Airtable 403'))
    expect((await offboardFromForkable('ada@example.com')).outcome).toBe(
      'removed'
    )
  })

  describe('when Stripe reports the subscription ended', () => {
    const ended = { stripeSubscriptionEnded: true }

    it('removes a Stripe-billed member Airtable still shows as Joined', async () => {
      m.find.mockResolvedValue([
        person('rec1', { Status: 'Joined', Tier: 'Core' }),
      ])
      expect(
        (await offboardFromForkable('ada@example.com', ended)).outcome
      ).toBe('removed')
    })

    it('keeps a member who moved to a staff-managed tier', async () => {
      m.find.mockResolvedValue([
        person('rec1', { Status: 'Joined', Tier: 'Private Office' }),
      ])
      expect(
        (await offboardFromForkable('ada@example.com', ended)).outcome
      ).toBe('skipped')
      expect(m.remove).not.toHaveBeenCalled()
    })
  })

  it('fails on an empty email without calling anything', async () => {
    expect((await offboardFromForkable('  ')).outcome).toBe('failed')
    expect(m.find).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })
})

describe('describeOffboardResult', () => {
  it('points staff at the admin page when removal fails', () => {
    const text = describeOffboardResult({
      email: 'ada@example.com',
      outcome: 'failed',
      errors: ['boom'],
      name: 'Ada',
    })
    expect(text).toContain('Ada (ada@example.com)')
    expect(text).toContain('https://forkable.com/mc/admin/members')
    expect(text).toContain('boom')
  })
})
