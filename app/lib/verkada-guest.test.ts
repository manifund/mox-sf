import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(() => {
  process.env.VERKADA_MEMBER_KEY = 'test-key'
  process.env.VERKADA_UUID = 'template-user'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

/** A fake Verkada where `start_date` answers 500 `failStarts` times first. */
function fakeVerkada(failStarts: number) {
  const calls: string[] = []
  let startFailures = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method || 'GET'
    calls.push(`${method} ${path}`)
    if (path === '/token') return json({ token: 't' })
    if (path === '/access/v1/access_users/user' && method === 'GET') {
      return json({ access_groups: [{ group_id: 'g1' }] })
    }
    if (path === '/core/v1/user' && method === 'POST') {
      return json({ user_id: 'new-user' })
    }
    if (path === '/core/v1/user' && method === 'DELETE') return json({})
    if (path.endsWith('/start_date') && startFailures < failStarts) {
      startFailures++
      return json(
        { id: 'x', message: 'Unable to set start date.', data: null },
        500
      )
    }
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

describe('createGuestAccessUser', () => {
  it('retries a transient 500 from Verkada when setting the start date', async () => {
    const calls = fakeVerkada(1)
    const { createGuestAccessUser } = await import('./verkada')
    const result = await createGuestAccessUser({
      externalId: 'guest-pass-abc',
      firstName: 'Ada',
      lastName: '(guest of Austin)',
      start: new Date('2026-11-21T16:00:00Z'),
      end: new Date('2026-11-22T07:00:00Z'),
    })
    expect(result.userId).toBe('new-user')
    expect(result.entryCode).toMatch(/^\d{6}$/)
    expect(calls.filter((c) => c.endsWith('/start_date'))).toHaveLength(2)
    expect(calls).not.toContain('DELETE /core/v1/user')
  })

  it('gives up and deletes the half-made user when Verkada keeps failing', async () => {
    const calls = fakeVerkada(99)
    const { createGuestAccessUser } = await import('./verkada')
    await expect(
      createGuestAccessUser({
        externalId: 'guest-pass-def',
        firstName: 'Ada',
        lastName: '(guest)',
        start: new Date('2026-11-21T16:00:00Z'),
        end: new Date('2026-11-22T07:00:00Z'),
      })
    ).rejects.toThrow(/set start date failed: 500/)
    expect(calls.filter((c) => c.endsWith('/start_date'))).toHaveLength(3)
    expect(calls).toContain('DELETE /core/v1/user')
  })
})
