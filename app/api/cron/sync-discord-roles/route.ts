import { env } from '@/app/lib/env'
import { isDiscordConfigured } from '@/app/lib/discord'
import { syncAirtableDiscordRoles } from '@/app/lib/discord-role-sync'

export const maxDuration = 300

/** Every five minutes: sync Airtable membership tiers and program participant roles. */
export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isDiscordConfigured()) {
    return Response.json(
      { error: 'Discord integration not configured' },
      { status: 503 }
    )
  }
  try {
    const result = await syncAirtableDiscordRoles({
      dryRun: new URL(request.url).searchParams.get('dry') === '1',
    })
    console.log(
      '[Cron sync-discord-roles]',
      JSON.stringify({ ...result, results: undefined })
    )
    return Response.json(result, { status: result.success ? 200 : 502 })
  } catch (error) {
    console.error('[Cron sync-discord-roles]', error)
    return Response.json(
      { success: false, error: 'Discord role sync failed; check server logs' },
      { status: 500 }
    )
  }
}
