'use client'

import { useState, useEffect } from 'react'
import { DayPass, computeExpiresAt, isExpired } from './dayPasses'

interface MyDayPassesProps {
  passes: DayPass[]
  isActiveMember: boolean
  hideHeading?: boolean
}

interface ActivatedState {
  doorCode: string
  expiresAt: string | null
}

function formatDate(dateString: string | null): string {
  if (!dateString) return ''
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

interface PassCardProps {
  pass: DayPass
}

function PassCard({ pass }: PassCardProps) {
  const [activated, setActivated] = useState<ActivatedState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDoorCode = async (): Promise<{ doorCode: string; expiresAt: string | null } | null> => {
    const res = await fetch('/portal/api/activate-day-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passId: pass.id }),
    })
    const data = await res.json()
    if (res.ok) return { doorCode: data.doorCode, expiresAt: data.expiresAt }
    throw new Error(data.error || 'failed')
  }

  const activate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDoorCode()
      if (result) setActivated(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to activate. try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (pass.status === 'Activated') activate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAlreadyActivated = pass.status === 'Activated' && !activated

  if (activated || isAlreadyActivated) {
    return (
      <div
        style={{
          border: '2px solid var(--border-dark)',
          background: 'var(--bg-secondary)',
          padding: '15px',
          marginBottom: '10px',
        }}
      >
        <div style={{ marginBottom: '10px' }}>
          <strong>{pass.passType}</strong>
          <span className="muted" style={{ marginLeft: '8px', fontSize: '0.9em' }}>
            {pass.dateActivated
              ? `activated ${formatDate(pass.dateActivated)}`
              : pass.datePurchased
                ? `purchased ${formatDate(pass.datePurchased.split('T')[0])}`
                : ''}
          </span>
        </div>
        {activated ? (
          <>
            <p style={{ marginBottom: 0 }}>
              enter this code on the front door keypad, followed by #:
            </p>
            <div className="pin-display">{activated.doorCode}#</div>
            {activated.expiresAt && (
              <p className="muted" style={{ fontSize: '0.85em' }}>
                good until 11pm {formatDate(activated.expiresAt)}.
              </p>
            )}
          </>
        ) : (
          !error && <p className="loading">loading your door code...</p>
        )}
        {error && <p className="error" style={{ marginTop: '8px' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        padding: '15px',
        marginBottom: '10px',
      }}
    >
      <strong>{pass.passType}</strong>
      <span className="muted" style={{ marginLeft: '8px', fontSize: '0.9em' }}>
        {pass.datePurchased ? `purchased ${formatDate(pass.datePurchased.split('T')[0])}` : ''}
      </span>
      {error && <p className="error" style={{ marginTop: '8px' }}>{error}</p>}
      <p style={{ marginTop: '10px' }}>
        <button onClick={activate} disabled={loading} className="primary">
          {loading ? 'activating...' : 'activate'}
        </button>
      </p>
      <p className="muted" style={{ marginTop: '6px', fontSize: '0.9em' }}>
        tap when you arrive — reveals your door code, good until 11pm.
      </p>
    </div>
  )
}

export default function MyDayPasses({ passes, isActiveMember, hideHeading }: MyDayPassesProps) {
  if (passes.length === 0) return null

  const unused = passes.filter((p) => p.status === 'Unused' && !isExpired(p))
  const active = passes.filter(
    (p) => p.status === 'Activated' && !isExpired(p)
  )
  const past = passes.filter(
    (p) => p.status === 'Expired' || (p.status === 'Activated' && isExpired(p))
  )

  return (
    <section>
      {!hideHeading && <h2>my day passes</h2>}

      {active.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {active.map((pass) => (
            <PassCard key={pass.id} pass={pass} />
          ))}
        </div>
      )}

      {unused.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {unused.map((pass) => (
            <PassCard key={pass.id} pass={pass} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary className="muted" style={{ fontSize: '0.9em', cursor: 'pointer' }}>
            {past.length} past {past.length === 1 ? 'pass' : 'passes'}
          </summary>
          <ul style={{ marginTop: '8px' }}>
            {past.map((pass) => (
              <li key={pass.id} className="muted" style={{ fontSize: '0.9em' }}>
                {pass.passType}
                {pass.dateActivated
                  ? ` · used ${formatDate(pass.dateActivated)}`
                  : ' · expired unused'}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!isActiveMember && (
        <p className="muted" style={{ marginTop: '16px', fontSize: '0.9em' }}>
          need another?{' '}
          <a href="https://buy.stripe.com/00weVf3UY3g5f7V7qubbG02">day ($70)</a>
          {' · '}
          <a href="https://buy.stripe.com/dRm9AV636cQF8Jx26abbG03">happy hour ($40)</a>
          {' · '}
          <a href="https://buy.stripe.com/5kQ7sNezC5od8JxcKObbG01">week ($250)</a>
        </p>
      )}
    </section>
  )
}
