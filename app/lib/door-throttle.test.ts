import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('./door-store', () => ({
  storeGet: async (key: string) => store.get(key) ?? null,
  storeSet: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value))
  },
}))

import {
  checkDoorThrottle,
  getClientIp,
  recordDoorFailure,
  GLOBAL_LOCK_MS,
  GLOBAL_MAX_FAILURES,
  IP_MAX_FAILURES,
  WINDOW_MS,
} from './door-throttle'

const T0 = 1_800_000_000_000

beforeEach(() => store.clear())

describe('per-address limit', () => {
  it('allows a few wrong codes, then pauses that address only', async () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) {
      expect(await checkDoorThrottle('1.1.1.1', T0)).toEqual({ allowed: true })
      const { attemptsLeft } = await recordDoorFailure('1.1.1.1', T0)
      expect(attemptsLeft).toBe(IP_MAX_FAILURES - i - 1)
    }
    expect(await checkDoorThrottle('1.1.1.1', T0 + 1000)).toEqual({
      allowed: false,
      scope: 'ip',
      retryAfterSec: (WINDOW_MS - 1000) / 1000,
    })
    expect(await checkDoorThrottle('2.2.2.2', T0 + 1000)).toEqual({
      allowed: true,
    })
  })

  it('lets the address try again once the window has passed', async () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) {
      await recordDoorFailure('1.1.1.1', T0)
    }
    expect(await checkDoorThrottle('1.1.1.1', T0 + WINDOW_MS + 1)).toEqual({
      allowed: true,
    })
  })
})

describe('combined limit', () => {
  it('closes the keypad for everyone after a spread-out burst, once', async () => {
    let lockStarts = 0
    for (let i = 0; i < GLOBAL_MAX_FAILURES; i++) {
      const { globalLockStarted } = await recordDoorFailure(`10.0.0.${i}`, T0)
      if (globalLockStarted) lockStarts++
    }
    // A straggler already in flight must not announce the lock again.
    const late = await recordDoorFailure('10.0.9.9', T0 + 5)
    expect(late.globalLockStarted).toBe(false)
    expect(lockStarts).toBe(1)

    expect(await checkDoorThrottle('9.9.9.9', T0 + 60_000)).toEqual({
      allowed: false,
      scope: 'global',
      retryAfterSec: (GLOBAL_LOCK_MS - 60_000) / 1000,
    })
  })

  it('reopens after the lock and starts counting from zero', async () => {
    for (let i = 0; i < GLOBAL_MAX_FAILURES; i++) {
      await recordDoorFailure(`10.0.0.${i}`, T0)
    }
    const after = T0 + GLOBAL_LOCK_MS + 1
    expect(await checkDoorThrottle('9.9.9.9', after)).toEqual({ allowed: true })
    const { globalLockStarted } = await recordDoorFailure('9.9.9.9', after)
    expect(globalLockStarted).toBe(false)
    expect(await checkDoorThrottle('8.8.8.8', after)).toEqual({ allowed: true })
  })
})

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://moxsf.com/door/api/unlock', { headers })

  it('takes the first forwarded address', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe(
      '1.2.3.4'
    )
  })
  it('groups an IPv6 /64 as one address', () => {
    const a = getClientIp(req({ 'x-forwarded-for': '2001:db8:1:2:aaaa::1' }))
    const b = getClientIp(req({ 'x-forwarded-for': '2001:db8:1:2:bbbb::2' }))
    expect(a).toBe(b)
  })
  it('falls back when there is no address', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})
