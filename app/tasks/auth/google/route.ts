import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { env } from '@/app/lib/env'

/**
 * Google OAuth start — public task-claimer sign-in (scoped to /tasks only).
 * Mirrors the portal Discord OAuth flow, but mints the isolated `mox-tasks`
 * session in the callback rather than a member session.
 */
export async function GET(request: NextRequest) {
  if (!env.TASKS_GOOGLE_CLIENT_ID || !env.TASKS_GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL('/tasks?error=google_not_configured', request.url)
    )
  }

  // Only allow returning to a /tasks path (prevents open-redirect).
  const raw = request.nextUrl.searchParams.get('redirect') || '/tasks'
  const redirectTo = raw.startsWith('/tasks') ? raw : '/tasks'

  const state = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    maxAge: 60 * 10,
    path: '/',
  }
  cookieStore.set('tasks_oauth_state', state, cookieOpts)
  cookieStore.set('tasks_oauth_redirect', redirectTo, cookieOpts)

  const params = new URLSearchParams({
    client_id: env.TASKS_GOOGLE_CLIENT_ID,
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/tasks/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
