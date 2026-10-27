import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'
vi.mock('@/app/lib/session', () => ({ getSession: async () => ({ isLoggedIn: true, userId: 'member' }) }))
vi.mock('@/app/lib/env', () => ({ env: {
  VERKADA_GUEST_USER_ID: 'guest-user-id\n', VERKADA_MEMBER_KEY: 'test-key',
} }))
afterEach(() => vi.unstubAllGlobals())
it('strips pasted whitespace before requesting the configured guest identity', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ token: 'test-token' }))
    .mockResolvedValueOnce(Response.json({ entry_code: 'test-pin' }))
  vi.stubGlobal('fetch', fetch)
  expect((await GET()).status).toBe(200)
  expect(fetch.mock.calls[1][0]).toBe('https://api.verkada.com/access/v1/access_users/user?user_id=guest-user-id')
})
