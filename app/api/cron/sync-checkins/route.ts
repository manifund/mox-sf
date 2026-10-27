import { fromZonedTime } from 'date-fns-tz'
import {
  createRecords,
  findRecords,
  updateRecord,
  Tables,
} from '@/app/lib/airtable'
import {
  addDays,
  MOX_TZ,
  ptDateString,
  type AttendanceFields,
} from '@/app/lib/checkins'
import { env } from '@/app/lib/env'

/**
 * Nightly cron: pull yesterday's Verkada door-access events and upsert one
 * Attendance record per person per Pacific day.
 *
 * Query params (for manual runs from the automations dashboard):
 *   ?date=YYYY-MM-DD  sync a specific Pacific day instead of yesterday
 *   ?dry=1            parse + match but don't write to Airtable; returns a
 *                     sample of raw events (useful for debugging payloads)
 */

export const maxDuration = 60

async function getVerkadaToken(): Promise<string | null> {
  try {
    const tokenRes = await fetch('https://api.verkada.com/token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-api-key': env.VERKADA_MEMBER_KEY,
      },
    })
    if (!tokenRes.ok) {
      console.error(
        '[Cron sync-checkins] Failed to get Verkada token:',
        tokenRes.status
      )
      return null
    }
    const { token } = await tokenRes.json()
    return token ?? null
  } catch (error) {
    console.error('[Cron sync-checkins] Verkada token error:', error)
    return null
  }
}

// Verkada access-event payloads vary by event type and API version, so all
// extraction below is defensive: probe several known field locations.

type RawEvent = Record<string, any>

async function fetchAccessEvents(
  token: string,
  startSec: number,
  endSec: number
): Promise<RawEvent[]> {
  const events: RawEvent[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      start_time: String(startSec),
      end_time: String(endSec),
      page_size: '200',
    })
    if (pageToken) params.set('page_token', pageToken)

    const res = await fetch(
      `https://api.verkada.com/events/v1/access?${params}`,
      {
        headers: { accept: 'application/json', 'x-verkada-auth': token },
      }
    )
    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Verkada events API error: ${res.status} ${errorText}`)
    }

    const data = await res.json()
    events.push(...(data.events || []))
    pageToken = data.next_page_token || data.page_token_next || undefined
  } while (pageToken && events.length < 10000)

  return events
}

function extractString(event: RawEvent, paths: string[][]): string | null {
  for (const path of paths) {
    let value: any = event
    for (const key of path) {
      value = value?.[key]
    }
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractEmail(event: RawEvent): string | null {
  const email = extractString(event, [
    ['user_email'],
    ['person_email'],
    ['user_info', 'email'],
    ['event_info', 'user_email'],
    ['event_info', 'email'],
  ])
  return email ? email.toLowerCase() : null
}

function extractType(event: RawEvent): string {
  return (
    extractString(event, [
      ['event_type'],
      ['type'],
      ['event_info', 'event_type'],
    ]) || ''
  ).toLowerCase()
}

function extractTimestamp(event: RawEvent): Date | null {
  const raw = event.timestamp ?? event.time ?? event.created_at
  if (typeof raw === 'number') {
    // Verkada timestamps are unix seconds; tolerate milliseconds too.
    return new Date(raw > 1e12 ? raw : raw * 1000)
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/** Denied/failed attempts don't count as presence. */
function isDeniedEvent(type: string): boolean {
  return /denied|reject|fail/.test(type)
}

interface PersonFields {
  Name?: string
  Email?: string
}

export async function GET(request: Request) {
  const startTime = Date.now()

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron sync-checkins] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry') === '1'
  const dateParam = url.searchParams.get('date')
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : addDays(ptDateString(new Date()), -1)

  console.log(`[Cron sync-checkins] Syncing check-ins for ${date} (PT)...`)

  try {
    const windowStart = fromZonedTime(`${date}T00:00:00`, MOX_TZ)
    const windowEnd = fromZonedTime(`${addDays(date, 1)}T00:00:00`, MOX_TZ)

    const token = await getVerkadaToken()
    if (!token) {
      throw new Error('Failed to get Verkada API token')
    }

    const events = await fetchAccessEvents(
      token,
      Math.floor(windowStart.getTime() / 1000),
      Math.floor(windowEnd.getTime() / 1000)
    )
    console.log(`[Cron sync-checkins] Fetched ${events.length} access events`)

    // Group granted events by user email: first/last time seen that day.
    const presenceByEmail = new Map<
      string,
      { firstSeen: Date; lastSeen: Date; events: number }
    >()
    let skippedNoUser = 0
    let skippedDenied = 0

    for (const event of events) {
      const type = extractType(event)
      if (isDeniedEvent(type)) {
        skippedDenied++
        continue
      }
      const email = extractEmail(event)
      const timestamp = extractTimestamp(event)
      if (!email || !timestamp) {
        skippedNoUser++
        continue
      }
      const existing = presenceByEmail.get(email)
      if (!existing) {
        presenceByEmail.set(email, {
          firstSeen: timestamp,
          lastSeen: timestamp,
          events: 1,
        })
      } else {
        if (timestamp < existing.firstSeen) existing.firstSeen = timestamp
        if (timestamp > existing.lastSeen) existing.lastSeen = timestamp
        existing.events++
      }
    }

    // Match emails to People records.
    const people = await findRecords<PersonFields>(
      Tables.People,
      '{Email} != ""',
      {
        fields: ['Name', 'Email'],
      }
    )
    const peopleByEmail = new Map<string, { id: string; name: string }>()
    for (const person of people) {
      const email = person.fields.Email?.trim().toLowerCase()
      if (email && !peopleByEmail.has(email)) {
        peopleByEmail.set(email, {
          id: person.id,
          name: person.fields.Name || email,
        })
      }
    }

    const matched: {
      person: { id: string; name: string }
      firstSeen: Date
      lastSeen: Date
    }[] = []
    const unmatchedEmails: string[] = []
    for (const [email, presence] of presenceByEmail) {
      const person = peopleByEmail.get(email)
      if (person) {
        matched.push({
          person,
          firstSeen: presence.firstSeen,
          lastSeen: presence.lastSeen,
        })
      } else {
        unmatchedEmails.push(email)
      }
    }
    if (unmatchedEmails.length > 0) {
      console.warn(
        `[Cron sync-checkins] ${unmatchedEmails.length} Verkada users with no People record:`,
        unmatchedEmails.join(', ')
      )
    }

    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        date,
        eventsFetched: events.length,
        sampleEvents: events.slice(0, 5),
        peopleMatched: matched.length,
        unmatchedEmails,
        skippedDenied,
        skippedNoUser,
      })
    }

    // Upsert one Check-ins record per matched person for this date.
    const existingRecords = await findRecords<AttendanceFields>(
      Tables.Attendance,
      `{Date} = "${date}"`,
      { fields: ['Person', 'First seen', 'Last seen'] }
    )
    const existingByPerson = new Map(
      existingRecords
        .filter((r) => r.fields.Person?.[0])
        .map((r) => [r.fields.Person![0], r])
    )

    let created = 0
    let updated = 0
    const toCreate: AttendanceFields[] = []

    for (const { person, firstSeen, lastSeen } of matched) {
      const existing = existingByPerson.get(person.id)
      if (existing) {
        const prevFirst = existing.fields['First seen']
        const prevLast = existing.fields['Last seen']
        const newFirst =
          prevFirst && new Date(prevFirst) < firstSeen
            ? prevFirst
            : firstSeen.toISOString()
        const newLast =
          prevLast && new Date(prevLast) > lastSeen
            ? prevLast
            : lastSeen.toISOString()
        if (newFirst !== prevFirst || newLast !== prevLast) {
          await updateRecord<AttendanceFields>(Tables.Attendance, existing.id, {
            'First seen': newFirst,
            'Last seen': newLast,
          })
          updated++
        }
      } else {
        toCreate.push({
          Name: `${person.name} — ${date}`,
          Person: [person.id],
          Date: date,
          'First seen': firstSeen.toISOString(),
          'Last seen': lastSeen.toISOString(),
          Source: 'Verkada',
        })
      }
    }

    if (toCreate.length > 0) {
      await createRecords<AttendanceFields>(Tables.Attendance, toCreate, {
        typecast: true,
      })
      created = toCreate.length
    }

    const duration = Date.now() - startTime
    console.log(
      `[Cron sync-checkins] Done in ${duration}ms: ${created} created, ${updated} updated, ${unmatchedEmails.length} unmatched`
    )

    return Response.json({
      success: true,
      date,
      eventsFetched: events.length,
      peopleMatched: matched.length,
      created,
      updated,
      unmatchedEmails,
      skippedDenied,
      skippedNoUser,
      durationMs: duration,
    })
  } catch (error) {
    console.error('[Cron sync-checkins] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
