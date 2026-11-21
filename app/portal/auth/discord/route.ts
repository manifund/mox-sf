import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/app/lib/env'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { getSession } from '@/app/lib/session'

/**
 * Discord OAuth2 authorization endpoint
 * Redirects users to Discord to authorize the application.
 *
 * Two modes, remembered in a cookie for the callback:
 *   /portal/auth/discord          log in with an already-linked Discord account
 *   /portal/auth/discord?link=1   a logged-in member connects their Discord:
 *                                 saves their username, adds them to the
 *                                 server (guilds.join) and sets their role
 */
export async function GET(request: NextRequest) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL('/portal/login?error=discord_not_configured', request.url)
    )
  }

  const linking = request.nextUrl.searchParams.get('link') === '1'
  if (linking) {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.redirect(new URL('/portal/login', request.url))
    }
  }

  // Generate a state parameter for CSRF protection
  const state = randomBytes(16).toString('hex')

  // Store state in a cookie for verification in the callback
  const cookieStore = await cookies()
  cookieStore.set('discord_oauth_state', state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })
  cookieStore.set('discord_oauth_mode', linking ? 'link' : 'login', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  // Build the Discord OAuth2 authorization URL
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/portal/auth/discord/callback`,
    response_type: 'code',
    // Login only needs who they are; connecting also lets us add them to the server
    scope: linking ? 'identify guilds.join' : 'identify',
    state,
  })

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`

  return NextResponse.redirect(discordAuthUrl)
}
