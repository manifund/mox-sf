import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  profile: vi.fn(),
  token: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@/app/lib/session', () => ({ getSession: mocks.session }))
vi.mock('@/app/lib/membership', () => ({
  isActiveMember: ({ status }: { status: string }) => status === 'Active',
}))
vi.mock('../../profile', () => ({ getUserProfile: mocks.profile }))
vi.mock('@/app/lib/studio-calendar', () => ({
  getStudioAccessToken: mocks.token,
  STUDIO_CALENDAR_ID: 'studio',
}))
vi.mock('@/app/lib/env', () => ({
  env: { NEXT_PUBLIC_BASE_URL: 'https://moxsf.com' },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.session.mockResolvedValue({ isLoggedIn: true, userId: 'member' })
  mocks.profile.mockResolvedValue({
    status: 'Active',
    tier: 'Core',
    email: 'member@example.com',
  })
  mocks.token.mockResolvedValue('access')
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'event' })))
})
afterEach(() => vi.unstubAllGlobals())
function request(end = '2026-09-20T13:00', start = '2026-09-20T10:00') {
  return new NextRequest('https://moxsf.com/portal/api/studio-events', {
    method: 'POST',
    headers: {
      origin: 'https://moxsf.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Studio booking', start, end }),
  })
}
describe('member studio bookings', () => {
  it('requires login', async () => {
    mocks.session.mockResolvedValue({ isLoggedIn: false })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('requires active membership', async () => {
    mocks.profile.mockResolvedValue({ status: 'Inactive' })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('allows exactly three hours and sends explicit Pacific instants', async () => {
    expect((await POST(request())).status).toBe(200)
    const event = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(event.start.dateTime).toBe('2026-09-20T17:00:00.000Z')
    expect(event.end.dateTime).toBe('2026-09-20T20:00:00.000Z')
  })
  it('rejects over three hours with the requested exact message', async () => {
    const response = await POST(request('2026-09-20T13:01'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '3h limit exceeded' })
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('rejects end before start', async () => {
    expect((await POST(request('2026-09-20T09:00'))).status).toBe(400)
  })
  it('rejects nonexistent daylight-saving times', async () => {
    expect(
      (await POST(request('2026-03-08T03:30', '2026-03-08T02:30'))).status
    ).toBe(400)
    expect(mocks.token).not.toHaveBeenCalled()
  })
})
