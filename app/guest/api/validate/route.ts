import { findGuestPassByToken, getHost } from '@/app/lib/guest-passes-server'
import {
  GUEST_TOKEN_PATTERN,
  guestPassState,
  weeklyGuestPassAllowance,
} from '@/app/lib/guest-passes'

const ipThrottleMap = new Map<string, { count: number; resetAt: number }>()
const IP_WINDOW_MS = 60_000
const IP_MAX = 30

function checkIpThrottle(ip: string): boolean {
  const now = Date.now()
  const entry = ipThrottleMap.get(ip)
  if (!entry || now > entry.resetAt) {
    ipThrottleMap.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS })
    return true
  }
  if (entry.count >= IP_MAX) return false
  entry.count++
  return true
}

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }

// Public, token-gated. Tells the guest page what to show; never reveals
// anything beyond the guest's own name, the host's first name, and the date.
export async function POST(request: Request) {
  try {
    if (!checkIpThrottle(getClientIp(request))) {
      return Response.json(
        { status: 'not-found' },
        { status: 429, ...NO_STORE }
      )
    }
    const { token } = await request.json().catch(() => ({}))
    if (typeof token !== 'string' || !GUEST_TOKEN_PATTERN.test(token)) {
      return Response.json({ status: 'not-found' }, NO_STORE)
    }

    const pass = await findGuestPassByToken(token)
    if (!pass) return Response.json({ status: 'not-found' }, NO_STORE)

    const host = pass.hostId ? await getHost(pass.hostId) : null
    const hostFirstName = host?.name.split(' ')[0] || 'A member'
    // A pass dies with its host's membership.
    const hostAllowed =
      host !== null &&
      weeklyGuestPassAllowance({ status: host.status, tier: host.tier }) !== 0

    const state = hostAllowed ? guestPassState(pass) : 'revoked'
    return Response.json(
      {
        status: state,
        guestName: pass.guestName,
        hostFirstName,
        validDate: pass.validDate,
      },
      NO_STORE
    )
  } catch (error) {
    console.error('[guest-validate] failed:', error)
    return Response.json({ status: 'error' }, { status: 500 })
  }
}
