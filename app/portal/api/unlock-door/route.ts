import { getSession, isCurrentlyStaff } from '@/app/lib/session'
import { getRecord, Tables } from '@/app/lib/airtable'
import { isActiveMember } from '@/app/lib/membership'
import { adminUnlockDoor, listDoors, MOX_FRONT_DOOR_ID } from '@/app/lib/verkada'

// Remote unlock of the front door from the portal's door-access box. The
// only unlock button on the site; guests and day passes use keypad codes.

const throttleMap = new Map<string, { count: number; resetAt: number }>()
const THROTTLE_WINDOW_MS = 30_000
const THROTTLE_MAX = 10

function checkThrottle(userId: string): boolean {
  const now = Date.now()
  const entry = throttleMap.get(userId)
  if (!entry || now > entry.resetAt) {
    throttleMap.set(userId, { count: 1, resetAt: now + THROTTLE_WINDOW_MS })
    return true
  }
  if (entry.count >= THROTTLE_MAX) return false
  entry.count++
  return true
}

export async function POST() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const effectiveUserId = session.viewingAsUserId || session.userId
    if (!checkThrottle(effectiveUserId)) {
      return Response.json(
        { success: false, error: 'too many unlock attempts. wait a moment.' },
        { status: 429 }
      )
    }

    const record = await getRecord<{ Status?: string; Tier?: string }>(
      Tables.People,
      effectiveUserId
    )
    const memberOk = isActiveMember({
      status: record?.fields.Status ?? null,
      tier: record?.fields.Tier ?? null,
    })
    if (!memberOk) {
      return Response.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const result = await adminUnlockDoor()
    console.log(
      `[portal-unlock] user=${effectiveUserId} ok=${result.ok}` +
        (result.ok ? '' : ` status=${result.status} message=${JSON.stringify(result.message)}`)
    )
    if (result.ok) return Response.json({ success: true })

    // When the unlock is refused, log what Verkada can see so we can tell a
    // wrong door id from a permissions problem.
    listDoors()
      .then((doors) =>
        console.log(
          `[portal-unlock] expected door ${MOX_FRONT_DOOR_ID}; doors visible to the API key:`,
          JSON.stringify(doors)
        )
      )
      .catch((error) =>
        console.error('[portal-unlock] could not list doors:', error)
      )

    // Members get a plain message; staff see Verkada's reason inline.
    const staff = await isCurrentlyStaff(session.userId)
    const detail = result.status
      ? `verkada ${result.status}: ${result.message || 'no message'}`
      : result.message || 'unknown error'
    return Response.json({
      success: false,
      error: staff
        ? `couldn't unlock (${detail})`
        : "couldn't unlock the door. use your code on the keypad.",
    })
  } catch (error) {
    console.error('[portal-unlock] failed:', error)
    return Response.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
