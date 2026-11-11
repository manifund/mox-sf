import { formatInTimeZone } from 'date-fns-tz'
import {
  getRecords,
  Tables,
  type AirtableRecord,
} from './airtable'

// Airtable → public-event mapping for the season landing pages (currently
// /fallseason; /summerseason still has its own module). A season is a tag on the Events
// table plus an optional per-season status field; see getSeasonEvents().

const PACIFIC_TZ = 'America/Los_Angeles'

type Attachment = {
  url?: string
  thumbnails?: {
    small?: { url: string }
    large?: { url: string }
    full?: { url: string }
  }
}

type SeasonFields = {
  Name?: string
  Tags?: string[]
  Channel?: string | string[]
  'Start Date'?: string
  'End Date'?: string
  Type?: string
  Status?: string
  'Public Blurb'?: string
  'Public Location'?: string
  'RSVP Link'?: string
  'Speaker Name'?: string
  'Speaker Role'?: string
  'Speaker Photo'?: Attachment[]
  'Event Description'?: string
  Location?: string
  URL?: string
  'Host Name'?: string
  'Name (from Assigned Rooms)'?: string[]
} & Record<string, unknown>

export type SeasonCategory =
  | 'ai'
  | 'animal'
  | 'research'
  | 'social'
  | 'tbd'

export type SeasonEvent = {
  id: string
  category: SeasonCategory
  title: string
  date: string
  dayLabel: string
  time: string
  location: string
  listLocation: string
  speaker: string
  role: string
  description: string
  rsvp: string | null
  tbd?: boolean
  speakerPhoto?: string
}

export type SeasonQueryResult = {
  events: SeasonEvent[]
  rawRecordCount: number
  skippedRecordCount: number
  saveTheDateCount: number
  generatedAt: string
}

export type SeasonQueryOptions = {
  /** Value in the Events table's `Tags` field that marks this season. */
  tag: string
  /**
   * Field whose value must be "Confirmed" for the event to show publicly.
   * Summer '26 uses its own `MSS 26 Status`; defaults to the general `Status`.
   */
  statusField?: string
  /** Which `Type` values to show. Defaults to Public only. */
  types?: Array<'Public' | 'Members' | 'Private'>
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstString(item)
      if (text) return text
    }
  }
  return undefined
}

function normalizeChannel(value: unknown): Exclude<SeasonCategory, 'tbd'> | undefined {
  const channel = firstString(value)?.toLowerCase()
  if (!channel) return undefined
  if (channel.includes('ai') || channel.includes('safety')) return 'ai'
  if (channel.includes('animal')) return 'animal'
  if (channel.includes('frontier') || channel.includes('research')) return 'research'
  if (
    channel.includes('social') ||
    channel.includes('misc') ||
    channel.includes('workshop') ||
    channel.includes('vibe')
  ) {
    return 'social'
  }
  return undefined
}

function airtableStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function airtableFieldRef(name: string): string {
  return `{${name.replace(/}/g, '')}}`
}

function formatTime(startDate: Date, endDate?: Date): string {
  const start = formatInTimeZone(startDate, PACIFIC_TZ, 'h:mm a')
  if (!endDate) return `${start} PT`
  const end = formatInTimeZone(endDate, PACIFIC_TZ, 'h:mm a')
  return `${start} - ${end} PT`
}

function mapRecord(record: AirtableRecord<SeasonFields>): SeasonEvent | null {
  const fields = record.fields
  if (!fields['Start Date']) return null

  const startDate = new Date(fields['Start Date'])
  const endDate = fields['End Date'] ? new Date(fields['End Date']) : undefined
  if (Number.isNaN(startDate.getTime())) return null

  const channelCategory = normalizeChannel(fields.Channel)
  const publicBlurb =
    firstString(fields['Public Blurb']) || firstString(fields['Event Description'])
  const rsvp = firstString(fields['RSVP Link']) || firstString(fields.URL)
  const category = channelCategory || 'social'

  const publicLocation =
    firstString(fields['Public Location']) ||
    firstString(fields.Location) ||
    firstString(fields['Name (from Assigned Rooms)']) ||
    'Mox, San Francisco, CA'

  const speakerPhoto =
    fields['Speaker Photo']?.[0]?.thumbnails?.large?.url ||
    fields['Speaker Photo']?.[0]?.thumbnails?.full?.url ||
    fields['Speaker Photo']?.[0]?.url

  return {
    id: record.id,
    category,
    title: firstString(fields.Name) || 'Untitled event',
    date: formatInTimeZone(startDate, PACIFIC_TZ, 'yyyy-MM-dd'),
    dayLabel: formatInTimeZone(startDate, PACIFIC_TZ, 'EEEE'),
    time: formatTime(startDate, endDate),
    location: publicLocation,
    listLocation: publicLocation,
    speaker: firstString(fields['Speaker Name']) || 'To be announced',
    role: firstString(fields['Speaker Role']) || 'Speaker',
    description: publicBlurb || 'Details coming soon.',
    rsvp: rsvp || null,
    ...(speakerPhoto ? { speakerPhoto } : {}),
  }
}

export async function getSeasonEvents({
  tag,
  statusField = 'Status',
  types = ['Public'],
}: SeasonQueryOptions): Promise<SeasonQueryResult> {
  const typeFilter = `OR(${types.map((type) => `{Type} = ${airtableStringLiteral(type)}`).join(', ')})`
  const filterByFormula = `AND(FIND(${airtableStringLiteral(tag)}, ARRAYJOIN({Tags}, ",")), ${typeFilter}, ${airtableFieldRef(statusField)} = "Confirmed")`
  const records = await getRecords<SeasonFields>(Tables.Events, {
    filterByFormula,
    sort: [{ field: 'Start Date', direction: 'asc' }],
    maxRecords: 100,
  })

  const events = records
    .map(mapRecord)
    .filter((event): event is SeasonEvent => event !== null)

  return {
    events,
    rawRecordCount: records.length,
    skippedRecordCount: records.length - events.length,
    saveTheDateCount: events.filter((event) => event.tbd).length,
    generatedAt: new Date().toISOString(),
  }
}
