import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  staff: vi.fn(),
  record: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('@/app/lib/session', () => ({
  getSession: mocks.session,
  isCurrentlyStaff: mocks.staff,
}))
vi.mock('@/app/lib/airtable', () => ({
  getRecord: mocks.record,
  Tables: { People: 'People' },
}))
vi.mock('@/app/lib/discord', () => ({
  syncDiscordRole: mocks.sync,
  isDiscordConfigured: () => true,
}))
import { POST } from './route'
const uid = 'rec12345678901234'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ isLoggedIn: true, userId: uid })
  mocks.staff.mockResolvedValue(false)
  mocks.record.mockResolvedValue({
    id: uid,
    fields: {
      Tier: 'Program',
      Status: 'Joined',
      Program: ['recn4q015cMNH5ODe'],
      'Discord Username': 'real_member',
    },
  })
  mocks.sync.mockResolvedValue({ success: true })
})
function request(body: unknown) {
  return new NextRequest('https://moxsf.com/portal/api/sync-discord-role', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
it('uses the authorized Airtable record rather than client-supplied recipient or roles', async () => {
  expect(
    (
      await POST(
        request({
          userId: uid,
          discordUsername: 'another_account',
          tier: 'Private Office',
          status: 'Joined',
        })
      )
    ).status
  ).toBe(200)
  expect(mocks.sync).toHaveBeenCalledWith('real_member', 'Program', 'Joined', [
    'recn4q015cMNH5ODe',
  ])
})
it('does not allow a member to sync someone else', async () => {
  expect((await POST(request({ userId: 'rec00000000000000' }))).status).toBe(
    403
  )
  expect(mocks.record).not.toHaveBeenCalled()
  expect(mocks.sync).not.toHaveBeenCalled()
})
