'use client'

import { Fragment, useEffect, useState } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'

interface HostedEventsProps {
  userName: string
  // Today's door code and the events it's for, computed server-side for hosts
  // of approved events happening today. Null for everyone else.
  doorCode?: { code: string; eventIds: string[] } | null
}

interface EventData {
  id: string
  name: string
  startDate: string
  endDate?: string
  description?: string
  assignedRooms?: string
  notes?: string
  type?: string
  status?: string
  url?: string
  host?: string
}

export default function HostedEvents({
  userName,
  doorCode,
}: HostedEventsProps) {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHostedEvents() {
      if (!userName) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(
          `/portal/api/hosted-events?userName=${encodeURIComponent(userName)}`
        )
        const data = await response.json()

        if (response.ok && data.events) {
          setEvents(data.events)
        } else {
          setError(data.message || 'failed to load events')
        }
      } catch (err) {
        setError('failed to load hosted events')
      } finally {
        setLoading(false)
      }
    }

    fetchHostedEvents()
  }, [userName])

  if (loading) {
    return (
      <>
        <h2>events you manage</h2>
        <p className="loading">loading events...</p>
      </>
    )
  }

  if (error) {
    return (
      <>
        <h2>events you manage</h2>
        <p className="error">{error}</p>
      </>
    )
  }

  return (
    <>
      <h2>events you manage</h2>

      {events.length === 0 ? (
        <p>you don't have any upcoming events.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>event</th>
              <th>date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const startDate = new Date(event.startDate)
              const formattedDate = format(startDate, 'MMM d')
              const formattedTime = format(startDate, 'h:mm a')

              const showDoorCode = doorCode?.eventIds.includes(event.id)

              return (
                <Fragment key={event.id}>
                  <tr>
                    <td>
                      {event.name}
                      {event.assignedRooms && (
                        <span className="muted"> ({event.assignedRooms})</span>
                      )}
                      {event.status && event.status !== 'Confirmed' && (
                        <span className="muted">
                          {' '}
                          · {event.status.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formattedDate}, {formattedTime}
                    </td>
                    <td>
                      <Link
                        href={`/portal/events/${event.id}/edit`}
                        className="btn small"
                      >
                        edit
                      </Link>
                    </td>
                  </tr>
                  {showDoorCode && doorCode && (
                    <tr>
                      <td
                        colSpan={3}
                        style={{ borderTop: 'none', paddingTop: 0 }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong>today&apos;s door code</strong> for your
                          guests, entered on the front door keypad:
                        </p>
                        <div className="pin-display">{doorCode.code}#</div>
                        <p
                          className="muted"
                          style={{ margin: 0, fontSize: '0.85em' }}
                        >
                          the code rotates weekly. please share it only with
                          your attendees.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '15px' }}>
        <Link href="/portal/submit-event">submit a new event</Link>
      </p>
    </>
  )
}
