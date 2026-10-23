'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { GuestPassSummary } from '@/app/lib/guest-passes'

interface PassRow extends GuestPassSummary {
  link: string
}

interface GuestPassData {
  allowance: number | null
  remaining: number | null
  weekStart: string
  weekEnd: string
  today: string
  maxDaysAhead: number
  passes: PassRow[]
}

function formatDay(iso: string, today: string): string {
  if (iso === today) return 'today'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function PassCard({
  pass,
  today,
  onRevoke,
}: {
  pass: PassRow
  today: string
  onRevoke: (id: string) => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const used = pass.unlockCount > 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pass.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('copy this link', pass.link)
    }
  }

  const label = used
    ? 'used'
    : pass.state === 'revoked'
      ? 'revoked'
      : pass.state === 'expired'
        ? 'expired'
        : 'not used yet'
  const badgeClass =
    label === 'used' ? 'success' : label === 'not used yet' ? 'info' : ''
  const canShare = pass.state === 'active' || pass.state === 'upcoming'

  return (
    <div className="guest-pass">
      <div className="guest-pass-head">
        <strong>{pass.guestName}</strong>
        <span className={`badge ${badgeClass}`}>{label}</span>
      </div>
      <p className="muted guest-pass-meta">
        {formatDay(pass.validDate, today)}
        {pass.guestEmail && ` · ${pass.guestEmail}`}
        {used &&
          pass.firstUsedAt &&
          ` · arrived ${formatTime(pass.firstUsedAt)}`}
      </p>
      {canShare && (
        <div className="guest-pass-actions">
          <code className="guest-pass-link">{pass.link}</code>
          <button type="button" className="small" onClick={copy}>
            {copied ? 'copied' : 'copy link'}
          </button>
          <button
            type="button"
            className="small danger"
            disabled={revoking}
            onClick={async () => {
              if (!window.confirm(`revoke ${pass.guestName}'s pass?`)) return
              setRevoking(true)
              try {
                await onRevoke(pass.id)
              } finally {
                setRevoking(false)
              }
            }}
          >
            {revoking ? '...' : 'revoke'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function GuestPasses({ canBuyPass }: { canBuyPass: boolean }) {
  const [data, setData] = useState<GuestPassData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [validDate, setValidDate] = useState<string>('')
  const [pickingDate, setPickingDate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/portal/api/guest-passes')
      if (!res.ok) throw new Error('failed')
      setData(await res.json())
      setLoadError(null)
    } catch {
      setLoadError('could not load guest passes. refresh to try again.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createPass = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const name = guestName.trim()
    const email = guestEmail.trim()
    if (!name) {
      setFormError("enter your guest's name")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('enter a valid email for your guest')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/portal/api/guest-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name,
          guestEmail: email,
          validDate: pickingDate && validDate ? validDate : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(body.error || 'could not create pass')
        if (body.code === 'quota') await load()
        return
      }
      setGuestName('')
      setGuestEmail('')
      setPickingDate(false)
      setValidDate('')
      setJustCreated(body.pass?.id || null)
      await load()
    } catch {
      setFormError('network error. please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const revoke = async (id: string) => {
    const res = await fetch('/portal/api/guest-passes/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passId: id }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      window.alert(body.error || 'could not revoke pass')
    }
    await load()
  }

  if (loadError) return <p className="error">{loadError}</p>
  if (!data) return <p className="loading">loading guest passes...</p>

  const unlimited = data.allowance === null
  const outOfPasses = !unlimited && (data.remaining ?? 0) <= 0
  const listed = data.passes.filter(
    (p) => p.state !== 'revoked' || p.id === justCreated
  )

  return (
    <>
      <p>
        bring a friend for the day.{' '}
        {unlimited ? (
          <strong>unlimited passes</strong>
        ) : (
          <>
            <strong>
              {data.remaining} of {data.allowance} left this week
            </strong>{' '}
            · resets monday
          </>
        )}
      </p>

      {outOfPasses ? (
        <>
          <div className="alert warning">
            <p>
              you&apos;ve used this week&apos;s {data.allowance} passes. more on
              monday.
            </p>
          </div>
          {canBuyPass && (
            <p>
              need one sooner?{' '}
              <Link href="/portal/buy-day-pass">
                buy a day pass for your guest ($25)
              </Link>
            </p>
          )}
        </>
      ) : (
        <form onSubmit={createPass} noValidate>
          <div className="form-group">
            <label htmlFor="guest-pass-name">guest&apos;s name</label>
            <input
              id="guest-pass-name"
              type="text"
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value)
                if (formError) setFormError(null)
              }}
              placeholder="first last"
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label htmlFor="guest-pass-email">guest&apos;s email</label>
            <div className="guest-pass-form-row">
              <input
                id="guest-pass-email"
                type="email"
                value={guestEmail}
                onChange={(e) => {
                  setGuestEmail(e.target.value)
                  if (formError) setFormError(null)
                }}
                placeholder="guest@example.com"
                maxLength={254}
              />
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? 'creating...' : 'create pass'}
              </button>
            </div>
            {formError && <p className="error">{formError}</p>}
            <p
              className="muted"
              style={{ marginTop: '5px', fontSize: '0.9em' }}
            >
              {pickingDate ? (
                <>
                  valid{' '}
                  <input
                    type="date"
                    value={validDate || data.today}
                    min={data.today}
                    max={addDays(data.today, data.maxDaysAhead)}
                    onChange={(e) => setValidDate(e.target.value)}
                  />{' '}
                  8am–11pm.{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setPickingDate(false)
                      setValidDate('')
                    }}
                  >
                    use today
                  </button>
                </>
              ) : (
                <>
                  valid today, 8am–11pm.{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => setPickingDate(true)}
                  >
                    different day?
                  </button>{' '}
                  click button to generate link.
                </>
              )}
            </p>
          </div>
        </form>
      )}

      {listed.length > 0 && (
        <div className="guest-pass-list">
          <p className="muted">this week</p>
          {listed.map((pass) => (
            <PassCard
              key={pass.id}
              pass={pass}
              today={data.today}
              onRevoke={revoke}
            />
          ))}
        </div>
      )}
    </>
  )
}
