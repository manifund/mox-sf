'use client'

import { useState, useEffect } from 'react'

interface VerkadaPinProps {
  isViewingAs?: boolean
  tier?: string | null
  isActiveMember?: boolean
}

const doorBoxStyle = {
  border: '2px solid var(--border-dark)',
  background: 'var(--bg-secondary)',
  padding: '15px',
  marginBottom: '20px',
} as const

export default function VerkadaPin({
  isViewingAs = false,
  tier,
  isActiveMember = false,
}: VerkadaPinProps) {
  const [pin, setPin] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<boolean>(false)
  const [pinActionError, setPinActionError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [guestPin, setGuestPin] = useState<string | null>(null)
  const [showAppInfo, setShowAppInfo] = useState<boolean>(false)
  const [unlocking, setUnlocking] = useState<boolean>(false)
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const isGuestProgram = tier === 'Program' || tier === 'Guest Program'

  function accessDescription(tier?: string | null): string | null {
    if (!tier) return null
    if (tier === 'Friend') return 'you have drop-in access up to 2x/week.'
    if (['Core', 'Resident', 'Private Office', 'Staff', 'Volunteer'].includes(tier))
      return 'you have 24/7 access.'
    return null
  }

  const accessDesc = accessDescription(tier)

  useEffect(() => {
    if (!isActiveMember) {
      setLoading(false)
      return
    }
    async function fetchPin() {
      try {
        const response = await fetch('/portal/api/verkada-pin')
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'failed to fetch PIN')
          setLoading(false)
          return
        }

        setPin(data.pin)
        setHasAccess(data.hasAccess)
        setLoading(false)
      } catch (err) {
        setError('failed to load door access information')
        setLoading(false)
      }
    }

    fetchPin()
  }, [isActiveMember])

  // Fetch guest PIN for guest program members
  useEffect(() => {
    if (!isGuestProgram || !isActiveMember) return

    async function fetchGuestPin() {
      try {
        const response = await fetch('/portal/api/verkada-guest-pin')
        const data = await response.json()

        if (response.ok && data.pin) {
          setGuestPin(data.pin)
        }
      } catch (err) {
        console.error('Failed to fetch guest PIN:', err)
      }
    }

    fetchGuestPin()
  }, [isGuestProgram, isActiveMember])

  useEffect(() => {
    if (unlockedAt === null) return
    const timer = setTimeout(() => setUnlockedAt(null), 6000)
    return () => clearTimeout(timer)
  }, [unlockedAt])

  const handleUnlock = async () => {
    setUnlocking(true)
    setUnlockError(null)
    try {
      const res = await fetch('/portal/api/unlock-door', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setUnlockedAt(Date.now())
      } else {
        setUnlockError(data.error || "couldn't unlock")
      }
    } catch {
      setUnlockError("couldn't unlock")
    } finally {
      setUnlocking(false)
    }
  }

  // Creates a fresh personal code in Verkada. Used both to generate a first
  // code (when the automatic one on load didn't stick) and to regenerate.
  const requestNewPin = async (failureMessage: string) => {
    setShowConfirm(false)
    setRegenerating(true)
    setPinActionError(null)

    try {
      const response = await fetch('/portal/api/verkada-pin', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setPinActionError(data.error || failureMessage)
        return
      }

      setPin(data.pin)
      setHasAccess(true)
    } catch (err) {
      setPinActionError(failureMessage)
    } finally {
      setRegenerating(false)
    }
  }

  const handleGenerate = () => requestNewPin('failed to generate a door code')
  const handleRegenerate = () => requestNewPin('failed to regenerate PIN')

  if (loading) {
    return <p className="loading">loading...</p>
  }

  if (!isActiveMember) {
    return (
      <p>
        your membership isn&apos;t active right now, so door codes aren&apos;t
        available. email{' '}
        <a href="mailto:team@moxsf.com">team@moxsf.com</a> to sort it out.
      </p>
    )
  }

  if (error) {
    return <p className="error">{error}</p>
  }

  const justUnlocked = unlockedAt !== null
  const unlockBlock = (
    <div style={{ marginTop: '12px' }}>
      <button
        onClick={handleUnlock}
        disabled={unlocking || justUnlocked}
      >
        {unlocking ? 'unlocking…' : justUnlocked ? '✓ unlocked' : 'or unlock the door from here'}
      </button>
      {unlockError && (
        <p className="error" style={{ marginTop: '8px' }}>{unlockError}</p>
      )}
    </div>
  )

  if (!hasAccess || !pin) {
    // Guest program members share a single guest code instead of a personal one
    if (isGuestProgram && guestPin) {
      return (
        <div style={doorBoxStyle}>
          {accessDesc && (
            <p className="muted" style={{ marginBottom: '10px', fontSize: '0.85em' }}>{accessDesc}</p>
          )}
          <p>as a guest program member, enter this shared code on the front door keypad:</p>
          <div className="pin-display">{guestPin}#</div>
          {unlockBlock}
        </div>
      )
    }

    // No personal code yet: offer to create one rather than showing nothing
    return (
      <div style={doorBoxStyle}>
        {accessDesc && (
          <p className="muted" style={{ marginBottom: '10px', fontSize: '0.85em' }}>{accessDesc}</p>
        )}
        <p>
          you don&apos;t have a personal door code yet. generate one and
          you&apos;ll use it on the front door keypad from now on.
        </p>
        <button
          onClick={handleGenerate}
          disabled={regenerating || isViewingAs}
          className="primary"
        >
          {regenerating ? 'generating…' : 'generate my door code'}
        </button>
        {pinActionError && (
          <p className="error" style={{ marginTop: '8px' }}>{pinActionError}</p>
        )}
        {isViewingAs && (
          <p className="muted" style={{ marginTop: '8px', fontSize: '0.85em' }}>
            codes can&apos;t be generated while viewing as another user. use the
            verkada admin portal instead.
          </p>
        )}
        <p className="muted" style={{ marginTop: '10px', fontSize: '0.85em' }}>
          if that doesn&apos;t work, your account may not be set up in the door
          system yet — email{' '}
          <a href="mailto:team@moxsf.com">team@moxsf.com</a> and we&apos;ll sort it out.
        </p>
        {unlockBlock}
      </div>
    )
  }

  return (
    <>
      <div style={doorBoxStyle}>
        {accessDesc && (
          <p className="muted" style={{ marginBottom: '10px', fontSize: '0.85em' }}>{accessDesc}</p>
        )}
        <p style={{ marginBottom: 0 }}>
          <strong>your personal door code.</strong> enter it on the front door
          keypad, followed by #:
        </p>
        <div className="pin-display">{pin}#</div>
        <p className="muted" style={{ fontSize: '0.85em' }}>
          this code is yours alone — it replaces the shared weekly code, which is
          going away. don&apos;t share it; if you think someone else has it,
          regenerate it below.
        </p>
        {unlockBlock}
      </div>

      <p className="muted" style={{ fontSize: '0.9em' }}>
        <span
          onClick={() => setShowAppInfo(!showAppInfo)}
          style={{
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            cursor: 'pointer',
          }}
        >
          use the app instead
        </span>
        {' · '}
        {!showConfirm ? (
          <span
            onClick={() => !regenerating && !isViewingAs && setShowConfirm(true)}
            style={{
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              cursor: regenerating || isViewingAs ? 'not-allowed' : 'pointer',
              opacity: regenerating || isViewingAs ? 0.5 : 1,
            }}
          >
            {regenerating ? 'regenerating…' : 'regenerate my code'}
          </span>
        ) : (
          <>
            confirm regenerate?{' '}
            <button onClick={handleRegenerate} className="danger">
              yes
            </button>{' '}
            <button onClick={() => setShowConfirm(false)}>cancel</button>
          </>
        )}
      </p>
      {pinActionError && (
        <p className="error" style={{ marginTop: '4px' }}>{pinActionError}</p>
      )}

      {showAppInfo && (
        <div style={{ marginBottom: '10px', padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <p style={{ marginBottom: '10px' }}>
            install the Verkada Pass app to unlock via Bluetooth. sign in with the same email you use for this portal.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href="https://apps.apple.com/app/verkada-pass/id1477261074"
              target="_blank"
              rel="noopener noreferrer"
              className="btn small"
            >
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.verkada.VerkadaPass"
              target="_blank"
              rel="noopener noreferrer"
              className="btn small"
            >
              Google Play
            </a>
          </div>
        </div>
      )}

      {isViewingAs && (
        <p className="muted" style={{ marginTop: '10px' }}>
          to change this user&apos;s PIN, use the verkada admin portal
        </p>
      )}
    </>
  )
}
