import { findRecords, Tables } from '@/app/lib/airtable'
import { sendEmail } from '@/app/lib/email'
import { env } from '@/app/lib/env'
import { extractJson, isClaudeConfigured } from '@/app/lib/claude'

/**
 * Weekly cron: email members who opted in (People "Event digest" checkbox)
 * their top 3 upcoming Mox events, picked by Claude from their profile
 * interests with a one-line "why".
 *
 * Query params:
 *   ?dry=1            compute picks but send nothing
 *   ?to=x@moxsf.com   send ALL digests to this address instead (testing)
 */

export const maxDuration = 300

const MAX_RECIPIENTS_PER_RUN = 100

const PICKS_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          event: {
            type: 'string',
            description: 'Event name, exactly as given',
          },
          why: {
            type: 'string',
            description: 'One short sentence tailored to this member',
          },
        },
        required: ['event', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
}

interface SubscriberFields {
  Name?: string
  Email?: string
  'Work thing'?: string
  'Fun thing'?: string
}

interface EventFields {
  Name?: string
  'Start Date'?: string
  'Event Description'?: string
  URL?: string
  Type?: string
}

interface UpcomingEvent {
  name: string
  start: string
  description: string
  url: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron event-suggestions] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isClaudeConfigured()) {
    console.warn('[Cron event-suggestions] ANTHROPIC_API_KEY not set; skipping')
    return Response.json({ success: true, skipped: 'no ANTHROPIC_API_KEY' })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry') === '1'
  const toParam = url.searchParams.get('to')
  const overrideRecipient =
    toParam && toParam.endsWith('@moxsf.com') ? toParam : null

  try {
    const subscribers = await findRecords<SubscriberFields>(
      Tables.People,
      `AND({Event digest}=TRUE(), {Email}!="", {Status}="Joined")`,
      { fields: ['Name', 'Email', 'Work thing', 'Fun thing'] }
    )
    if (subscribers.length === 0) {
      console.log('[Cron event-suggestions] No subscribers; skipping')
      return Response.json({ success: true, skipped: 'no subscribers' })
    }

    const eventRecords = await findRecords<EventFields>(
      Tables.Events,
      `AND(OR({Status}="Confirmed", {Status}="Recurring"), OR({Type}="Public", {Type}="Members"), IS_AFTER({Start Date}, NOW()), IS_BEFORE({Start Date}, DATEADD(NOW(), 14, 'days')))`,
      { fields: ['Name', 'Start Date', 'Event Description', 'URL', 'Type'] }
    )
    const events: UpcomingEvent[] = eventRecords
      .filter((record) => record.fields.Name && record.fields['Start Date'])
      .map((record) => ({
        name: record.fields.Name!,
        start: record.fields['Start Date']!,
        description: (record.fields['Event Description'] || '').slice(0, 400),
        url: record.fields.URL || null,
      }))
      .sort((a, b) => a.start.localeCompare(b.start))

    if (events.length === 0) {
      console.log('[Cron event-suggestions] No upcoming events; skipping')
      return Response.json({ success: true, skipped: 'no upcoming events' })
    }

    const eventList = events
      .map(
        (event) =>
          `- ${event.name} (${formatEventDate(event.start)})${event.description ? `: ${event.description}` : ''}`
      )
      .join('\n')
    const eventsByName = new Map(events.map((event) => [event.name, event]))

    let sent = 0
    let failed = 0
    const preview: Record<string, unknown>[] = []

    for (const subscriber of subscribers.slice(0, MAX_RECIPIENTS_PER_RUN)) {
      const name = subscriber.fields.Name || 'member'
      const interests = [
        subscriber.fields['Work thing']
          ? `works on: ${subscriber.fields['Work thing']}`
          : null,
        subscriber.fields['Fun thing']
          ? `fun interest: ${subscriber.fields['Fun thing']}`
          : null,
      ]
        .filter(Boolean)
        .join('; ')

      const result = await extractJson<{
        picks: { event: string; why: string }[]
      }>({
        system:
          'You pick which upcoming coworking-space events a member is most likely to enjoy. Pick at most 3, best first. The "why" is one short, friendly sentence tailored to their interests — no flattery, no exclamation marks.',
        prompt: `Member: ${name}${interests ? ` (${interests})` : ' (no listed interests — pick the broadly appealing ones)'}\n\nUpcoming events at Mox:\n${eventList}\n\nPick the top events for them.`,
        schema: PICKS_SCHEMA,
        maxTokens: 2000,
      })

      const picks = (result?.picks ?? [])
        .map((pick) => ({ ...pick, details: eventsByName.get(pick.event) }))
        .filter((pick) => pick.details)
        .slice(0, 3)
      if (picks.length === 0) {
        preview.push({ member: name, picks: [] })
        continue
      }

      if (dryRun) {
        preview.push({ member: name, picks })
        continue
      }

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto;">
          <h2 style="margin-bottom: 4px;">This week at Mox, picked for you</h2>
          ${picks
            .map(
              (pick) => `
            <div style="margin: 16px 0;">
              <div style="font-weight: 600;">
                ${
                  pick.details!.url
                    ? `<a href="${escapeHtml(pick.details!.url!)}">${escapeHtml(pick.event)}</a>`
                    : escapeHtml(pick.event)
                }
                <span style="color: #666; font-weight: 400;"> — ${escapeHtml(formatEventDate(pick.details!.start))}</span>
              </div>
              <div>${escapeHtml(pick.why)}</div>
            </div>`
            )
            .join('')}
          <p style="color: #666; font-size: 13px; margin-top: 24px;">
            You're getting this because you opted in. Turn it off any time by
            unchecking the weekly events email in
            <a href="${env.NEXT_PUBLIC_BASE_URL}/portal/profile/edit">your profile</a>.
          </p>
        </div>`
      const text = [
        'This week at Mox, picked for you:',
        '',
        ...picks.map(
          (pick) =>
            `- ${pick.event} (${formatEventDate(pick.details!.start)})${pick.details!.url ? ` — ${pick.details!.url}` : ''}\n  ${pick.why}`
        ),
        '',
        `Opted in by mistake? Uncheck the weekly events email at ${env.NEXT_PUBLIC_BASE_URL}/portal/profile/edit`,
      ].join('\n')

      const ok = await sendEmail({
        to: overrideRecipient || subscriber.fields.Email!,
        from: 'Mox Events <portal@account.moxsf.com>',
        subject: 'This week at Mox, picked for you',
        text,
        html,
      })
      if (ok) {
        sent++
      } else {
        failed++
        console.error(`[Cron event-suggestions] Failed to email ${name}`)
      }
    }

    console.log(
      `[Cron event-suggestions] Done: ${sent} sent, ${failed} failed, ${subscribers.length} subscribers, ${events.length} events`
    )
    return Response.json({
      success: true,
      dryRun,
      subscribers: subscribers.length,
      events: events.length,
      sent,
      failed,
      ...(dryRun || preview.length > 0 ? { preview } : {}),
    })
  } catch (error) {
    console.error('[Cron event-suggestions] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
