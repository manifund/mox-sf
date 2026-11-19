import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getRecord = vi.fn()
const updateRecord = vi.fn()
const getSession = vi.fn()

vi.mock('@/app/lib/session', () => ({ getSession }))
vi.mock('@/app/lib/airtable', () => ({
  getRecord,
  updateRecord,
  Tables: { People: 'People' },
}))
vi.mock('@/app/lib/env', () => ({ env: { VERKADA_MEMBER_KEY: 'test-key', VERKADA_API_KEY: '' } }))

let GET: typeof import('./route').GET
let POST: typeof import('./route').POST

beforeEach(async () => {
  // The handler caches Verkada tokens at module scope; reload it for each
  // test so the mocked request sequence stays independent.
  vi.resetModules()
  ;({ GET, POST } = await import('./route'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const member = {
  id: 'rec-kiel',
  fields: {
    Name: 'Kiel Howe',
    Email: 'kiel@example.com',
    Status: 'Joined',
    Tier: 'Core',
  },
}

describe('personal door-code provisioning', () => {
  it('never creates a Verkada user while merely loading the portal', async () => {
    getSession.mockResolvedValue({ isLoggedIn: true, userId: 'rec-kiel' })
    getRecord.mockResolvedValue(member)
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'token' }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetch)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ hasAccess: false, needsProvisioning: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.some(([url, init]) => url === 'https://api.verkada.com/core/v1/user' && init?.method === 'POST')).toBe(false)
  })

  it('provisions an active member, assigns MoxSF, and returns a personal PIN', async () => {
    getSession.mockResolvedValue({ isLoggedIn: true, userId: 'rec-kiel' })
    getRecord.mockResolvedValue(member)
    updateRecord.mockResolvedValue(member)
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'token' }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(Response.json({ user_id: 'verkada-kiel' }))
      .mockResolvedValueOnce(Response.json({ access_groups: [{ group_id: 'mox-group', name: 'MoxSF' }] }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ hasAccess: true })
    expect(body.pin).toMatch(/^\d{6}$/)
    expect(fetch.mock.calls[2][0]).toBe('https://api.verkada.com/core/v1/user')
    expect(fetch.mock.calls[4][0]).toContain('access_groups/group/user?group_id=mox-group')
    expect(fetch.mock.calls[5][0]).toContain('access_users/user/entry_code?user_id=verkada-kiel&override=false')
    expect(updateRecord).toHaveBeenCalledWith('People', 'rec-kiel', { 'In Verkada': true })
  })

  describe('lapsed members on the free-through-2026 offer', () => {
    const lapsed = {
      id: 'rec-lapsed',
      fields: {
        Name: 'Lee Lapsed',
        Email: 'lee@example.com',
        Status: 'Paused',
        Tier: 'Core',
        Tags: ['Free Thru 2026: lapsed'],
        'In Verkada': true,
      },
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-12-01T20:00:00Z'))
      getSession.mockResolvedValue({ isLoggedIn: true, userId: 'rec-lapsed' })
      getRecord.mockResolvedValue(lapsed)
    })

    it('shows them the code they already have in Verkada', async () => {
      const fetch = vi.fn()
        .mockResolvedValueOnce(Response.json({ token: 'token' }))
        .mockResolvedValueOnce(Response.json({ user_id: 'verkada-lee', entry_code: '123456' }))
      vi.stubGlobal('fetch', fetch)

      const response = await GET()

      await expect(response.json()).resolves.toMatchObject({ pin: '123456', hasAccess: true })
    })

    it('gives them a new code without adding them to MoxSF', async () => {
      const fetch = vi.fn()
        .mockResolvedValueOnce(Response.json({ token: 'token' }))
        .mockResolvedValueOnce(Response.json({ user_id: 'verkada-lee' }))
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(new Response('', { status: 200 }))
      vi.stubGlobal('fetch', fetch)

      const response = await POST()

      expect(response.status).toBe(200)
      expect((await response.json()).pin).toMatch(/^\d{6}$/)
      const urls = fetch.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) => url.includes('access_groups'))).toBe(false)
      expect(urls.some((url) => url.includes('entry_code?user_id=verkada-lee'))).toBe(true)
      expect(updateRecord).not.toHaveBeenCalled()
    })

    it('never creates a Verkada account for them', async () => {
      const fetch = vi.fn()
        .mockResolvedValueOnce(Response.json({ token: 'token' }))
        .mockResolvedValueOnce(new Response('', { status: 404 }))
      vi.stubGlobal('fetch', fetch)

      const response = await POST()

      expect(response.status).toBe(409)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('stops on Jan 1, 2027', async () => {
      vi.setSystemTime(new Date('2027-01-01T08:00:00Z'))
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)

      const response = await GET()

      await expect(response.json()).resolves.toMatchObject({ pin: null, hasAccess: false })
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
