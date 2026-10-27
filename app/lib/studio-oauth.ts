import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { NextRequest, NextResponse } from 'next/server'
import { env } from './env'
import { requireStaff } from './session'
import {
  sealStudioConnection,
  STUDIO_OWNER_EMAIL,
  STUDIO_SCOPE,
  STUDIO_CALENDAR_ID,
} from './studio-calendar'

type PendingConsent = {
  state?: string
  verifier?: string
  userId?: string
  expires?: number
}
async function pendingConsent() {
  return getIronSession<PendingConsent>(await cookies(), {
    password: env.SESSION_SECRET,
    cookieName: 'mox-studio-oauth',
    ttl: 600,
    cookieOptions: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    },
  })
}

export async function studioOwner() {
  const staff = await requireStaff()
  // Portal identity and the Google calendar owner are separate accounts.
  return staff?.email.toLowerCase() === 'carolinaollive@gmail.com' &&
    !staff.viewingAsUserId
    ? staff
    : null
}

const redirectUri = () =>
  `${env.NEXT_PUBLIC_BASE_URL}/tasks/auth/google/callback`
function result(message: string, status = 400) {
  return new NextResponse(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

export async function startStudioConsent(request: NextRequest) {
  const owner = await studioOwner()
  if (!owner)
    return result(
      'Sign in to the member portal as carolinaollive@gmail.com to connect the studio calendar.',
      403
    )
  if (
    request.headers.get('origin') !== new URL(env.NEXT_PUBLIC_BASE_URL).origin
  )
    return result('Invalid origin', 403)
  if (!env.TASKS_GOOGLE_CLIENT_ID || !env.TASKS_GOOGLE_CLIENT_SECRET)
    return result('Google OAuth client is not configured.', 503)
  const pending = await pendingConsent()
  pending.state = `studio.${randomBytes(32).toString('base64url')}`
  pending.verifier = randomBytes(32).toString('base64url')
  pending.userId = owner.userId
  pending.expires = Date.now() + 600_000
  await pending.save()
  const params = new URLSearchParams({
    client_id: env.TASKS_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: `openid email ${STUDIO_SCOPE}`,
    state: pending.state,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: STUDIO_OWNER_EMAIL,
    code_challenge: createHash('sha256')
      .update(pending.verifier)
      .digest('base64url'),
    code_challenge_method: 'S256',
  })
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    303
  )
}

export async function finishStudioConsent(request: NextRequest) {
  const owner = await studioOwner()
  if (!owner)
    return result(
      'Sign in to the member portal as carolinaollive@gmail.com and reconnect.',
      403
    )
  const pending = await pendingConsent()
  const { state, verifier, userId, expires } = pending
  pending.destroy()
  const params = request.nextUrl.searchParams
  if (
    !state ||
    params.get('state') !== state ||
    userId !== owner.userId ||
    !expires ||
    expires < Date.now() ||
    !verifier
  )
    return result(
      'Connection expired. Return to the studio connection page and try again.'
    )
  if (params.has('error'))
    return result('Google Calendar access was not approved.')
  const code = params.get('code')
  if (!code) return result('Missing Google authorization code.')
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.TASKS_GOOGLE_CLIENT_ID,
        client_secret: env.TASKS_GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(),
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    })
    if (!response.ok)
      return result('Google authorization failed. Please reconnect.')
    const token = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      scope?: string
    }
    if (
      !token.access_token ||
      !token.refresh_token ||
      !token.scope?.split(' ').includes(STUDIO_SCOPE)
    )
      return result(
        'Calendar access and offline access are required. Please reconnect and approve Calendar access.'
      )
    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: 'no-store',
      }
    )
    if (!userResponse.ok) return result('Could not verify the Google account.')
    const user = (await userResponse.json()) as {
      email?: string
      verified_email?: boolean
    }
    if (
      !user.verified_email ||
      user.email?.toLowerCase() !== STUDIO_OWNER_EMAIL
    )
      return result(`Please connect ${STUDIO_OWNER_EMAIL}.`, 403)
    const calendar = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(STUDIO_CALENDAR_ID)}/events?maxResults=1`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: 'no-store',
      }
    )
    if (!calendar.ok) {
      const failure = await calendar.json().catch(() => null)
      // Only expose known error identifiers, never Google's raw response or tokens.
      const reasons = [
        ...(Array.isArray(failure?.error?.errors)
          ? failure.error.errors.map((item: { reason?: string }) => item.reason)
          : []),
        ...(Array.isArray(failure?.error?.details)
          ? failure.error.details.map(
              (item: { reason?: string }) => item.reason
            )
          : []),
      ]
      if (
        reasons.includes('accessNotConfigured') ||
        reasons.includes('SERVICE_DISABLED')
      ) {
        const project = env.TASKS_GOOGLE_CLIENT_ID.match(/^\d+(?=-)/)?.[0]
        const link =
          'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com' +
          (project ? `?project=${project}` : '')
        return result(
          `Google Calendar API is disabled. Open ${link} and click Enable, then reconnect the studio calendar.`
        )
      }
      if (calendar.status === 404 || reasons.includes('notFound'))
        return result(
          `Google cannot find the studio calendar for ${STUDIO_OWNER_EMAIL}. Share the studio calendar with that account with "Make changes to events" permission, then reconnect.`
        )
      if (calendar.status === 403)
        return result(
          `Google denied calendar access (403). Check that ${STUDIO_OWNER_EMAIL} has "Make changes to events" permission on the studio calendar and that your Google Workspace administrator allows Calendar API access.`
        )
      return result(
        `Google Calendar access failed (HTTP ${calendar.status}). Please reconnect in a few minutes.`,
        502
      )
    }
    const credential = await sealStudioConnection({
      email: STUDIO_OWNER_EMAIL,
      refreshToken: token.refresh_token,
    })
    return new NextResponse(credential, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition':
          'attachment; filename="mox-studio-connection.txt"',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // Never log authorization codes, tokens, or credential-bearing responses.
    return result(
      'Could not prepare the Google connection. Please reconnect.',
      503
    )
  }
}
