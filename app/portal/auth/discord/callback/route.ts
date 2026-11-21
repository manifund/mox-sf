import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/app/lib/env'
import { createSession, getSession } from '@/app/lib/session'
import { findRecord, getRecord, updateRecord, Tables } from '@/app/lib/airtable'
import {
  addGuildMember,
  getGuildMember,
  syncDiscordRole,
} from '@/app/lib/discord'
import { escapeAirtableString } from '@/app/lib/airtable-helpers'
import { cookies } from 'next/headers'

interface DiscordUser {
  id: string
  username: string
  global_name: string | null
}

interface PersonFields {
  Email?: string
  Name?: string
  Tier?: string
  'Discord Username'?: string
  Status?: string
  Program?: string[]
}

/**
 * Discord OAuth2 callback handler
 * Exchanges the authorization code for user info, then either logs the member
 * in (login mode) or connects Discord to their logged-in record (link mode).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const cookieStore = await cookies()
  const linking = cookieStore.get('discord_oauth_mode')?.value === 'link'
  cookieStore.delete('discord_oauth_mode')
  // Link-mode problems are shown on the portal, login-mode ones on the login page
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        linking ? `/portal?discord=${reason}` : `/portal/login?error=${reason}`,
        request.url
      )
    )

  // Handle user denying authorization
  if (error) {
    console.log('Discord OAuth error:', error)
    return fail('discord_denied')
  }

  if (!code || !state) {
    return fail('invalid')
  }

  // Verify state to prevent CSRF attacks
  const storedState = cookieStore.get('discord_oauth_state')?.value

  if (!storedState || storedState !== state) {
    return fail('invalid_state')
  }

  // Clear the state cookie
  cookieStore.delete('discord_oauth_state')

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/portal/auth/discord/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Discord token exchange failed:', errorData)
      return fail('discord_token_failed')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Fetch Discord user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      console.error('Discord user fetch failed:', userResponse.status)
      return fail('discord_user_failed')
    }

    const discordUser: DiscordUser = await userResponse.json()
    console.log('Discord user authenticated:', discordUser.id, discordUser.username)

    if (linking) {
      return await linkDiscordToMember(request, discordUser, accessToken)
    }

    // Look up user in Airtable by Discord username
    const escapedUsername = escapeAirtableString(discordUser.username)
    const formula = `{Discord Username} = '${escapedUsername}'`

    const record = await findRecord<PersonFields>(Tables.People, formula)

    if (!record) {
      // User not found in our system
      console.log('Discord user not found in Airtable:', discordUser.username)
      return NextResponse.redirect(
        new URL('/portal/login?error=discord_not_linked', request.url)
      )
    }

    if (!record.fields.Email) {
      console.error('User found but has no email:', record.id)
      return NextResponse.redirect(
        new URL('/portal/login?error=no_email', request.url)
      )
    }

    // Create session
    const isStaff = record.fields.Tier === 'Staff'
    await createSession(record.id, record.fields.Email, record.fields.Name, isStaff)

    console.log('Discord login successful for:', record.fields.Email)

    // Redirect to portal
    return NextResponse.redirect(new URL('/portal', request.url))
  } catch (error) {
    console.error('Discord OAuth callback error:', error)
    return fail('server')
  }
}

/**
 * Link mode: save the verified Discord username on the logged-in member's
 * record, add them to the Mox server, and give them their member role.
 * Redirects to /portal?discord=<outcome>, which the portal turns into a note.
 */
async function linkDiscordToMember(
  request: NextRequest,
  discordUser: DiscordUser,
  accessToken: string
) {
  const done = (outcome: string) =>
    NextResponse.redirect(new URL(`/portal?discord=${outcome}`, request.url))

  // Admins viewing as someone else connect their own account, never the member's.
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }

  const username = discordUser.username
  const owner = await findRecord<PersonFields>(
    Tables.People,
    `LOWER({Discord Username}) = '${escapeAirtableString(username.toLowerCase())}'`
  )
  if (owner && owner.id !== session.userId) {
    console.log('Discord username already linked to another record:', username)
    return done('taken')
  }

  await updateRecord<PersonFields>(Tables.People, session.userId, {
    'Discord Username': username,
  })
  const person = await getRecord<PersonFields>(Tables.People, session.userId)

  const joined = await addGuildMember(discordUser.id, accessToken)
  const member =
    joined === 'failed' ? null : await getGuildMember(discordUser.id)
  if (!member) {
    // Username is saved, so the 5-minute role sync finishes once they join.
    return done('join_failed')
  }

  const sync = await syncDiscordRole(
    username,
    person?.fields.Tier || null,
    person?.fields.Status || null,
    person?.fields.Program || [],
    { member }
  )
  if (!sync.success) {
    console.log('Discord connected but role not set:', username, sync.error)
  }
  return done(sync.success ? 'connected' : 'connected_no_role')
}
