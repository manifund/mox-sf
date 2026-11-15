// Wrong-code limits for the web keypad (/door).
//
// The page is on the open internet, so unlike the keypad on the wall anyone
// anywhere can try codes. Two limits, both counting wrong codes only:
//   - per network address: a handful of tries, then a pause
//   - everyone combined: a burst of wrong codes from any mix of addresses
//     closes the keypad for a while and alerts staff
// The combined limit is what bounds a guessing run spread across many
// addresses; it deliberately trades availability for safety. Members can
// still unlock from the portal while the keypad is closed.

import { storeGet, storeSet } from './door-store'

export const WINDOW_MS = 10 * 60 * 1000
export const IP_MAX_FAILURES = 5
export const GLOBAL_MAX_FAILURES = 20
export const GLOBAL_LOCK_MS = 30 * 60 * 1000

interface Counter {
  count: number
  resetAt: number
  /** Set on the combined counter while the keypad is closed. */
  lockedUntil?: number
}

const GLOBAL_KEY = 'fail:global'
const ipKey = (ip: string) => `fail:ip:${ip}`

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  const raw =
    (xff && xff.split(',')[0].trim()) ||
    request.headers.get('x-real-ip') ||
    'unknown'
  // One IPv6 customer holds a whole /64, so count them as one address.
  return raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw
}

async function read(key: string, now: number): Promise<Counter> {
  const stored = await storeGet<Counter>(key)
  if (!stored) return { count: 0, resetAt: now + WINDOW_MS }
  const locked = stored.lockedUntil !== undefined && stored.lockedUntil > now
  if (!locked && stored.resetAt <= now) {
    return { count: 0, resetAt: now + WINDOW_MS }
  }
  return stored
}

async function write(key: string, counter: Counter, now: number) {
  const until = Math.max(counter.resetAt, counter.lockedUntil ?? 0)
  await storeSet(key, counter, Math.ceil((until - now) / 1000) + 5)
}

export type ThrottleCheck =
  | { allowed: true }
  | { allowed: false; scope: 'ip' | 'global'; retryAfterSec: number }

/** May this address try a code right now? Call before touching Verkada. */
export async function checkDoorThrottle(
  ip: string,
  now: number = Date.now()
): Promise<ThrottleCheck> {
  const global = await read(GLOBAL_KEY, now)
  if (global.lockedUntil !== undefined && global.lockedUntil > now) {
    return {
      allowed: false,
      scope: 'global',
      retryAfterSec: Math.ceil((global.lockedUntil - now) / 1000),
    }
  }
  const mine = await read(ipKey(ip), now)
  if (mine.count >= IP_MAX_FAILURES) {
    return {
      allowed: false,
      scope: 'ip',
      retryAfterSec: Math.ceil((mine.resetAt - now) / 1000),
    }
  }
  return { allowed: true }
}

export interface FailureRecord {
  /** Tries this address has left before its pause. */
  attemptsLeft: number
  /** True on the one wrong code that closes the keypad for everyone. */
  globalLockStarted: boolean
}

/** Count one wrong code against this address and the combined limit. */
export async function recordDoorFailure(
  ip: string,
  now: number = Date.now()
): Promise<FailureRecord> {
  const mine = await read(ipKey(ip), now)
  mine.count++
  await write(ipKey(ip), mine, now)

  const global = await read(GLOBAL_KEY, now)
  global.count++
  let globalLockStarted = false
  if (global.count >= GLOBAL_MAX_FAILURES && global.lockedUntil === undefined) {
    global.lockedUntil = now + GLOBAL_LOCK_MS
    globalLockStarted = true
  }
  await write(GLOBAL_KEY, global, now)

  return {
    attemptsLeft: Math.max(0, IP_MAX_FAILURES - mine.count),
    globalLockStarted,
  }
}
