'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type ActivationState = 'loading' | 'success' | 'expired' | 'not-found' | 'error'

function ActivatePageContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [state, setState] = useState<ActivationState>('loading')
  const [doorCode, setDoorCode] = useState<string>('')
  const [passType, setPassType] = useState<string>('Day Pass')
  const [userName, setUserName] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>('')

  useEffect(() => {
    if (!id) {
      setState('not-found')
      return
    }

    fetch('/day-pass/activate/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setState('success')
          setDoorCode(data.doorCode)
          setPassType(data.passType || 'Day Pass')
          setUserName(data.userName)
          setExpiresAt(data.expiresAt || '')
        } else if (data.status === 'expired') {
          setState('expired')
        } else if (data.status === 'not-found') {
          setState('not-found')
        } else {
          setState('error')
        }
      })
      .catch(() => setState('error'))
  }, [id])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-800 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 text-gray-800">
        <div className="max-w-md mx-auto pt-8 pb-8 px-6">
          {/* Door code - the main event */}
          <div className="bg-amber-50 border-2 border-amber-200 p-6 mb-6 text-center">
            <div className="text-sm text-amber-700 mb-1">Door Code</div>
            <div className="text-5xl font-bold text-amber-900 tracking-wider font-mono">
              {doorCode}#
            </div>
          </div>

          {/* Confirmation */}
          <div className="text-center mb-6">
            <div className="text-lg font-semibold text-gray-800">
              Welcome, {userName}!
            </div>
            <div className="text-sm text-gray-500">{passType} activated</div>
            {expiresAt && (
              <div className="text-sm text-gray-500 mt-1">
                Expires 11pm{' '}
                {new Date(expiresAt + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="bg-white border border-slate-200 p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl">📍</span>
              <div>
                <div className="font-semibold text-gray-800">1680 Mission St</div>
                <div className="text-sm text-gray-500">
                  Enter code on keypad at front door
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-gray-400">
            Questions?{' '}
            <a
              href="mailto:team@moxsf.com"
              className="text-amber-800 hover:text-amber-600"
            >
              team@moxsf.com
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-slate-50 text-gray-800">
        <div className="max-w-md mx-auto pt-16 pb-8 px-6 text-center">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">Pass Expired</h1>
          <p className="text-gray-600 mb-6">
            This pass has expired. Get a new one to visit.
          </p>
          <a
            href="/day-pass"
            className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-all"
          >
            Get a Day Pass
          </a>
        </div>
      </div>
    )
  }

  if (state === 'not-found') {
    return (
      <div className="min-h-screen bg-slate-50 text-gray-800">
        <div className="max-w-md mx-auto pt-16 pb-8 px-6 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">
            Pass Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            Check your email for the correct link, or get a new pass.
          </p>
          <a
            href="/day-pass"
            className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-all"
          >
            Get a Day Pass
          </a>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="max-w-md mx-auto pt-16 pb-8 px-6 text-center">
        <div className="text-4xl mb-4">😕</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-800">
          Something Went Wrong
        </h1>
        <p className="text-gray-600 mb-6">
          Try refreshing, or contact us for help.
        </p>
        <div className="space-x-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-block px-6 py-3 bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all"
          >
            Refresh
          </button>
          <a
            href="mailto:team@moxsf.com"
            className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-all"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-800 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <ActivatePageContent />
    </Suspense>
  )
}
