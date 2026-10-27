import { sendEmail } from '@/app/lib/email'
import { env } from '@/app/lib/env'
import { addDays, mondayOf } from '@/app/lib/checkins'
import { GEF_ABSENCE_FLAG_DAYS, getGefAttendanceReport } from '@/app/lib/gef'

/**
 * Monday-morning cron: email Carolina a summary of GEF fellow attendance for
 * the week that just ended, flagging fellows who haven't been seen recently.
 *
 * Query params: ?to=someone@moxsf.com overrides the recipient (for testing).
 */

const RECIPIENT = 'carolina@moxsf.com'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatLastSeen(
  lastSeen: string | null,
  daysSinceSeen: number | null
): string {
  if (!lastSeen || daysSinceSeen === null) return 'never (in last 4 weeks)'
  if (daysSinceSeen === 0) return 'today'
  if (daysSinceSeen === 1) return 'yesterday'
  return `${daysSinceSeen} days ago (${lastSeen})`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron gef-weekly-digest] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const toParam = url.searchParams.get('to')
  const recipient =
    toParam && toParam.endsWith('@moxsf.com') ? toParam : RECIPIENT

  try {
    const { fellows, summaries, today } = await getGefAttendanceReport()

    if (fellows.length === 0) {
      console.log(
        '[Cron gef-weekly-digest] No GEF fellows found; skipping email'
      )
      return Response.json({ success: true, skipped: 'no fellows' })
    }

    // The week being reported: the Mon–Sun that ended yesterday (this cron
    // runs Monday morning).
    const lastWeekStart = addDays(mondayOf(today), -7)
    const lastWeekEnd = addDays(lastWeekStart, 6)

    const rows = fellows.map((fellow) => {
      const summary = summaries.get(fellow.id)!
      const daysLastWeek = summary.dates.filter(
        (d) => d >= lastWeekStart && d <= lastWeekEnd
      ).length
      const flagged =
        summary.daysSinceSeen === null ||
        summary.daysSinceSeen >= GEF_ABSENCE_FLAG_DAYS
      return { fellow, summary, daysLastWeek, flagged }
    })

    const flaggedRows = rows.filter((r) => r.flagged)

    const textLines = rows.map(
      ({ fellow, summary, daysLastWeek, flagged }) =>
        `${flagged ? '⚠️ ' : ''}${fellow.name}: ${daysLastWeek} day(s) last week, last seen ${formatLastSeen(summary.lastSeen, summary.daysSinceSeen)}`
    )
    const text = [
      `GEF attendance for ${lastWeekStart} – ${lastWeekEnd}`,
      '',
      ...textLines,
    ].join('\n')

    const tableRows = rows
      .map(
        ({ fellow, summary, daysLastWeek, flagged }) => `
        <tr${flagged ? ' style="background: #fff3f0;"' : ''}>
          <td style="padding: 6px 12px 6px 0; font-weight: 600;">${flagged ? '⚠️ ' : ''}${escapeHtml(fellow.name)}</td>
          <td style="padding: 6px 12px 6px 0; text-align: center;">${daysLastWeek}</td>
          <td style="padding: 6px 12px 6px 0; text-align: center;">${summary.daysLast4Weeks}</td>
          <td style="padding: 6px 0;">${escapeHtml(formatLastSeen(summary.lastSeen, summary.daysSinceSeen))}</td>
        </tr>`
      )
      .join('')

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">GEF attendance: ${lastWeekStart} – ${lastWeekEnd}</h2>
        <p style="color: #666; margin-top: 0;">
          ${fellows.length} fellow(s)${flaggedRows.length > 0 ? `, <strong>${flaggedRows.length} not seen in ${GEF_ABSENCE_FLAG_DAYS}+ days</strong>` : ', everyone seen recently'}
        </p>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr style="text-align: left; color: #666; border-bottom: 1px solid #ddd;">
              <th style="padding: 6px 12px 6px 0;">Fellow</th>
              <th style="padding: 6px 12px 6px 0;">Days last week</th>
              <th style="padding: 6px 12px 6px 0;">Last 4 weeks</th>
              <th style="padding: 6px 0;">Last seen</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`

    const sent = await sendEmail({
      to: recipient,
      from: 'Mox GEF <portal@account.moxsf.com>',
      subject: `GEF weekly: ${flaggedRows.length > 0 ? `${flaggedRows.length} fellow(s) need a check-in` : 'all fellows active'}`,
      text,
      html,
    })

    if (!sent) {
      throw new Error('Failed to send digest email')
    }

    console.log(
      `[Cron gef-weekly-digest] Sent digest to ${recipient}: ${fellows.length} fellows, ${flaggedRows.length} flagged`
    )
    return Response.json({
      success: true,
      recipient,
      fellows: fellows.length,
      flagged: flaggedRows.length,
      week: `${lastWeekStart} – ${lastWeekEnd}`,
    })
  } catch (error) {
    console.error('[Cron gef-weekly-digest] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
