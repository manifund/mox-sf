'use client'

import { FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, Check, X } from 'lucide-react'

export default function StudioCalendarClient({
  calendarEmbedUrl,
  isLocalPreview,
}: {
  calendarEmbedUrl: string
  isLocalPreview: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)
  const [calendarKey, setCalendarKey] = useState(0)

  function openForm() {
    setError('')
    setCreated(false)
    dialogRef.current?.showModal()
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const body = Object.fromEntries(form.entries())
    const start = new Date(String(body.start))
    const end = new Date(String(body.end))

    if (end.getTime() - start.getTime() > 3 * 60 * 60 * 1000) {
      setError('3h limit exceeded')
      setSubmitting(false)
      return
    }

    try {
      if (isLocalPreview) {
        throw new Error('Preview only. Sign in to book the studio.')
      } else {
        const response = await fetch('/portal/api/studio-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not add event')
      }

      setCreated(true)
      setCalendarKey((key) => key + 1)
      formElement.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add event')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={`studio-calendar-page${isLocalPreview ? ' studio-local-preview' : ''}`}>
      <header className="studio-header">
        <Link href="/portal" className="studio-brand" aria-label="Back to member portal">
          <img src="/images/mox_logo_text.svg" alt="Mox" />
        </Link>
        <button className="studio-add-button" type="button" onClick={openForm}>
          <CalendarPlus size={17} aria-hidden="true" />
          Add event
        </button>
      </header>

      <section className="studio-calendar-shell">
        <iframe
          key={calendarKey}
          className="studio-calendar-frame"
          src={calendarEmbedUrl}
          title="Mox Studio calendar"
        />
      </section>

      <dialog className="studio-event-dialog" ref={dialogRef}>
        <div className="studio-dialog-heading">
          <h1>Add event</h1>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {created ? (
          <div className="studio-success">
            <Check size={24} />
            <p>Event added.</p>
            <button type="button" onClick={() => dialogRef.current?.close()}>Done</button>
          </div>
        ) : (
          <form onSubmit={createEvent}>
            <label>
              Event name
              <input name="title" required autoFocus maxLength={150} />
            </label>
            <div className="studio-time-fields">
              <label>
                Starts
                <input name="start" type="datetime-local" required />
              </label>
              <label>
                Ends
                <input name="end" type="datetime-local" required />
              </label>
            </div>
            <label>
              Notes <span>optional</span>
              <textarea name="description" rows={3} maxLength={1000} />
            </label>
            {error && <p className="studio-form-error" role="alert">{error}</p>}
            <button className="studio-submit-button" type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add to studio calendar'}
            </button>
          </form>
        )}
      </dialog>
    </main>
  )
}
