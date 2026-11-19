import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'

const { getRecord } = vi.hoisted(() => ({ getRecord: vi.fn() }))
vi.mock('@/app/lib/session', () => ({ getSession: async () => ({ isLoggedIn: true, userId: 'member' }) }))
vi.mock('@/app/lib/airtable', () => ({ getRecord, Tables: { People: 'People' } }))
vi.mock('@/app/lib/env', () => ({ env: {
  VERKADA_GUEST_USER_ID: 'guest-user-id\n', VERKADA_MEMBER_KEY: 'test-key',
} }))
afterEach(() => {
  vi.unstubAllGlobals()
  getRecord.mockReset()
})

it('strips pasted whitespace before requesting the configured guest identity', async () => {
  getRecord.mockResolvedValue({ id: 'member', fields: { Status: 'Joined', Tier: 'Guest Program' } })
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ token: 'test-token' }))
    .mockResolvedValueOnce(Response.json({ entry_code: 'test-pin' }))
  vi.stubGlobal('fetch', fetch)
  expect((await GET()).status).toBe(200)
  expect(fetch.mock.calls[1][0]).toBe('https://api.verkada.com/access/v1/access_users/user?user_id=guest-user-id')
})

it.each([
  ['a lapsed guest-program member', { Status: 'Cancelled', Tier: 'Guest Program' }],
  ['an active Core member', { Status: 'Joined', Tier: 'Core' }],
])('withholds the shared guest code from %s', async (_label, fields) => {
  getRecord.mockResolvedValue({ id: 'member', fields })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await (await GET()).json()).toEqual({ pin: null, hasAccess: false })
  expect(fetch).not.toHaveBeenCalled()
})
