import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: 'cron-test' },
  configured: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('@/app/lib/env', () => ({ env: mocks.env }))
vi.mock('@/app/lib/discord', () => ({ isDiscordConfigured: mocks.configured }))
vi.mock('@/app/lib/discord-role-sync', () => ({
  syncAirtableDiscordRoles: mocks.sync,
}))
import { GET } from './route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.CRON_SECRET = 'cron-test'
  mocks.configured.mockReturnValue(true)
  mocks.sync.mockResolvedValue({ success: true, failed: 0 })
})
it('requires a configured and matching cron secret', async () => {
  expect(
    (await GET(new Request('https://moxsf.com/api/cron/sync-discord-roles')))
      .status
  ).toBe(401)
  mocks.env.CRON_SECRET = ''
  expect(
    (
      await GET(
        new Request('https://moxsf.com/api/cron/sync-discord-roles', {
          headers: { authorization: 'Bearer ' },
        })
      )
    ).status
  ).toBe(401)
  expect(mocks.sync).not.toHaveBeenCalled()
})
it('supports authenticated dry runs', async () => {
  const response = await GET(
    new Request('https://moxsf.com/api/cron/sync-discord-roles?dry=1', {
      headers: { authorization: 'Bearer cron-test' },
    })
  )
  expect(response.status).toBe(200)
  expect(mocks.sync).toHaveBeenCalledWith({ dryRun: true })
})
it('returns a failing status for failed or unfinished reconciliation', async () => {
  mocks.sync.mockResolvedValue({ success: false, failed: 1 })
  expect(
    (
      await GET(
        new Request('https://moxsf.com/api/cron/sync-discord-roles', {
          headers: { authorization: 'Bearer cron-test' },
        })
      )
    ).status
  ).toBe(502)
})
