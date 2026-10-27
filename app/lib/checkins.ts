import { formatInTimeZone } from 'date-fns-tz'
import { findRecords, Tables } from './airtable'

/**
 * Attendance tracking: one Airtable "Attendance" record per person per
 * Pacific day, written by the sync-checkins cron (Verkada door events) and
 * read by the GEF weekly digest.
 *
 * Not to be confused with the "Check-ins" table, which tracks staff 1:1
 * conversations.
 */

export const MOX_TZ = 'America/Los_Angeles'

export interface AttendanceFields {
  Name?: string
  Person?: string[]
  Date?: string
  'First seen'?: string
  'Last seen'?: string
  Source?: string
}

export interface CheckIn {
  personId: string
  date: string // yyyy-MM-dd, Pacific day
  firstSeen: string | null
  lastSeen: string | null
}

/** Format an instant as a yyyy-MM-dd date string in Pacific time. */
export function ptDateString(d: Date): string {
  return formatInTimeZone(d, MOX_TZ, 'yyyy-MM-dd')
}

/** Add days to a yyyy-MM-dd string (pure calendar math, no timezones). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (positive if b is later). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  )
}

/** The Monday of the week containing `date` (weeks start Monday). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

export interface AttendanceSummary {
  /** Unique days present within the window, ascending. */
  dates: string[]
  /** Most recent day present within the window, or null if never seen. */
  lastSeen: string | null
  /** Days since last seen (0 = seen today), or null if never seen. */
  daysSinceSeen: number | null
  daysThisWeek: number
  daysLast4Weeks: number
}

/**
 * Aggregate raw check-ins into per-person attendance stats.
 *
 * @param personIds - People to summarize (people with no check-ins get a
 *   summary with empty dates, so callers don't need to special-case them)
 * @param checkIns - Check-ins, typically the last ~4 weeks
 * @param today - Current Pacific day as yyyy-MM-dd
 */
export function summarizeAttendance(
  personIds: string[],
  checkIns: CheckIn[],
  today: string
): Map<string, AttendanceSummary> {
  const weekStart = mondayOf(today)
  const fourWeeksAgo = addDays(today, -27)

  const datesByPerson = new Map<string, Set<string>>()
  for (const id of personIds) {
    datesByPerson.set(id, new Set())
  }
  for (const checkIn of checkIns) {
    datesByPerson.get(checkIn.personId)?.add(checkIn.date)
  }

  const summaries = new Map<string, AttendanceSummary>()
  for (const id of personIds) {
    const dates = [...datesByPerson.get(id)!].sort()
    const lastSeen = dates.length > 0 ? dates[dates.length - 1] : null
    summaries.set(id, {
      dates,
      lastSeen,
      daysSinceSeen: lastSeen ? diffDays(lastSeen, today) : null,
      daysThisWeek: dates.filter((d) => d >= weekStart && d <= today).length,
      daysLast4Weeks: dates.filter((d) => d >= fourWeeksAgo && d <= today)
        .length,
    })
  }
  return summaries
}

/** Fetch attendance records on or after `sinceDate` (yyyy-MM-dd). */
export async function getCheckInsSince(sinceDate: string): Promise<CheckIn[]> {
  const records = await findRecords<AttendanceFields>(
    Tables.Attendance,
    `IS_AFTER({Date}, DATEADD("${sinceDate}", -1, 'days'))`,
    { fields: ['Person', 'Date', 'First seen', 'Last seen'] }
  )

  const checkIns: CheckIn[] = []
  for (const record of records) {
    const personId = record.fields.Person?.[0]
    const date = record.fields.Date
    if (!personId || !date) continue
    checkIns.push({
      personId,
      date: date.slice(0, 10),
      firstSeen: record.fields['First seen'] || null,
      lastSeen: record.fields['Last seen'] || null,
    })
  }
  return checkIns
}
