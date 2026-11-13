import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const m = vi.hoisted(() => ({
  env: { FORKABLE_SYNC_SECRET: 'shh' },
  get: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  offboard: vi.fn(),
  discord: vi.fn(),
}))
vi.mock('@/app/lib/env', () => ({ env: m.env }))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People' },
  getRecord: m.get,
  updateRecord: m.update,
}))
vi.mock('@/app/lib/discord', () => ({
  sendChannelMessage: m.discord,
  DISCORD_CHANNELS: { NOTIFICATIONS: 'chan' },
}))
vi.mock('@/app/lib/forkable', () => ({
  addMemberToForkable: m.add,
  FORKABLE_CLUBS: { MOX_MEMBERS: 6314, MOX_RESIDENTS: 7097 },
}))
vi.mock('@/app/lib/forkable-offboard', () => ({
  offboardFromForkable: m.offboard,
  describeOffboardResult: (r: { outcome: string; email: string }) =>
    `${r.outcome}:${r.email}`,
}))

const post = (body: unknown) =>
  POST(
    new Request('https://moxsf.com/api/forkable-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )
const removed = (email: string) => ({ email, outcome: 'removed' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  m.env.FORKABLE_SYNC_SECRET = 'shh'
  m.discord.mockResolvedValue(true)
  m.offboard.mockImplementation(async (email: string) => removed(email))
})

describe('forkable-sync remove', () => {
  it('refuses to run when no secret is configured', async () => {
    m.env.FORKABLE_SYNC_SECRET = ''
    const res = await post({ action: 'remove', emails: ['a@example.com'] })
    expect(res.status).toBe(503)
    expect(m.offboard).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await post({
      action: 'remove',
      emails: ['a@example.com'],
      secret: 'nope',
    })
    expect(res.status).toBe(401)
    expect(m.offboard).not.toHaveBeenCalled()
  })

  it('removes the person behind an Airtable record', async () => {
    m.get.mockResolvedValue({
      id: 'rec1',
      fields: { Email: 'a@example.com', Status: 'Cancelled' },
    })
    const res = await post({
      action: 'remove',
      recordId: 'rec1',
      secret: 'shh',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      removed: 1,
      skipped: 0,
      failed: 0,
    })
    expect(m.offboard).toHaveBeenCalledWith('a@example.com')
    expect(m.discord).toHaveBeenCalledWith('chan', 'removed:a@example.com')
    expect(m.add).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown record and 400 for one without an email', async () => {
    m.get.mockResolvedValueOnce(null)
    expect(
      (await post({ action: 'remove', recordId: 'rec0', secret: 'shh' })).status
    ).toBe(404)
    m.get.mockResolvedValueOnce({ id: 'rec1', fields: {} })
    expect(
      (await post({ action: 'remove', recordId: 'rec1', secret: 'shh' })).status
    ).toBe(400)
    expect(m.offboard).not.toHaveBeenCalled()
  })

  it('stays quiet in Discord when the member is still active', async () => {
    m.get.mockResolvedValue({ id: 'rec1', fields: { Email: 'a@example.com' } })
    m.offboard.mockResolvedValue({
      email: 'a@example.com',
      outcome: 'skipped',
      reason: 'Joined',
    })
    const res = await post({
      action: 'remove',
      recordId: 'rec1',
      secret: 'shh',
    })
    expect(await res.json()).toMatchObject({
      success: true,
      removed: 0,
      skipped: 1,
    })
    expect(m.discord).not.toHaveBeenCalled()
  })

  it('handles a list of emails, deduplicated, with one summary message', async () => {
    m.offboard.mockImplementation(async (email: string) =>
      email === 'b@example.com'
        ? { email, outcome: 'skipped', reason: 'Joined' }
        : email === 'c@example.com'
          ? { email, outcome: 'failed', errors: ['boom'] }
          : removed(email)
    )
    const res = await post({
      action: 'remove',
      secret: 'shh',
      emails: [
        'a@example.com',
        ' A@Example.com ',
        'b@example.com',
        'c@example.com',
      ],
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      success: false,
      removed: 1,
      skipped: 1,
      failed: 1,
    })
    expect(m.offboard).toHaveBeenCalledTimes(3)
    expect(m.discord).toHaveBeenCalledTimes(1)
    const message = m.discord.mock.calls[0][1]
    expect(message).toContain('1 removed')
    expect(message).toContain('c@example.com')
    expect(message).not.toContain('a@example.com')
  })

  it('keeps going when one removal throws', async () => {
    m.offboard.mockRejectedValueOnce(new Error('Airtable 503'))
    const res = await post({
      action: 'remove',
      secret: 'shh',
      emails: ['a@example.com', 'b@example.com'],
    })
    expect(await res.json()).toMatchObject({ removed: 1, failed: 1 })
  })

  it('rejects an empty, malformed or oversized list', async () => {
    expect((await post({ action: 'remove', secret: 'shh' })).status).toBe(400)
    expect(
      (await post({ action: 'remove', secret: 'shh', emails: [] })).status
    ).toBe(400)
    expect(
      (
        await post({
          action: 'remove',
          secret: 'shh',
          emails: ['a@example.com', 7],
        })
      ).status
    ).toBe(400)
    const many = Array.from({ length: 101 }, (_, i) => `p${i}@example.com`)
    expect(
      (await post({ action: 'remove', secret: 'shh', emails: many })).status
    ).toBe(400)
    expect(m.offboard).not.toHaveBeenCalled()
  })
})

describe('forkable-sync add (unchanged default)', () => {
  it('still adds a Joined Program member when no action is given', async () => {
    m.get.mockResolvedValue({
      id: 'rec1',
      fields: {
        Name: 'Ada Lovelace',
        Email: 'a@example.com',
        Tier: 'Program',
        Status: 'Joined',
      },
    })
    m.add.mockResolvedValue({ success: true, memberships: [] })
    const res = await post({ recordId: 'rec1', secret: 'shh' })
    expect(res.status).toBe(200)
    expect(m.add).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@example.com', clubIds: [6314] })
    )
    expect(m.update).toHaveBeenCalledWith('People', 'rec1', {
      'In Forkable': true,
    })
    expect(m.offboard).not.toHaveBeenCalled()
  })
})
