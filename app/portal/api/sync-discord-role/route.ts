import { NextRequest, NextResponse } from 'next/server'
import { getSession, isCurrentlyStaff } from '@/app/lib/session'
import { syncDiscordRole, isDiscordConfigured } from '@/app/lib/discord'
import { getRecord, Tables } from '@/app/lib/airtable'
import type { DiscordPersonFields } from '@/app/lib/discord-role-sync'

/**
 * POST: Sync Discord role for a specific user (staff only, or self)
 * Used after profile update or for manual sync
 */
export async function POST(request: NextRequest) {
  const session = await getSession()

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDiscordConfigured()) {
    return NextResponse.json(
      { error: 'Discord integration not configured' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const userId = body.userId || session.userId
    if (typeof userId !== 'string' || !/^rec[a-zA-Z0-9]{14}$/.test(userId)) {
      return NextResponse.json(
        { error: 'Valid userId required' },
        { status: 400 }
      )
    }

    // Only allow syncing own role, or staff can sync anyone
    if (
      userId !== session.userId &&
      !(await isCurrentlyStaff(session.userId))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Airtable is authoritative; never grant roles using client-supplied tier/status.
    const person = await getRecord<DiscordPersonFields>(Tables.People, userId)
    if (!person)
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    const { Tier: tier, Status: status, Program: programIds } = person.fields
    const discordUsername = person.fields['Discord Username']
    if (!discordUsername) {
      return NextResponse.json(
        { error: 'Discord username required' },
        { status: 400 }
      )
    }

    const result = await syncDiscordRole(
      discordUsername,
      tier || null,
      status || null,
      programIds || []
    )

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      discordUserId: result.discordUserId,
      roleAssigned: result.roleAssigned,
      programRoles: result.programRoles,
    })
  } catch (error) {
    console.error('Error syncing Discord role:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
