import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getStudioAccessToken,
  sealStudioConnection,
  STUDIO_OWNER_EMAIL,
} from './studio-calendar'

const config = vi.hoisted(() => ({
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  TASKS_GOOGLE_CLIENT_ID: 'client',
  TASKS_GOOGLE_CLIENT_SECRET: 'secret',
  STUDIO_CALENDAR_CONNECTION: '',
}))
vi.mock('./env', () => ({ env: config }))
const fetchMock = vi.fn()
beforeEach(() => {
  config.STUDIO_CALENDAR_CONNECTION = ''
  vi.stubGlobal('fetch', fetchMock.mockReset())
})
afterEach(() => vi.unstubAllGlobals())

describe('studio credential without a database', () => {
  it('fails closed when no credential is configured', async () => {
    await expect(getStudioAccessToken()).rejects.toThrow('not connected')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('seals the credential and only contacts Google to refresh it', async () => {
    config.STUDIO_CALENDAR_CONNECTION = await sealStudioConnection({
      email: STUDIO_OWNER_EMAIL,
      refreshToken: 'private-refresh',
    })
    expect(config.STUDIO_CALENDAR_CONNECTION).not.toContain('private-refresh')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access' }))
    )
    await expect(getStudioAccessToken()).resolves.toBe('access')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://oauth2.googleapis.com/token'
    )
    expect(fetchMock.mock.calls[0][1].body.get('refresh_token')).toBe(
      'private-refresh'
    )
  })
  it('rejects the wrong Google owner', async () => {
    await expect(
      sealStudioConnection({
        email: 'another@example.com',
        refreshToken: 'token',
      })
    ).rejects.toThrow('Invalid calendar owner')
  })
  it('rejects a corrupted credential before calling Google', async () => {
    config.STUDIO_CALENDAR_CONNECTION = 'corrupt'
    await expect(getStudioAccessToken()).rejects.toThrow('Reconnect')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
