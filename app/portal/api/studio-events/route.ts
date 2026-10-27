import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/session'
import { isActiveMember } from '@/app/lib/membership'
import { getUserProfile } from '../../profile'
import {
  getStudioAccessToken,
  STUDIO_CALENDAR_ID,
} from '@/app/lib/studio-calendar'
import { env } from '@/app/lib/env'

export const runtime = 'nodejs'

const CALENDAR_ID = STUDIO_CALENDAR_ID
const TIME_ZONE = 'America/Los_Angeles'

export async function POST(request: NextRequest) {
  if (
    request.headers.get('origin') !== new URL(env.NEXT_PUBLIC_BASE_URL).origin
  ) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const effectiveUserId = session.viewingAsUserId || session.userId
  const profile = await getUserProfile(effectiveUserId)
  if (
    !profile ||
    !isActiveMember({ status: profile.status, tier: profile.tier })
  ) {
    return NextResponse.json(
      { error: 'Active membership required' },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string
      start?: string
      end?: string
      description?: string
    }
    if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const start = typeof body.start === 'string' ? body.start.trim() : ''
    const end = typeof body.end === 'string' ? body.end.trim() : ''

    if (!title || title.length > 150 || !start || !end) {
      return NextResponse.json(
        { error: 'Name, start, and end are required' },
        { status: 400 }
      )
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
    const startDate = fromZonedTime(start, TIME_ZONE)
    const endDate = fromZonedTime(end, TIME_ZONE)
    if (
      !datePattern.test(start) ||
      !datePattern.test(end) ||
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      formatInTimeZone(startDate, TIME_ZONE, "yyyy-MM-dd'T'HH:mm") !== start ||
      formatInTimeZone(endDate, TIME_ZONE, "yyyy-MM-dd'T'HH:mm") !== end
    ) {
      return NextResponse.json(
        { error: 'Invalid booking time' },
        { status: 400 }
      )
    }
    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'End time must be after start time' },
        { status: 400 }
      )
    }
    const duration = endDate.getTime() - startDate.getTime()
    if (!Number.isFinite(duration) || duration > 3 * 60 * 60 * 1000) {
      return NextResponse.json({ error: '3h limit exceeded' }, { status: 400 })
    }

    const accessToken = await getStudioAccessToken()
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: title,
          description:
            typeof body.description === 'string'
              ? body.description.trim().slice(0, 1000)
              : undefined,
          start: { dateTime: startDate.toISOString(), timeZone: TIME_ZONE },
          end: { dateTime: endDate.toISOString(), timeZone: TIME_ZONE },
          extendedProperties: {
            private: {
              createdByMoxMember: profile.email,
              createdVia: 'mox-member-portal',
            },
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('[studio-calendar] Google insert failed:', response.status)
      return NextResponse.json(
        { error: 'Could not add event' },
        { status: 502 }
      )
    }

    const event = (await response.json()) as { id: string }
    return NextResponse.json({ event: { id: event.id } })
  } catch (error) {
    console.error('[studio-calendar] Create event failed:', error)
    return NextResponse.json({ error: 'Could not add event' }, { status: 500 })
  }
}
