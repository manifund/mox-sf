import { env } from '@/app/lib/env'
import { refreshPinIndex } from '@/app/lib/door-pins'

/**
 * Every 30 minutes: rebuild the index the web keypad (/door) uses to find
 * which Verkada access user owns a typed code. Rebuilding reads every access
 * user once, which takes from half a minute to a couple of minutes, so it
 * runs here on a schedule instead of while someone waits at the door.
 *
 * Codes the site issues itself (member codes from the portal, guest passes)
 * are usable at /door at once without this. This job is what picks up codes
 * set or changed by hand in Verkada Command, within 30 minutes.
 *
 * Safe to run at any time: it skips if another rebuild is in progress.
 */

export const maxDuration = 300

/** A rebuild this recent is good enough; skip (guards double triggers). */
const MIN_AGE_MS = 5 * 60 * 1000

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron refresh-door-codes] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await refreshPinIndex(MIN_AGE_MS)
    console.log('[Cron refresh-door-codes]', JSON.stringify(result))
    return Response.json({ success: true, ...result })
  } catch (error) {
    console.error('[Cron refresh-door-codes] failed:', error)
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
