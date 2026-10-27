import { env } from '@/app/lib/env'
import { sendEmail } from '@/app/lib/email'
import { listRecentTaskEvents, listTasks } from '@/app/lib/tasks'

const BASE = env.TASKS_BASE_URL
const ICONS: Record<string, string> = {
  Claimed: '🙋',
  Completed: '✅',
  Released: '↩️',
  'Auto-released': '⏰',
  Approved: '🎉',
}

function recipients(): string[] {
  return env.TASKS_ORGANIZER_EMAILS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Daily digest of task board activity to organizers. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron tasks-digest] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const to = recipients()
    if (to.length === 0)
      return Response.json({ success: true, skipped: 'no organizer emails' })

    const [events, tasks] = await Promise.all([
      listRecentTaskEvents(24),
      listTasks(),
    ])
    const open = tasks.filter((t) => t.status === 'Open').length
    const claimed = tasks.filter((t) => t.status === 'Claimed').length
    const inReview = tasks.filter((t) => t.status === 'In review')

    if (events.length === 0 && inReview.length === 0) {
      return Response.json({ success: true, skipped: 'nothing to report' })
    }

    const reviewBlock = inReview.length
      ? `<p style="background:#dbeafe;padding:12px 16px;border-radius:10px"><strong>${inReview.length} task${inReview.length > 1 ? 's' : ''} waiting on review:</strong><br>${inReview
          .map((t) => `• ${t.title} (${t.claimantName})`)
          .join('<br>')}</p>`
      : ''
    const eventBlock = events.length
      ? `<p><strong>Last 24 hours:</strong></p><p>${events
          .map((e) => `${ICONS[e.type] ?? '•'} ${e.summary}`)
          .join('<br>')}</p>`
      : '<p>No board activity in the last 24 hours.</p>'

    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.55">
      <p style="font-weight:700;letter-spacing:0.08em;font-size:13px;color:#78350f;margin:0 0 20px">MOX ᴛᴀꜱᴋꜱ</p>
      ${reviewBlock}${eventBlock}
      <p><a href="${BASE}" style="color:#78350f;font-weight:600">Open the board</a></p>
    </div>`

    await sendEmail({
      to,
      from: 'Mox Tasks <portal@account.moxsf.com>',
      subject: `Mox tasks digest — ${open} open, ${claimed} in progress${inReview.length ? `, ${inReview.length} to review` : ''}`,
      text: events.map((e) => e.summary).join('\n') || 'Tasks awaiting review.',
      html,
    })

    return Response.json({
      success: true,
      events: events.length,
      inReview: inReview.length,
    })
  } catch (error) {
    console.error('[Cron tasks-digest] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
