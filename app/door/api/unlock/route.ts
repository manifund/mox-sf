import { after } from 'next/server'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { PIN_PATTERN, refreshPinIndex, resolvePin } from '@/app/lib/door-pins'
import {
  checkDoorThrottle,
  getClientIp,
  recordDoorFailure,
  GLOBAL_LOCK_MS,
  GLOBAL_MAX_FAILURES,
  WINDOW_MS,
} from '@/app/lib/door-throttle'
import { userUnlockDoor } from '@/app/lib/verkada'

// The web keypad at /door: anyone can type a Verkada entry code here, as
// they would on the keypad at the front door. A code that belongs to a
// current Verkada access user opens the door *as that user* (Verkada
// user_unlock), so Verkada applies that person's access rules and records
// the unlock against them. No sign-in; the code is the credential, which is
// why wrong codes are limited hard (see door-throttle.ts).

// Building the code index for the first time reads every access user.
export const maxDuration = 120

/** Refresh the index in the background once it is this old. */
const BACKGROUND_REFRESH_MS = 5 * 60 * 1000

const noStore = { 'Cache-Control': 'no-store' }

// Handle one attempt at a time per instance, so a burst of parallel guesses
// can't all slip past the counters before any of them is recorded.
let queue: Promise<unknown> = Promise.resolve()

export async function POST(request: Request) {
  const run = queue.then(() => handle(request))
  queue = run.catch(() => {})
  return run
}

async function handle(request: Request): Promise<Response> {
  const ip = getClientIp(request)

  let pin: unknown
  try {
    pin = (await request.json())?.pin
  } catch {
    pin = null
  }
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    return Response.json(
      { success: false, reason: 'invalid' },
      { status: 400, headers: noStore }
    )
  }

  const throttle = await checkDoorThrottle(ip)
  if (!throttle.allowed) {
    console.warn(`[door-unlock] ip=${ip} blocked scope=${throttle.scope}`)
    return Response.json(
      {
        success: false,
        reason: 'locked',
        retryAfterSec: throttle.retryAfterSec,
      },
      {
        status: 429,
        headers: { ...noStore, 'Retry-After': String(throttle.retryAfterSec) },
      }
    )
  }

  try {
    const { match, indexAgeMs } = await resolvePin(pin)

    if (!match) {
      const failure = await recordDoorFailure(ip)
      console.warn(
        `[door-unlock] ip=${ip} wrong code, ${failure.attemptsLeft} tries left`
      )
      if (failure.globalLockStarted) {
        after(() =>
          sendChannelMessage(
            DISCORD_CHANNELS.NOTIFICATIONS,
            `🚪 The web door keypad (moxsf.com/door) is closed for ` +
              `${GLOBAL_LOCK_MS / 60_000} minutes: ${GLOBAL_MAX_FAILURES} wrong codes ` +
              `in ${WINDOW_MS / 60_000} minutes (latest from ${ip}). ` +
              `Members can still unlock from the portal.`
          )
        )
      }
      return Response.json(
        {
          success: false,
          reason: 'rejected',
          attemptsLeft: failure.attemptsLeft,
        },
        { headers: noStore }
      )
    }

    if (indexAgeMs > BACKGROUND_REFRESH_MS) {
      after(() =>
        refreshPinIndex(BACKGROUND_REFRESH_MS).catch((error) =>
          console.error('[door-unlock] background index refresh failed:', error)
        )
      )
    }

    const result = await userUnlockDoor(match.userId)
    if (result.ok) {
      console.log(
        `[door-unlock] ip=${ip} unlocked as user=${match.userId} (${match.name})`
      )
      return Response.json({ success: true }, { headers: noStore })
    }

    console.error(
      `[door-unlock] ip=${ip} Verkada refused user=${match.userId} (${match.name}): ` +
        `status=${result.status} message=${JSON.stringify(result.message)}`
    )
    // No status, a 429 or a 5xx means Verkada itself is in trouble.
    if (!result.status || result.status === 429 || result.status >= 500) {
      return Response.json(
        { success: false, reason: 'error' },
        { status: 502, headers: noStore }
      )
    }
    // Otherwise the code is right but Verkada wouldn't open the door for
    // this user: outside their schedule, no access to this door, or door
    // control by API is switched off. Not a guess, so it isn't counted.
    return Response.json(
      { success: false, reason: 'denied' },
      { headers: noStore }
    )
  } catch (error) {
    console.error(`[door-unlock] ip=${ip} failed:`, error)
    return Response.json(
      { success: false, reason: 'error' },
      { status: 502, headers: noStore }
    )
  }
}
