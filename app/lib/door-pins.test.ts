import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('./door-store', () => ({
  storeGet: async (key: string) => store.get(key) ?? null,
  storeSet: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value))
  },
}))
vi.mock('./env', () => ({ env: { VERKADA_MEMBER_KEY: 'test-key' } }))

const listAccessUsers = vi.fn()
const getAccessUserCredentials = vi.fn()
class VerkadaRateLimitError extends Error {}
vi.mock('./verkada', () => ({
  listAccessUsers,
  getAccessUserCredentials,
  VerkadaRateLimitError,
}))

let resolvePin: typeof import('./door-pins').resolvePin
let refreshPinIndex: typeof import('./door-pins').refreshPinIndex
let REBUILD_COOLDOWN_MS: number

interface FakeUser {
  name: string
  entryCode: string | null
  start?: Date | null
  end?: Date | null
}
/** The "live" Verkada organization the mocks read from. */
let verkada: Record<string, FakeUser>

beforeEach(async () => {
  vi.resetModules()
  store.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T20:00:00Z'))
  verkada = {
    'u-ada': { name: 'Ada Member', entryCode: '482913' },
    'u-guest': {
      name: 'Gus Guest',
      entryCode: '771204',
      start: new Date('2026-11-15T16:00:00Z'),
      end: new Date('2026-11-16T07:00:00Z'),
    },
    'u-nocode': { name: 'No Code', entryCode: null },
  }
  listAccessUsers.mockImplementation(async () =>
    Object.entries(verkada).map(([userId, u]) => ({
      userId,
      name: u.name,
      email: '',
    }))
  )
  getAccessUserCredentials.mockImplementation(async (userId: string) => {
    const u = verkada[userId]
    if (!u) return null
    return {
      userId,
      entryCode: u.entryCode,
      start: u.start ?? null,
      end: u.end ?? null,
    }
  })
  ;({ resolvePin, refreshPinIndex, REBUILD_COOLDOWN_MS } = await import(
    './door-pins'
  ))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('resolvePin', () => {
  it('finds the owner of a valid code', async () => {
    const { match } = await resolvePin('482913')
    expect(match).toEqual({ userId: 'u-ada', name: 'Ada Member' })
  })

  it('rejects a code nobody has', async () => {
    const { match } = await resolvePin('000000')
    expect(match).toBeNull()
  })

  it('never stores the codes themselves', async () => {
    await resolvePin('482913')
    const stored = JSON.stringify([...store.values()])
    expect(stored).not.toContain('482913')
    expect(stored).not.toContain('771204')
  })

  it('reads every user once to build the index, then reuses it', async () => {
    await resolvePin('482913')
    expect(listAccessUsers).toHaveBeenCalledTimes(1)
    await resolvePin('771204')
    expect(listAccessUsers).toHaveBeenCalledTimes(1)
  })

  it('rejects a code that was changed after the index was built', async () => {
    await resolvePin('482913')
    verkada['u-ada'].entryCode = '555555'
    const { match } = await resolvePin('482913')
    expect(match).toBeNull()
  })

  it('rejects the code of a user deleted after the index was built', async () => {
    await resolvePin('771204')
    delete verkada['u-guest']
    const { match } = await resolvePin('771204')
    expect(match).toBeNull()
  })

  it('rejects a guest code before its start and after its end', async () => {
    const early = new Date('2026-11-15T15:00:00Z').getTime()
    const late = new Date('2026-11-16T07:00:00Z').getTime()
    expect((await resolvePin('771204', early)).match).toBeNull()
    expect((await resolvePin('771204', late)).match).toBeNull()
    expect((await resolvePin('771204')).match).not.toBeNull()
  })

  it('picks up a brand-new code by rebuilding, but not more than once a minute', async () => {
    await resolvePin('482913')
    verkada['u-new'] = { name: 'New Member', entryCode: '909090' }

    // Inside the cooldown: no rebuild, so the new code isn't known yet.
    expect((await resolvePin('909090')).match).toBeNull()
    expect(listAccessUsers).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + REBUILD_COOLDOWN_MS + 1)
    expect((await resolvePin('909090')).match).toEqual({
      userId: 'u-new',
      name: 'New Member',
    })
    expect(listAccessUsers).toHaveBeenCalledTimes(2)
  })

  it('throws when Verkada is down rather than calling the code wrong', async () => {
    listAccessUsers.mockRejectedValue(new Error('verkada down'))
    await expect(resolvePin('482913')).rejects.toThrow('verkada down')
  })

  it('keeps a partial index when some users cannot be read', async () => {
    getAccessUserCredentials.mockImplementation(async (userId: string) => {
      if (userId === 'u-guest') throw new Error('boom')
      const u = verkada[userId]
      return { userId, entryCode: u.entryCode, start: null, end: null }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await resolvePin('482913')).match).not.toBeNull()
  })
})

describe('refreshPinIndex', () => {
  it('rebuilds only when the index is older than asked', async () => {
    await resolvePin('482913')
    await refreshPinIndex(60_000)
    expect(listAccessUsers).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 61_000)
    await refreshPinIndex(60_000)
    expect(listAccessUsers).toHaveBeenCalledTimes(2)
  })
})
