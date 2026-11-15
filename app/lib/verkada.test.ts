import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateEntryCode } from './verkada'

describe('generateEntryCode', () => {
  it('makes six-digit codes with no leading zero', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateEntryCode()
      expect(code).toMatch(/^[1-9]\d{5}$/)
    }
  })
  it('honours the requested length', () => {
    expect(generateEntryCode(4)).toMatch(/^[1-9]\d{3}$/)
  })
  it('does not repeat itself (in practice)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateEntryCode()))
    expect(codes.size).toBeGreaterThan(45)
  })
})

describe('web keypad helpers', () => {
  // The token is cached at module scope, so load a fresh module per test.
  async function load(responses: Response[]) {
    vi.resetModules()
    vi.doMock('./env', () => ({ env: { VERKADA_MEMBER_KEY: 'test-key' } }))
    const fetch = vi.fn()
    fetch.mockResolvedValueOnce(Response.json({ token: 'tok' }))
    for (const r of responses) fetch.mockResolvedValueOnce(r)
    vi.stubGlobal('fetch', fetch)
    return { fetch, lib: await import('./verkada') }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./env')
  })

  it('unlocks the front door as the given user', async () => {
    const { fetch, lib } = await load([
      Response.json({ door_id: 'door', unlock_duration: 5 }),
    ])
    expect(await lib.userUnlockDoor('user-1')).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[1]
    expect(url).toBe('https://api.verkada.com/access/v1/door/user_unlock')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      door_id: lib.MOX_FRONT_DOOR_ID,
      user_id: 'user-1',
    })
  })

  it("passes on Verkada's reason when it refuses the unlock", async () => {
    const { lib } = await load([
      Response.json({ message: 'User does not have access' }, { status: 403 }),
    ])
    expect(await lib.userUnlockDoor('user-1')).toEqual({
      ok: false,
      status: 403,
      message: 'User does not have access',
    })
  })

  it('reads an entry code and validity window', async () => {
    const { lib } = await load([
      Response.json({
        user_id: 'user-1',
        entry_code: '482913',
        start_date: '1794758400',
        end_date: null,
      }),
    ])
    expect(await lib.getAccessUserCredentials('user-1')).toEqual({
      userId: 'user-1',
      entryCode: '482913',
      start: new Date(1794758400 * 1000),
      end: null,
    })
  })

  it('treats a missing user as gone and a 429 as a rate limit', async () => {
    const gone = await load([new Response('', { status: 404 })])
    expect(await gone.lib.getAccessUserCredentials('user-1')).toBeNull()
    const limited = await load([new Response('', { status: 429 })])
    await expect(
      limited.lib.getAccessUserCredentials('user-1')
    ).rejects.toBeInstanceOf(limited.lib.VerkadaRateLimitError)
  })

  it('lists access users', async () => {
    const { lib } = await load([
      Response.json({
        access_members: [
          {
            user_id: 'user-1',
            full_name: 'Ada Member',
            email: 'ada@example.com',
          },
          { full_name: 'No Id' },
        ],
      }),
    ])
    expect(await lib.listAccessUsers()).toEqual([
      { userId: 'user-1', name: 'Ada Member', email: 'ada@example.com' },
    ])
  })
})
