import { findRecords, Tables } from './airtable'
import {
  addDays,
  getCheckInsSince,
  ptDateString,
  summarizeAttendance,
  type AttendanceSummary,
} from './checkins'

/**
 * GEF (Global Expert Fellowship) fellow tracking, used by the
 * gef-weekly-digest cron.
 */

/** Flag fellows not seen in this many days. */
export const GEF_ABSENCE_FLAG_DAYS = 7

/** How many days of attendance history the digest looks at. */
export const GEF_WINDOW_DAYS = 28

export interface GefFellow {
  id: string
  name: string
  email: string | null
  programNames: string[]
}

interface FellowPersonFields {
  Name?: string
  Email?: string
  Program?: string[]
}

interface ProgramFields {
  Name?: string
}

/**
 * People linked to a GEF program. Matches program names containing "GEF" or
 * "Global Expert" so cohort-named programs (e.g. "GEF Fall 2026") work too.
 */
export async function getGefFellows(): Promise<GefFellow[]> {
  const programs = await findRecords<ProgramFields>(Tables.Programs, '', {
    fields: ['Name'],
  })
  const gefProgramNames = new Map<string, string>()
  for (const program of programs) {
    const name = program.fields.Name || ''
    if (/GEF|GLOBAL EXPERT/i.test(name)) {
      gefProgramNames.set(program.id, name)
    }
  }
  if (gefProgramNames.size === 0) return []

  const people = await findRecords<FellowPersonFields>(
    Tables.People,
    `OR(SEARCH("GEF", UPPER(ARRAYJOIN({Program}))), SEARCH("GLOBAL EXPERT", UPPER(ARRAYJOIN({Program}))))`,
    { fields: ['Name', 'Email', 'Program'] }
  )

  return (
    people
      .map((record) => ({
        id: record.id,
        name: record.fields.Name || '(no name)',
        email: record.fields.Email || null,
        programNames: (record.fields.Program || [])
          .filter((id) => gefProgramNames.has(id))
          .map((id) => gefProgramNames.get(id)!),
      }))
      // ARRAYJOIN matches on names of *any* linked program, so re-check that at
      // least one linked program is actually a GEF program.
      .filter((fellow) => fellow.programNames.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  )
}

export interface GefAttendanceReport {
  fellows: GefFellow[]
  /** Per-fellow summary over the last GEF_WINDOW_DAYS days. */
  summaries: Map<string, AttendanceSummary>
  /** Current Pacific day, yyyy-MM-dd. */
  today: string
  windowStart: string
}

/** Fellows + their attendance over the last GEF_WINDOW_DAYS days. */
export async function getGefAttendanceReport(): Promise<GefAttendanceReport> {
  const today = ptDateString(new Date())
  const windowStart = addDays(today, -(GEF_WINDOW_DAYS - 1))

  const fellows = await getGefFellows()
  const checkIns = fellows.length > 0 ? await getCheckInsSince(windowStart) : []
  const summaries = summarizeAttendance(
    fellows.map((f) => f.id),
    checkIns,
    today
  )

  return { fellows, summaries, today, windowStart }
}
