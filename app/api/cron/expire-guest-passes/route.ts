import { env } from '@/app/lib/env'
import { todayPT } from '@/app/lib/guest-passes'
import {
  expireGuestPass,
  listGuestPassesToExpire,
} from '@/app/lib/guest-passes-server'

/**
 * Nightly cron: close out guest passes whose day has ended. For each one,
 * read the guest's door events from Verkada (did they come in, and when),
 * delete the guest's Verkada access user so the code is gone for good, and
 * mark the Airtable record Activated (used) or Expired (never used).
 *
 * Verkada already stops the code at 11pm via the user's end date; this is
 * the cleanup behind that. Safe to re-run: it only touches passes that still
 * have a Verkada user.
 */

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron expire-guest-passes] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const today = todayPT()
  const results: {
    id: string
    guestName: string
    validDate: string
    ok: boolean
    used?: boolean
    error?: string
  }[] = []

  try {
    const passes = await listGuestPassesToExpire(today)
    console.log(
      `[Cron expire-guest-passes] ${passes.length} pass(es) to close out before ${today}`
    )

    for (const pass of passes) {
      try {
        const { unlockCount } = await expireGuestPass(pass)
        results.push({
          id: pass.id,
          guestName: pass.guestName,
          validDate: pass.validDate,
          ok: true,
          used: unlockCount > 0,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `[Cron expire-guest-passes] pass ${pass.id} failed:`,
          message
        )
        results.push({
          id: pass.id,
          guestName: pass.guestName,
          validDate: pass.validDate,
          ok: false,
          error: message,
        })
      }
    }

    const failed = results.filter((r) => !r.ok).length
    console.log(
      `[Cron expire-guest-passes] Done in ${Date.now() - startedAt}ms: ${results.length - failed} closed, ${failed} failed`
    )
    return Response.json({
      success: failed === 0,
      today,
      closed: results.length - failed,
      failed,
      results,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[Cron expire-guest-passes] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
