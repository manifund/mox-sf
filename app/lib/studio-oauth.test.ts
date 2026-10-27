import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { startStudioConsent, finishStudioConsent } from './studio-oauth'

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  storage: vi.fn(),
  save: vi.fn(),
  pending: {
    state: 'studio.valid',
    verifier: 'verifier',
    userId: 'person',
    expires: Date.now() + 600000,
    save: vi.fn(),
    destroy: vi.fn(),
  },
}))
vi.mock('./env', () => ({
  env: {
    SESSION_SECRET: 'test-secret',
    NEXT_PUBLIC_BASE_URL: 'https://moxsf.com',
    TASKS_GOOGLE_CLIENT_ID: 'client',
    TASKS_GOOGLE_CLIENT_SECRET: 'secret',
    isProduction: true,
  },
}))
vi.mock('./session', () => ({ requireStaff: mocks.staff }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('iron-session', () => ({ getIronSession: async () => mocks.pending }))
vi.mock('./studio-calendar', () => ({
  sealStudioConnection: mocks.save,
  STUDIO_OWNER_EMAIL: 'carolina@moxsf.com',
  STUDIO_SCOPE: 'https://www.googleapis.com/auth/calendar.events',
  STUDIO_CALENDAR_ID: 'studio',
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.staff.mockResolvedValue({
    email: 'carolinaollive@gmail.com',
    userId: 'person',
  })
  Object.assign(mocks.pending, {
    state: 'studio.valid',
    verifier: 'verifier',
    userId: 'person',
    expires: Date.now() + 600000,
  })
})
const start = (origin = 'https://moxsf.com') =>
  new NextRequest('https://moxsf.com/portal/api/studio-connect', {
    method: 'POST',
    headers: { origin },
  })
afterEach(() => vi.unstubAllGlobals())

describe('calendar connection preflight', () => {
  async function finish(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            access_token: 'private-access',
            refresh_token: 'private-refresh',
            scope: 'https://www.googleapis.com/auth/calendar.events',
          })
        )
        .mockResolvedValueOnce(
          Response.json({ email: 'carolina@moxsf.com', verified_email: true })
        )
        .mockResolvedValueOnce(Response.json(body, { status }))
    )
    return finishStudioConsent(
      new NextRequest(
        'https://moxsf.com/tasks/auth/google/callback?state=studio.valid&code=test'
      )
    )
  }
  it('gives an enable link when Google reports a disabled API', async () => {
    const response = await finish(403, {
      error: { details: [{ reason: 'SERVICE_DISABLED' }] },
    })
    expect(await response.text()).toContain(
      'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('distinguishes missing calendar access from disabled API', async () => {
    const response = await finish(404, {
      error: { errors: [{ reason: 'notFound' }] },
    })
    expect(await response.text()).toContain('Make changes to events')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not expose unrecognized Google response contents', async () => {
    const response = await finish(500, { error: { message: 'private-access' } })
    expect(await response.text()).toBe(
      'Google Calendar access failed (HTTP 500). Please reconnect in a few minutes.'
    )
  })
  it('downloads a sealed credential only after successful preflight', async () => {
    mocks.save.mockResolvedValue('sealed-credential')
    const response = await finish(200, { items: [] })
    expect(response.headers.get('content-disposition')).toContain(
      'mox-studio-connection.txt'
    )
    expect(await response.text()).toBe('sealed-credential')
  })
})
describe('studio consent authorization', () => {
  it('blocks nonstaff', async () => {
    mocks.staff.mockResolvedValue(null)
    expect((await startStudioConsent(start())).status).toBe(403)
    expect(mocks.storage).not.toHaveBeenCalled()
  })
  it('blocks other staff accounts', async () => {
    mocks.staff.mockResolvedValue({
      email: 'another@moxsf.com',
      userId: 'other',
    })
    expect((await startStudioConsent(start())).status).toBe(403)
  })
  it('blocks cross-origin connection requests', async () => {
    expect(
      (await startStudioConsent(start('https://evil.example'))).status
    ).toBe(403)
  })
  it('requests offline access with PKCE through the registered callback', async () => {
    const response = await startStudioConsent(start())
    const url = new URL(response.headers.get('location')!)
    expect(response.status).toBe(303)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('login_hint')).toBe('carolina@moxsf.com')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://moxsf.com/tasks/auth/google/callback'
    )
  })
  it('rejects invalid state without saving credentials', async () => {
    const response = await finishStudioConsent(
      new NextRequest(
        'https://moxsf.com/tasks/auth/google/callback?state=studio.wrong&code=test'
      )
    )
    expect(response.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.pending.destroy).toHaveBeenCalled()
  })
  it('rejects expired consent', async () => {
    mocks.pending.expires = 1
    expect(
      (
        await finishStudioConsent(
          new NextRequest(
            'https://moxsf.com/tasks/auth/google/callback?state=studio.valid&code=test'
          )
        )
      ).status
    ).toBe(400)
  })
})
