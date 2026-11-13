import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const m = vi.hoisted(() => ({
  env: { CRON_SECRET: 'cron-secret' },
  run: vi.fn(),
  describe: vi.fn(),
  discord: vi.fn(),
}))
vi.mock('@/app/lib/env', () => ({ env: m.env }))
vi.mock('@/app/lib/discord', () => ({
  sendChannelMessage: m.discord,
  DISCORD_CHANNELS: { NOTIFICATIONS: 'chan' },
}))
vi.mock('@/app/lib/forkable-offboard', () => ({
  offboardEndedMembers: m.run,
  describeOffboardRun: m.describe,
}))

const get = (token?: string) =>
  GET(
    new Request('https://moxsf.com/api/cron/forkable-offboard', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  m.discord.mockResolvedValue(true)
})

describe('forkable-offboard cron', () => {
  it('rejects requests without the cron secret', async () => {
    expect((await get()).status).toBe(401)
    expect((await get('wrong')).status).toBe(401)
    expect(m.run).not.toHaveBeenCalled()
  })

  it('runs the offboarding and reports the counts', async () => {
    m.run.mockResolvedValue({
      candidates: 3,
      results: [
        { email: 'a@example.com', outcome: 'removed' },
        { email: 'b@example.com', outcome: 'skipped', reason: 'Joined' },
        { email: 'c@example.com', outcome: 'failed', errors: ['boom'] },
      ],
    })
    m.describe.mockReturnValue('summary')
    const res = await get('cron-secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: false,
      candidates: 3,
      removed: 1,
      skipped: 1,
      failed: 1,
    })
    expect(m.run).toHaveBeenCalledWith({ limit: 150 })
    expect(m.discord).toHaveBeenCalledWith('chan', 'summary')
  })

  it('stays quiet in Discord when there is nothing to report', async () => {
    m.run.mockResolvedValue({ candidates: 0, results: [] })
    m.describe.mockReturnValue(null)
    const res = await get('cron-secret')
    expect(await res.json()).toMatchObject({
      success: true,
      removed: 0,
      failed: 0,
    })
    expect(m.discord).not.toHaveBeenCalled()
  })

  it('answers 500 when Airtable cannot be read', async () => {
    m.run.mockRejectedValue(new Error('Airtable 503'))
    const res = await get('cron-secret')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      success: false,
      error: 'Airtable 503',
    })
  })
})
