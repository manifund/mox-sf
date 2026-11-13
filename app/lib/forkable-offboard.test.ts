import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  offboardFromForkable,
  findEndedMembersInForkable,
  offboardEndedMembers,
  describeOffboardRun,
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

  it('fails on an empty email without calling anything', async () => {
    expect((await offboardFromForkable('  ')).outcome).toBe('failed')
    expect(m.find).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })
})

describe('findEndedMembersInForkable', () => {
  it('asks Airtable for cancelled people marked In Forkable, one email each', async () => {
    m.find.mockResolvedValue([
      person('rec1', { Email: 'Ada@Example.com ', Status: 'Cancelled' }),
      person('rec2', { Email: 'ada@example.com', Status: 'Cancelled ' }),
      person('rec3', { Email: 'bob@example.com', Status: 'Cancelled' }),
      person('rec4', { Email: 'eve@example.com', Status: 'Joined' }),
      person('rec5', { Status: 'Cancelled' }),
    ])
    expect(await findEndedMembersInForkable()).toEqual([
      'ada@example.com',
      'bob@example.com',
    ])
    expect(m.find.mock.calls[0][1]).toContain('{In Forkable}')
    expect(m.find.mock.calls[0][1]).toContain("'Cancelled'")
  })
})

describe('offboardEndedMembers', () => {
  const cancelled = (email: string, extra: Record<string, unknown> = {}) =>
    person(`rec-${email}`, {
      Email: email,
      Status: 'Cancelled',
      'In Forkable': true,
      ...extra,
    })
  // First call lists the candidates; later calls look one person up by email.
  const airtable = (people: ReturnType<typeof person>[]) =>
    m.find.mockImplementation(async (_table: string, formula: string) =>
      formula.includes('{In Forkable}')
        ? people
        : people.filter((p) => formula.includes(`'${p.fields.Email}'`))
    )

  it('removes every cancelled member and reports the run', async () => {
    airtable([cancelled('a@example.com'), cancelled('b@example.com')])
    const run = await offboardEndedMembers({ limit: 10 })
    expect(run.candidates).toBe(2)
    expect(run.results.map((r) => r.outcome)).toEqual(['removed', 'removed'])
    expect(run.stopped).toBeUndefined()
    expect(m.update).toHaveBeenCalledTimes(2)
  })

  it('stops at the first person when Forkable rejects the request itself', async () => {
    airtable([
      cancelled('a@example.com'),
      cancelled('b@example.com'),
      cancelled('c@example.com'),
    ])
    m.remove.mockResolvedValue({
      success: false,
      errors: ['unknown field'],
      rejectedBySchema: true,
      apiHints: ['mutation endMembership(input: EndMembershipInput!)'],
    })
    const run = await offboardEndedMembers({ limit: 10 })
    expect(m.remove).toHaveBeenCalledTimes(1)
    expect(run.results).toHaveLength(1)
    expect(run.stopped).toContain('does not accept')
    expect(run.results[0]).toMatchObject({
      apiHints: ['mutation endMembership(input: EndMembershipInput!)'],
    })
  })

  it('stops after three failures in a row, but not for scattered ones', async () => {
    const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) =>
      cancelled(`${n}@example.com`)
    )
    airtable(people)
    m.remove
      .mockResolvedValueOnce({ success: false, errors: ['x'] })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: false, errors: ['HTTP 401: Unauthorized'] })
    const run = await offboardEndedMembers({ limit: 10 })
    expect(run.results.map((r) => r.outcome)).toEqual([
      'failed',
      'removed',
      'failed',
      'failed',
      'failed',
    ])
    expect(run.stopped).toContain('3 removals failed in a row')
  })

  it('does not stop for people Forkable refuses individually', async () => {
    const people = ['a', 'b', 'c', 'd', 'e'].map((n) =>
      cancelled(`${n}@example.com`)
    )
    airtable(people)
    m.remove
      .mockResolvedValueOnce({
        success: false,
        errors: ['Not a member'],
        refusedForMember: true,
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Not a member'],
        refusedForMember: true,
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Not a member'],
        refusedForMember: true,
      })
      .mockResolvedValue({ success: true })
    const run = await offboardEndedMembers({ limit: 10 })
    expect(run.results.map((r) => r.outcome)).toEqual([
      'failed',
      'failed',
      'failed',
      'removed',
      'removed',
    ])
    expect(run.stopped).toBeUndefined()
  })

  it('keeps going when one lookup throws, and respects the per-run limit', async () => {
    const people = ['a', 'b', 'c'].map((n) => cancelled(`${n}@example.com`))
    let lookups = 0
    m.find.mockImplementation(async (_table: string, formula: string) => {
      if (formula.includes('{In Forkable}')) return people
      if (++lookups === 1) throw new Error('Airtable 503')
      return people.filter((p) => formula.includes(`'${p.fields.Email}'`))
    })
    const run = await offboardEndedMembers({ limit: 2 })
    expect(run.candidates).toBe(3)
    expect(run.results.map((r) => r.outcome)).toEqual(['failed', 'removed'])
    expect(run.stopped).toContain('limit of 2')
  })
})

describe('describeOffboardRun', () => {
  it('says nothing when nobody was removed and nothing failed', () => {
    expect(describeOffboardRun({ candidates: 0, results: [] })).toBeNull()
    expect(
      describeOffboardRun({
        candidates: 1,
        results: [
          { email: 'a@example.com', outcome: 'skipped', reason: 'Joined' },
        ],
      })
    ).toBeNull()
  })

  it('lists who was removed', () => {
    const text = describeOffboardRun({
      candidates: 2,
      results: [
        { email: 'a@example.com', outcome: 'removed', name: 'Ada' },
        { email: 'b@example.com', outcome: 'removed' },
      ],
    })
    expect(text).toContain('2 removed')
    expect(text).toContain('Removed: Ada, b@example.com')
  })

  it("includes Forkable's operations when the request was rejected", () => {
    const text = describeOffboardRun({
      candidates: 5,
      stopped: 'Forkable does not accept the removal request',
      results: [
        {
          email: 'a@example.com',
          outcome: 'failed',
          errors: ['unknown field'],
          rejectedBySchema: true,
          apiHints: [
            'mutation endMembership(input: EndMembershipInput!) { membershipId: ID! }',
          ],
        },
      ],
    })!
    expect(text).toContain('Stopped early')
    expect(text).toContain('unknown field')
    expect(text).toContain(
      'mutation endMembership(input: EndMembershipInput!) { membershipId: ID! }'
    )
  })

  it('fits in one Discord message with the code block closed', () => {
    const text = describeOffboardRun({
      candidates: 1,
      results: [
        {
          email: 'a@example.com',
          outcome: 'failed',
          errors: ['unknown field'],
          apiHints: Array.from(
            { length: 30 },
            (_, i) =>
              `mutation someLongMemberOperation${i}(input: SomeLongMemberOperation${i}Input!) { clubId: ID!, userId: ID! }`
          ),
        },
      ],
    })!
    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text.split('```').length % 2).toBe(1)
  })
})
