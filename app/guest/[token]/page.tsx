'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type PassStatus =
  | 'loading'
  | 'active'
  | 'upcoming'
  | 'expired'
  | 'revoked'
  | 'not-found'
  | 'error'

interface ValidateResponse {
  status: PassStatus
  guestName?: string
  hostFirstName?: string
  validDate?: string
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="max-w-md mx-auto pt-10 pb-8 px-6">{children}</div>
    </div>
  )
}

export default function GuestPassPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [status, setStatus] = useState<PassStatus>('loading')
  const [guestName, setGuestName] = useState('')
  const [hostFirstName, setHostFirstName] = useState('')
  const [validDate, setValidDate] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null)
  const [unlockError, setUnlockError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('not-found')
      return
    }
    fetch('/guest/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data: ValidateResponse) => {
        setStatus(data.status)
        setGuestName(data.guestName || '')
        setHostFirstName(data.hostFirstName || '')
        setValidDate(data.validDate || '')
      })
      .catch(() => setStatus('error'))
  }, [token])

  useEffect(() => {
    if (unlockedAt === null) return
    const timer = setTimeout(() => setUnlockedAt(null), 10000)
    return () => clearTimeout(timer)
  }, [unlockedAt])

  const handleUnlock = async () => {
    if (!token) return
    setUnlocking(true)
    setUnlockError('')
    try {
      const res = await fetch('/guest/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.success) {
        setUnlockedAt(Date.now())
      } else if (data.reason === 'expired' || data.reason === 'revoked') {
        setStatus(data.reason)
      } else if (data.reason === 'not-yet') {
        setStatus('upcoming')
      } else if (data.reason === 'limit') {
        setUnlockError(
          'This pass has been used as many times as it can be today.'
        )
      } else if (data.reason === 'throttled') {
        setUnlockError('Too many attempts. Wait a moment and try again.')
      } else {
        setUnlockError("Couldn't unlock. Try again, or ask at the lobby.")
      }
    } catch {
      setUnlockError("Couldn't unlock. Try again, or ask at the lobby.")
    } finally {
      setUnlocking(false)
    }
  }

  if (status === 'loading') {
    return (
      <Shell>
        <div className="text-center pt-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-800 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </Shell>
    )
  }

  if (status === 'active') {
    const justUnlocked = unlockedAt !== null
    return (
      <Shell>
        <p className="text-sm text-gray-500 mb-1">
          {hostFirstName} invited you to
        </p>
        <h1 className="text-3xl font-bold font-display text-amber-900 mb-5">
          Mox
        </h1>

        <div className="bg-green-50 border border-green-200 p-4 mb-5">
          <div className="font-semibold text-green-900">
            Pass for {guestName}
          </div>
          <div className="text-sm text-green-800">
            Valid {validDate ? formatDate(validDate) : 'today'} until 11pm
          </div>
        </div>

        <p className="text-gray-700 mb-5">
          1680 Mission St, San Francisco. Tap below when you&apos;re at the
          front door.
        </p>

        <button
          onClick={handleUnlock}
          disabled={unlocking || justUnlocked}
          className={`w-full py-5 text-xl font-semibold transition-all mb-3 ${
            justUnlocked
              ? 'bg-green-600 text-white'
              : unlocking
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-amber-800 text-white hover:bg-amber-900'
          }`}
        >
          {unlocking
            ? 'Unlocking...'
            : justUnlocked
              ? '✓ Door unlocked'
              : 'Unlock front door'}
        </button>

        {justUnlocked && (
          <p className="text-center text-green-800 mb-3">
            Pull the door open. Welcome in.
          </p>
        )}
        {unlockError && (
          <p className="text-sm text-red-600 text-center mb-3">{unlockError}</p>
        )}

        <p className="text-center text-sm text-gray-400 mt-6">
          Sign in at the lobby when you arrive.
        </p>
      </Shell>
    )
  }

  if (status === 'upcoming') {
    return (
      <Shell>
        <div className="text-center pt-10">
          <h1 className="text-2xl font-bold mb-2">Not quite yet</h1>
          <p className="text-gray-700 mb-1">Pass for {guestName}</p>
          <p className="text-gray-600">
            This pass works {validDate ? formatDate(validDate) : 'on its date'},
            8am to 11pm.
          </p>
        </div>
      </Shell>
    )
  }

  if (status === 'expired') {
    return (
      <Shell>
        <div className="text-center pt-10">
          <h1 className="text-2xl font-bold mb-2">This pass expired</h1>
          <p className="text-gray-600 mb-1">
            It was valid on {validDate ? formatDate(validDate) : 'its date'}.
          </p>
          <p className="text-gray-600">
            Check with {hostFirstName || 'the member who invited you'} for a new
            one.
          </p>
        </div>
      </Shell>
    )
  }

  if (status === 'revoked') {
    return (
      <Shell>
        <div className="text-center pt-10">
          <h1 className="text-2xl font-bold mb-2">
            This pass is no longer active
          </h1>
          <p className="text-gray-600">
            Check with {hostFirstName || 'the member who invited you'}.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center pt-10">
        <h1 className="text-2xl font-bold mb-2">
          {status === 'error' ? 'Something went wrong' : 'Link not valid'}
        </h1>
        <p className="text-gray-600 mb-6">
          {status === 'error'
            ? 'Try again in a moment.'
            : 'Check the link you were sent.'}
        </p>
        <a
          href="mailto:team@moxsf.com"
          className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900"
        >
          Contact us
        </a>
      </div>
    </Shell>
  )
}
