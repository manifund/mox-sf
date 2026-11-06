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
  code?: string | null
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
  const [code, setCode] = useState<string | null>(null)

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
        setCode(data.code || null)
      })
      .catch(() => setStatus('error'))
  }, [token])

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

        {code ? (
          <>
            <div className="bg-amber-50 border-2 border-amber-200 p-6 mb-5 text-center">
              <div className="text-sm text-amber-700 mb-1">Your door code</div>
              <div className="text-5xl font-bold text-amber-900 tracking-wider font-mono">
                {code}#
              </div>
            </div>
            <p className="text-gray-700 mb-5">
              1680 Mission St, San Francisco. Enter the code on the keypad at
              the front door, followed by <strong>#</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-5">
              This code is yours for today only and stops working at 11pm.
            </p>
          </>
        ) : (
          <p className="text-red-600 mb-5">
            Your door code isn&apos;t ready. Ask {hostFirstName || 'the member who invited you'}{' '}
            to let you in, or email{' '}
            <a href="mailto:team@moxsf.com" className="underline">
              team@moxsf.com
            </a>
            .
          </p>
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
