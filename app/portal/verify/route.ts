import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/app/lib/session'
import { isValidToken, escapeAirtableString } from '@/app/lib/airtable-helpers'
import { findRecord, updateRecord, Tables } from '@/app/lib/airtable'
import { syncDiscordRole } from '@/app/lib/discord'

interface PersonFields {
  Email?: string
  Name?: string
  Tier?: string
  Status?: string
  Program?: string[]
  'Discord Username'?: string
  magic_link_token?: string
  token_expires?: string
}

export async function GET(request: NextRequest) {
  // Block Discord's link preview crawler from consuming the token
  const userAgent = request.headers.get('user-agent') || ''
  if (userAgent.includes('Discordbot')) {
    return new NextResponse('OK', { status: 200 })
  }

  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get('token')
  const discordUsername = searchParams.get('discord')

  if (!token) {
    return NextResponse.redirect(
      new URL('/portal/login?error=invalid', request.url)
    )
  }

  // Validate token format (should be 64-char hex string from randomBytes(32))
  if (!isValidToken(token, 64)) {
    return NextResponse.redirect(
      new URL('/portal/login?error=invalid', request.url)
    )
  }

  try {
    // Verify token and get user
    const user = await verifyToken(token)

    if (!user) {
      return NextResponse.redirect(
        new URL('/portal/login?error=expired', request.url)
      )
    }

    // Create session
    await createSession(user.id, user.email, user.name, user.isStaff)

    // Clear the token and optionally link Discord
    const discordLinked = await clearTokenAndLinkDiscord(
      user.id,
      discordUsername,
      user.tier,
      user.status
    )

    // Redirect to portal
    const redirectUrl = discordLinked
      ? new URL('/portal?discord_linked=true', request.url)
      : new URL('/portal', request.url)
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('Error verifying token:', error)
    return NextResponse.redirect(
      new URL('/portal/login?error=server', request.url)
    )
  }
}

async function verifyToken(token: string) {
  // Use escapeAirtableString to prevent formula injection
  const escapedToken = escapeAirtableString(token)
  const formula = `{magic_link_token} = '${escapedToken}'`

  const record = await findRecord<PersonFields>(Tables.People, formula)

  if (!record) {
    return null
  }

  // Email is required for login
  if (!record.fields.Email) {
    return null
  }

  const expiresAt = new Date(record.fields.token_expires || '')

  // Check if token is expired
  if (expiresAt < new Date()) {
    return null
  }

  // Debug: Log what we're getting from Airtable
  console.log('User login - Tier from Airtable:', record.fields.Tier)
  console.log('User login - isStaff will be:', record.fields.Tier === 'Staff')

  return {
    id: record.id,
    email: record.fields.Email,
    name: record.fields.Name,
    isStaff: record.fields.Tier === 'Staff',
    tier: record.fields.Tier,
    status: record.fields.Status,
  }
}

async function clearTokenAndLinkDiscord(
  recordId: string,
  discordUsername: string | null,
  tier?: string,
  status?: string
): Promise<boolean> {
  // Clear the token, and set Discord Username if provided
  const updates: Partial<PersonFields> = {
    magic_link_token: '',
    token_expires: undefined,
  }

  if (discordUsername) {
    updates['Discord Username'] = discordUsername
  }

  const updated = await updateRecord<PersonFields>(
    Tables.People,
    recordId,
    updates
  )

  // If we linked Discord, sync their role
  if (discordUsername && tier && status) {
    await syncDiscordRole(
      discordUsername,
      updated.fields.Tier || null,
      updated.fields.Status || null,
      updated.fields.Program || []
    )
    return true
  }

  return false
}
