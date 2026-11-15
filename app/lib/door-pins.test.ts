import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('./door-store', () => ({
  storeGet: async (key: string) => store.get(key) ?? null,
  storeSet: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value))
  },
  storeDelete: async (key: string) => {
    store.delete(key)
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
  vi.spyOn(console, 'log').mockImplementation(() => {})
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
  ;({ resolvePin, refreshPinIndex } = await import('./door-pins'))
  await refreshPinIndex(0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// The index is only a shortcut for finding a code's owner. These check that
// what Verkada says right now decides, not what the index remembers.
describe('resolvePin', () => {
  it('rejects a code that was changed after the index was built', async () => {
    expect((await resolvePin('482913')).match).toEqual({
      userId: 'u-ada',
      name: 'Ada Member',
    })
    verkada['u-ada'].entryCode = '555555'
    expect((await resolvePin('482913')).match).toBeNull()
  })

  it('rejects a guest code before its start and after its end', async () => {
    const early = new Date('2026-11-15T15:00:00Z').getTime()
    const late = new Date('2026-11-16T07:00:00Z').getTime()
    expect((await resolvePin('771204', { now: early })).match).toBeNull()
    expect((await resolvePin('771204', { now: late })).match).toBeNull()
    expect((await resolvePin('771204')).match).not.toBeNull()
  })
})
