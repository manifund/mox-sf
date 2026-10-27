import { getSession } from '@/app/lib/session'
import { env } from '@/app/lib/env'
import { isValidEmail } from '@/app/lib/airtable-helpers'
import {
  isIssuableDate,
  remainingThisWeek,
  todayPT,
  weekBounds,
  weeklyGuestPassAllowance,
  GUEST_PASS_MAX_DAYS_AHEAD,
} from '@/app/lib/guest-passes'
import {
  createGuestPass,
  getHost,
  listGuestPassesForHost,
  summarizeGuestPass,
  type GuestPassRecord,
} from '@/app/lib/guest-passes-server'

// Passes that count against a week: anything dated in it that wasn't revoked.
function countInWeek(passes: GuestPassRecord[], date: string): number {
  const { start, end } = weekBounds(date)
  return passes.filter(
    (p) => p.status !== 'Revoked' && p.validDate >= start && p.validDate <= end
  ).length
}

async function loadContext() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return null
  const hostId = session.viewingAsUserId || session.userId
  const host = await getHost(hostId)
  if (!host) return null
  const allowance = weeklyGuestPassAllowance({
    status: host.status,
    tier: host.tier,
  })
  const passes = await listGuestPassesForHost(host.email)
  return { host, allowance, passes }
}

function guestLink(token: string): string {
  return `${env.NEXT_PUBLIC_BASE_URL}/guest/${token}`
}

export async function GET() {
  try {
    const ctx = await loadContext()
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { allowance, passes } = ctx
    const today = todayPT()
    const { start, end } = weekBounds(today)
    const now = new Date()
    // Show this week's passes plus anything upcoming.
    const visible = passes.filter((p) => p.validDate >= start)
    return Response.json({
      allowance,
      remaining: remainingThisWeek(allowance, countInWeek(passes, today)),
      weekStart: start,
      weekEnd: end,
      today,
      maxDaysAhead: GUEST_PASS_MAX_DAYS_AHEAD,
      passes: visible.map((p) => ({
        ...summarizeGuestPass(p, now),
        link: guestLink(p.token),
      })),
    })
  } catch (error) {
    console.error('[guest-passes] GET failed:', error)
    return Response.json(
      { error: 'Failed to load guest passes' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await loadContext()
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { host, allowance, passes } = ctx

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }
    const guestName =
      typeof body.guestName === 'string' ? body.guestName.trim() : ''
    const guestEmail =
      typeof body.guestEmail === 'string'
        ? body.guestEmail.trim().toLowerCase()
        : ''
    const validDate =
      typeof body.validDate === 'string' && body.validDate
        ? body.validDate
        : todayPT()

    if (!guestName) {
      return Response.json(
        { error: "enter your guest's name" },
        { status: 400 }
      )
    }
    if (guestName.length > 80) {
      return Response.json({ error: 'that name is too long' }, { status: 400 })
    }
    if (!isValidEmail(guestEmail)) {
      return Response.json(
        { error: 'enter a valid email for your guest' },
        { status: 400 }
      )
    }
    if (guestEmail === host.email.toLowerCase()) {
      return Response.json(
        {
          error:
            'this pass is for a guest. for yourself, use your member access.',
        },
        { status: 400 }
      )
    }
    if (!isIssuableDate(validDate)) {
      return Response.json(
        {
          error: `pick a date from today through ${GUEST_PASS_MAX_DAYS_AHEAD} days out`,
        },
        { status: 400 }
      )
    }
    if (allowance === 0) {
      return Response.json(
        { error: 'your membership does not include guest passes' },
        { status: 403 }
      )
    }
    const used = countInWeek(passes, validDate)
    if (allowance !== null && used >= allowance) {
      return Response.json(
        {
          error: `you've used this week's ${allowance} passes`,
          code: 'quota',
        },
        { status: 409 }
      )
    }

    const pass = await createGuestPass({
      hostId: host.id,
      guestName,
      guestEmail,
      validDate,
    })
    console.log(
      `[guest-passes] ${host.email} issued pass ${pass.id} for "${guestName}" <${guestEmail}> on ${validDate}`
    )
    return Response.json({
      pass: { ...summarizeGuestPass(pass), link: guestLink(pass.token) },
      remaining: remainingThisWeek(
        allowance,
        countInWeek([...passes, pass], validDate)
      ),
    })
  } catch (error) {
    console.error('[guest-passes] POST failed:', error)
    return Response.json(
      { error: 'Failed to create guest pass' },
      { status: 500 }
    )
  }
}
