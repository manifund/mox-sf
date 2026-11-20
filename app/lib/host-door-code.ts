// Today's door code for event hosts. A host of an approved event happening
// today (Pacific) sees the Verkada "Day User" code under that event in the
// portal's "events you manage" list. It's the same code, and the same event
// filter, as the Airtable "Today's Event Code" automation, which emails it to
// those hosts at 7:15am. Runs server-side only, so the code is
// never sent to anyone who isn't a host of one of today's events.

import { findRecords, Tables } from './airtable'
import { ptDateString, MOX_TZ } from './checkins'
import { env } from './env'
import { getAccessUserCredentials } from './verkada'

// Matches the Airtable automation: Confirmed and Recurring events.
export const APPROVED_EVENT_STATUSES = ['Confirmed', 'Recurring']

interface EventHostFields {
  Status?: string
  'Hosted by'?: string[]
}

/** Airtable formula: approved events whose start falls on `day` in Pacific time. */
export function todaysApprovedEventsFormula(day: string): string {
  const statuses = APPROVED_EVENT_STATUSES.map((s) => `{Status}='${s}'`).join(
    ', '
  )
  return `AND(OR(${statuses}), DATETIME_FORMAT(SET_TIMEZONE({Start Date}, '${MOX_TZ}'), 'YYYY-MM-DD')='${day}')`
}

/** IDs of approved events today (Pacific) that `userId` is a host of. */
export async function getTodaysHostedEventIds(
  userId: string,
  now: Date = new Date()
): Promise<string[]> {
  const records = await findRecords<EventHostFields>(
    Tables.Events,
    todaysApprovedEventsFormula(ptDateString(now)),
    { fields: ['Status', 'Hosted by'] }
  )
  return records
    .filter((r) => r.fields['Hosted by']?.includes(userId))
    .map((r) => r.id)
}

export interface HostDoorCode {
  code: string
  eventIds: string[]
}

/**
 * The door code to show `userId`, plus which of their events it applies to,
 * or null when they host nothing approved today or the code can't be read.
 */
export async function getHostDoorCode(
  userId: string
): Promise<HostDoorCode | null> {
  if (!env.VERKADA_DAY_USER_ID) return null
  try {
    const eventIds = await getTodaysHostedEventIds(userId)
    if (eventIds.length === 0) return null
    const creds = await getAccessUserCredentials(
      env.VERKADA_DAY_USER_ID,
      {
        timeoutMs: 8000,
      }
    )
    if (!creds?.entryCode) return null
    return { code: creds.entryCode, eventIds }
  } catch (error) {
    console.error('[host-door-code] failed:', error)
    return null
  }
}
