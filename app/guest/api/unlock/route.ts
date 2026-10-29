import { adminUnlockDoor } from '@/app/lib/verkada'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import {
  findGuestPassByToken,
  getHost,
  recordGuestUnlock,
} from '@/app/lib/guest-passes-server'
import {
  GUEST_TOKEN_PATTERN,
  unlockBlocker,
  weeklyGuestPassAllowance,
} from '@/app/lib/guest-passes'

const throttleMap = new Map<string, { count: number; resetAt: number }>()
const THROTTLE_WINDOW_MS = 30_000
const THROTTLE_MAX = 10

function checkThrottle(token: string): boolean {
  const now = Date.now()
  const entry = throttleMap.get(token)
  if (!entry || now > entry.resetAt) {
    throttleMap.set(token, { count: 1, resetAt: now + THROTTLE_WINDOW_MS })
    return true
  }
  if (entry.count >= THROTTLE_MAX) return false
  entry.count++
  return true
}

// One post per pass, on first unlock, in the same shape as the day-pass
// activation post: who issued it, who the guest is, and how to reach them.
async function announceActivation(input: {
  guestName: string
  guestEmail: string
  hostName: string
  validDate: string
}) {
  try {
    await sendChannelMessage(
      DISCORD_CHANNELS.NOTIFICATIONS,
      `🎟️ **${input.guestName}** activated a guest pass`,
      [
        {
          color: 0xd97706, // amber-600
          fields: [
            {
              name: 'Issued by',
              value: input.hostName || 'Unknown',
              inline: true,
            },
            {
              name: 'Guest email',
              value: input.guestEmail || 'Not given',
              inline: true,
            },
            {
              name: 'Valid',
              value: `${input.validDate} until 11pm`,
              inline: true,
            },
          ],
        },
      ]
    )
  } catch (error) {
    console.error('[guest-unlock] Discord post failed:', error)
  }
}

export async function POST(request: Request) {
  try {
    const { token } = await request.json().catch(() => ({}))
    if (typeof token !== 'string' || !GUEST_TOKEN_PATTERN.test(token)) {
      return Response.json({ success: false, reason: 'invalid' })
    }
    if (!checkThrottle(token)) {
      return Response.json(
        { success: false, reason: 'throttled' },
        { status: 429 }
      )
    }

    const pass = await findGuestPassByToken(token)
    if (!pass) return Response.json({ success: false, reason: 'not-found' })

    const host = pass.hostId ? await getHost(pass.hostId) : null
    const hostAllowed =
      host !== null &&
      weeklyGuestPassAllowance({ status: host.status, tier: host.tier }) !== 0
    const blocker = hostAllowed ? unlockBlocker(pass) : 'revoked'
    if (blocker) {
      console.log(`[guest-unlock] pass=${pass.id} ok=false reason=${blocker}`)
      return Response.json({ success: false, reason: blocker })
    }

    const result = await adminUnlockDoor()
    console.log(
      `[guest-unlock] pass=${pass.id} guest="${pass.guestName}" host=${host?.email} ok=${result.ok}`
    )
    if (!result.ok) {
      return Response.json({ success: false, reason: 'verkada-error' })
    }

    // Bookkeeping must not block the door; the guest is already walking in.
    const firstTime = !pass.firstUsedAt
    recordGuestUnlock(pass).catch((error) =>
      console.error('[guest-unlock] failed to record unlock:', error)
    )
    if (firstTime) {
      announceActivation({
        guestName: pass.guestName,
        guestEmail: pass.guestEmail,
        hostName: host?.name || '',
        validDate: pass.validDate,
      })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('[guest-unlock] failed:', error)
    return Response.json({ success: false, reason: 'error' }, { status: 500 })
  }
}
