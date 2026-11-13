import { env } from '@/app/lib/env'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import {
  offboardEndedMembers,
  describeOffboardRun,
} from '@/app/lib/forkable-offboard'

/**
 * Daily cron: take people out of the Mox Forkable clubs once their membership
 * has ended.
 *
 * Airtable is the only input. Anyone in the People table who is marked
 * "In Forkable" and whose Status is Cancelled is removed from the Mox Members
 * and Mox Residents clubs and has "In Forkable" unchecked. Someone who still
 * has another Joined or Paused record with the same email is kept.
 *
 * Safe to re-run: a removed person is unchecked and drops out of the list. If
 * Forkable refuses the request the run stops at the first person and posts
 * what Forkable said to Discord, instead of failing once per person.
 */

export const maxDuration = 300

// One Forkable call and two or three Airtable calls per person.
const MAX_PER_RUN = 150

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron forkable-offboard] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const run = await offboardEndedMembers({ limit: MAX_PER_RUN })

    const count = (outcome: string) =>
      run.results.filter((r) => r.outcome === outcome).length
    const failed = count('failed')
    console.log(
      `[Cron forkable-offboard] Done in ${Date.now() - startedAt}ms: ` +
        `${run.candidates} candidate(s), ${count('removed')} removed, ` +
        `${count('skipped')} kept, ${failed} failed` +
        (run.stopped ? ` (stopped: ${run.stopped})` : '')
    )

    const message = describeOffboardRun(run)
    const channelId = DISCORD_CHANNELS.NOTIFICATIONS
    if (message && channelId) {
      const sent = await sendChannelMessage(channelId, message)
      if (!sent) {
        console.error(
          '[Cron forkable-offboard] Failed to send Discord notification'
        )
      }
    }

    return Response.json({
      success: failed === 0,
      candidates: run.candidates,
      removed: count('removed'),
      skipped: count('skipped'),
      failed,
      stopped: run.stopped,
      results: run.results,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[Cron forkable-offboard] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
