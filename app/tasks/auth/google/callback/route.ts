import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { env } from '@/app/lib/env'
import { createClaimerSession } from '@/app/lib/tasks-auth'
import { finishStudioConsent } from '@/app/lib/studio-oauth'

interface GoogleUser {
  email?: string
  name?: string
  verified_email?: boolean
}

/**
 * Google OAuth callback — exchanges the code, then mints the isolated
 * `mox-tasks` claimer session and returns to the originating /tasks page.
 */
export async function GET(request: NextRequest) {
  // Reuse the registered redirect URI; keep studio consent isolated from task login.
  if (request.nextUrl.searchParams.get('state')?.startsWith('studio.')) {
    return finishStudioConsent(request)
  }
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('tasks_oauth_state')?.value
  const redirectTo = cookieStore.get('tasks_oauth_redirect')?.value || '/tasks'
  cookieStore.delete('tasks_oauth_state')
  cookieStore.delete('tasks_oauth_redirect')

  if (error) {
    return NextResponse.redirect(
      new URL('/tasks?error=google_denied', request.url)
    )
  }
  if (!code || !state || !storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL('/tasks?error=invalid_state', request.url)
    )
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.TASKS_GOOGLE_CLIENT_ID,
        client_secret: env.TASKS_GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/tasks/auth/google/callback`,
      }),
    })
    if (!tokenRes.ok) {
      console.error(
        '[tasks] Google token exchange failed:',
        await tokenRes.text()
      )
      return NextResponse.redirect(
        new URL('/tasks?error=google_token', request.url)
      )
    }
    const { access_token } = await tokenRes.json()

    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    )
    if (!userRes.ok) {
      console.error('[tasks] Google userinfo failed:', userRes.status)
      return NextResponse.redirect(
        new URL('/tasks?error=google_user', request.url)
      )
    }
    const user: GoogleUser = await userRes.json()
    if (!user.email) {
      return NextResponse.redirect(
        new URL('/tasks?error=no_email', request.url)
      )
    }

    await createClaimerSession(user.email, user.name || user.email)
    return NextResponse.redirect(new URL(redirectTo, request.url))
  } catch (err) {
    console.error('[tasks] Google OAuth callback error:', err)
    return NextResponse.redirect(new URL('/tasks?error=server', request.url))
  }
}
