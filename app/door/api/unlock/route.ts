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

// Answering is quick (a store read and two Verkada calls). The long limit
// is for the background index rebuild this route starts when it finds no
// index at all; see scheduleRebuild.
export const maxDuration = 300

/** The cron rebuilds every 30 minutes; past this it has stopped working. */
const STALE_INDEX_MS = 2 * 60 * 60 * 1000

// Bounds on the two Verkada calls made while the person waits, so the page
// gets an answer before its own 15-second limit.
const VERIFY_TIMEOUT_MS = 4000
const UNLOCK_TIMEOUT_MS = 6000

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
    const { match, indexReady, indexAgeMs } = await resolvePin(pin, {
      timeoutMs: VERIFY_TIMEOUT_MS,
    })

    if (!indexReady || (indexAgeMs !== null && indexAgeMs > STALE_INDEX_MS)) {
      scheduleRebuild()
    }

    // No index yet, so we can't tell a wrong code from one we haven't
    // learned. Don't count it; ask the person to try again shortly.
    if (!match && !indexReady) {
      console.warn(`[door-unlock] ip=${ip} no code index yet, rebuilding`)
      return Response.json(
        { success: false, reason: 'warming' },
        { status: 503, headers: noStore }
      )
    }

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

    const result = await userUnlockDoor(match.userId, {
      timeoutMs: UNLOCK_TIMEOUT_MS,
    })
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

/**
 * Rebuild the code index after the response has gone out. Normally the cron
 * keeps it fresh; this covers a missing index (first deploy, cache eviction)
 * or a cron that has stopped. refreshPinIndex makes sure only one runs.
 */
function scheduleRebuild() {
  after(() =>
    refreshPinIndex(STALE_INDEX_MS).catch((error) =>
      console.error('[door-unlock] background index rebuild failed:', error)
    )
  )
}
