import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/app/lib/session'
import { isDiscordConfigured } from '@/app/lib/discord'
import { syncAirtableDiscordRoles } from '@/app/lib/discord-role-sync'

export const maxDuration = 300

/** Staff-only reconciliation of Airtable membership tiers and program roles. */
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (!isDiscordConfigured()) {
    return NextResponse.json(
      { error: 'Discord integration not configured' },
      { status: 503 }
    )
  }
  try {
    const result = await syncAirtableDiscordRoles({
      dryRun: request.nextUrl.searchParams.get('dry') === '1',
    })
    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (error) {
    console.error('Error bulk syncing Discord roles:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
