import { NextRequest, NextResponse } from 'next/server'
import { fromZonedTime } from 'date-fns-tz'
import { findRecords, getRecord, Tables } from '@/app/lib/airtable'
import { MOX_TZ, ptDateString } from '@/app/lib/checkins'

interface EventFields {
  Name?: string
  'Start Date'?: string
  'End Date'?: string
  'Event Description'?: string
  'Name (from Assigned Rooms)'?: string[]
  Notes?: string
  Type?: string
  Status?: string
  URL?: string
  'Host Name'?: string
  'Hosted by'?: string[]
}

function transformEvent(record: { id: string; fields: EventFields }) {
  const hostName = record.fields['Host Name']
  const assignedRooms = record.fields['Name (from Assigned Rooms)']

  return {
    id: record.id,
    name: record.fields.Name || '',
    startDate: record.fields['Start Date'] || '',
    endDate: record.fields['End Date'] || undefined,
    description: record.fields['Event Description'] || undefined,
    assignedRooms: Array.isArray(assignedRooms)
      ? assignedRooms.join(', ')
      : assignedRooms || undefined,
    notes: record.fields.Notes || undefined,
    type: record.fields.Type || undefined,
    status: record.fields.Status || undefined,
    url: record.fields.URL || undefined,
    host: hostName || '',
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userName = searchParams.get('userName')
  const eventId = searchParams.get('eventId')

  // Fetch a single event by ID
  if (eventId) {
    try {
      const record = await getRecord<EventFields>(Tables.Events, eventId)
      if (!record) {
        return NextResponse.json(
          { message: 'Event not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ event: transformEvent(record) })
    } catch (error) {
      console.error('Error fetching event:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }
  }

  if (!userName) {
    return NextResponse.json(
      { message: 'User name is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch events from Airtable where the user is listed in "Hosted by" field
    // Show today's and future events (including cancelled ones). "Today"
    // starts at Pacific midnight, so earlier events today stay listed (and
    // keep their door code) through the evening.
    const todayStart = fromZonedTime(
      `${ptDateString(new Date())}T00:00:00`,
      MOX_TZ
    ).toISOString()
    const formula = `AND(SEARCH("${userName.replace(/"/g, '\\"')}", ARRAYJOIN({Hosted by}, ", ")), IS_AFTER({Start Date}, "${todayStart}"))`

    const records = await findRecords<EventFields>(Tables.Events, formula, {
      sort: [{ field: 'Start Date', direction: 'asc' }],
    })

    // Transform the events to match our EventData interface
    const events = records.map(transformEvent)

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Error fetching hosted events:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
