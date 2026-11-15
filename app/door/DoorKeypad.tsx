'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'

// The web keypad: stands in for the keypad at the front door. Type any
// current Verkada door code (member, guest pass, day pass) to open the door.

type Status =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'rejected'
  | 'denied'
  | 'locked'
  | 'warming'
  | 'timeout'
  | 'error'

interface UnlockResponse {
  success: boolean
  reason?: 'invalid' | 'rejected' | 'denied' | 'locked' | 'warming' | 'error'
  attemptsLeft?: number
  retryAfterSec?: number
}

const MIN_DIGITS = 4
const MAX_DIGITS = 16
const SUCCESS_RESET_MS = 6000
/** Give up on an attempt after this long and say so. */
const TIMEOUT_MS = 15_000

// What to say while waiting, by seconds waited. A normal unlock answers in
// a second or two; the later lines are for when Verkada is slow.
const PROGRESS: Array<{ after: number; text: string }> = [
  { after: 0, text: 'Checking your code…' },
  { after: 3, text: 'Asking the door system to unlock…' },
  { after: 7, text: 'The door system is slow to answer. Still trying…' },
  { after: 11, text: 'Almost out of time. Giving it a few more seconds…' },
]

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function waitText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`
}

export default function DoorKeypad() {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [retryAfterSec, setRetryAfterSec] = useState(0)
  const [waitedSec, setWaitedSec] = useState(0)

  // Key handlers read the latest values through refs, so the listener is
  // attached once.
  const pinRef = useRef(pin)
  pinRef.current = pin
  const busyRef = useRef(false)
  busyRef.current = status === 'submitting'

  const addDigit = useCallback((digit: string) => {
    if (busyRef.current) return
    setStatus('idle')
    setPin((current) =>
      current.length >= MAX_DIGITS ? current : current + digit
    )
  }, [])

  const removeDigit = useCallback(() => {
    if (busyRef.current) return
    setStatus('idle')
    setPin((current) => current.slice(0, -1))
  }, [])

  const clear = useCallback(() => {
    if (busyRef.current) return
    setStatus('idle')
    setPin('')
  }, [])

  const submit = useCallback(async () => {
    const code = pinRef.current
    if (busyRef.current || code.length < MIN_DIGITS) return
    busyRef.current = true
    setWaitedSec(0)
    setStatus('submitting')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch('/door/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
        signal: controller.signal,
      })
      const data: UnlockResponse = await res.json()
      if (data.success) {
        setPin('')
        setStatus('success')
        return
      }
      // Keep the code on screen when it wasn't judged, so trying again is
      // one tap.
      if (data.reason !== 'warming' && data.reason !== 'error') setPin('')
      setAttemptsLeft(data.attemptsLeft ?? null)
      setRetryAfterSec(data.retryAfterSec ?? 0)
      setStatus(
        data.reason === 'locked' ||
          data.reason === 'denied' ||
          data.reason === 'warming'
          ? data.reason
          : data.reason === 'rejected' || data.reason === 'invalid'
            ? 'rejected'
            : 'error'
      )
    } catch {
      setStatus(controller.signal.aborted ? 'timeout' : 'error')
    } finally {
      clearTimeout(timer)
    }
  }, [])

  // Count seconds while waiting, to step through the progress messages.
  useEffect(() => {
    if (status !== 'submitting') return
    const started = Date.now()
    const tick = setInterval(
      () => setWaitedSec(Math.floor((Date.now() - started) / 1000)),
      500
    )
    return () => clearInterval(tick)
  }, [status])

  useEffect(() => {
    if (status !== 'success') return
    const timer = setTimeout(() => setStatus('idle'), SUCCESS_RESET_MS)
    return () => clearTimeout(timer)
  }, [status])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (/^[0-9]$/.test(event.key)) {
        addDigit(event.key)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        removeDigit()
      } else if (event.key === 'Escape') {
        clear()
      } else if (event.key === 'Enter' || event.key === '#') {
        // Let Enter on a focused keypad button act as that button.
        if (
          event.key === 'Enter' &&
          event.target instanceof HTMLButtonElement
        ) {
          return
        }
        submit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addDigit, removeDigit, clear, submit])

  const submitting = status === 'submitting'
  const progress = [...PROGRESS].reverse().find((p) => waitedSec >= p.after)
  const canSubmit = pin.length >= MIN_DIGITS && !submitting

  const keyClass =
    'h-16 border border-slate-300 bg-white text-2xl font-medium text-gray-800 ' +
    'tabular-nums transition-colors hover:bg-slate-100 active:bg-slate-200 ' +
    'disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-amber-800 cursor-pointer disabled:cursor-default'

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="max-w-xs mx-auto pt-10 pb-8 px-4">
        <h1 className="text-2xl font-bold text-center text-gray-900">
          Mox front door
        </h1>
        <p className="text-center text-sm text-gray-500 mb-6">
          1680 Mission St
        </p>

        <div
          className="h-16 mb-3 border-2 border-amber-200 bg-amber-50 flex items-center justify-center px-3"
          aria-label={pin ? `Code entered: ${pin.length} digits` : undefined}
        >
          {pin ? (
            <span className="text-3xl font-mono tabular-nums tracking-widest text-amber-900 truncate">
              {pin}
            </span>
          ) : (
            <span className="text-amber-800/70">Enter your door code</span>
          )}
        </div>

        <div className="min-h-18 mb-3 text-center text-sm" aria-live="polite">
          {status === 'submitting' && (
            <div className="flex items-center justify-center gap-2 pt-2 text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-amber-800"></div>
              {progress?.text}
            </div>
          )}
          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 p-3">
              <div className="font-semibold text-green-900">Door unlocked</div>
              <div className="text-green-800">Pull the door and come in.</div>
            </div>
          )}
          {status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 p-3 text-red-900">
              <div className="font-semibold">That code wasn’t accepted</div>
              {attemptsLeft !== null && attemptsLeft <= 2 && (
                <div className="text-red-800">
                  {attemptsLeft === 0
                    ? 'No tries left for now. Wait 10 minutes.'
                    : `${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left before a 10-minute pause.`}
                </div>
              )}
            </div>
          )}
          {status === 'denied' && (
            <div className="bg-amber-50 border border-amber-200 p-3 text-amber-900">
              <div className="font-semibold">
                That code can’t open the door now
              </div>
              <div>Guest codes only work during pass hours.</div>
            </div>
          )}
          {status === 'locked' && (
            <div className="bg-red-50 border border-red-200 p-3 text-red-900">
              <div className="font-semibold">Too many wrong codes</div>
              <div className="text-red-800">
                Try again in {waitText(retryAfterSec)}. Members can unlock from
                the{' '}
                <a href="/portal" className="underline">
                  portal
                </a>
                .
              </div>
            </div>
          )}
          {status === 'warming' && (
            <div className="bg-amber-50 border border-amber-200 p-3 text-amber-900">
              <div className="font-semibold">The keypad is starting up</div>
              <div>
                Your code wasn’t checked yet. Press Unlock door again in a
                minute, or members can unlock from the{' '}
                <a href="/portal" className="underline">
                  portal
                </a>
                .
              </div>
            </div>
          )}
          {status === 'timeout' && (
            <div className="bg-red-50 border border-red-200 p-3 text-red-900">
              <div className="font-semibold">
                The door system didn’t answer in time
              </div>
              <div className="text-red-800">
                If the door didn’t open, press Unlock door to try again. Members
                can also unlock from the{' '}
                <a href="/portal" className="underline">
                  portal
                </a>
                .
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 p-3 text-red-900">
              <div className="font-semibold">
                Couldn’t reach the door system
              </div>
              <div className="text-red-800">
                Press Unlock door to try again in a moment.
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={keyClass}
              disabled={submitting}
              onClick={() => addDigit(key)}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            className={`${keyClass} text-base!`}
            disabled={submitting || !pin}
            onClick={clear}
          >
            Clear
          </button>
          <button
            type="button"
            className={keyClass}
            disabled={submitting}
            onClick={() => addDigit('0')}
          >
            0
          </button>
          <button
            type="button"
            className={`${keyClass} flex items-center justify-center`}
            disabled={submitting || !pin}
            onClick={removeDigit}
            aria-label="Delete last digit"
          >
            <Delete className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="w-full h-14 bg-amber-800 text-white text-lg font-semibold transition-colors hover:bg-amber-900 active:bg-amber-950 disabled:bg-slate-300 disabled:text-slate-500 cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
          disabled={!canSubmit}
          onClick={submit}
        >
          Unlock door
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          Members: your code is in the{' '}
          <a href="/portal" className="text-amber-800 hover:text-amber-600">
            portal
          </a>
          . Guests: it’s on your pass.
        </p>
        <p className="mt-2 text-center text-sm text-gray-400">
          Trouble getting in?{' '}
          <a
            href="mailto:team@moxsf.com"
            className="text-amber-800 hover:text-amber-600"
          >
            team@moxsf.com
          </a>
        </p>
      </div>
    </div>
  )
}
