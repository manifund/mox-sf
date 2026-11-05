'use client'

import { useEffect, useState } from 'react'

const GLITCH_TITLE = 'x̷o̵M̸ ̶— ̴ɹoɹɹǝ ̷ʎʇılɐǝɹ'
const GLITCH_SECONDS = 20

/**
 * A tiny, barely-visible square at the bottom of the homepage. Clicking it
 * engages "mega glitch mode": a `data-glitch` attribute on <html> that
 * globals.css turns into an upside-down, hue-cycling, Comic Sans fever dream.
 * It wears off after GLITCH_SECONDS; click again or press Escape to bail early.
 */
export default function GlitchButton() {
  const [active, setActive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(GLITCH_SECONDS)

  useEffect(() => {
    const root = document.documentElement
    if (!active) return

    const originalTitle = document.title
    root.setAttribute('data-glitch', '')
    document.title = GLITCH_TITLE
    setSecondsLeft(GLITCH_SECONDS)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false)
    }
    window.addEventListener('keydown', onKey)

    const tick = window.setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    )
    const expiry = window.setTimeout(
      () => setActive(false),
      GLITCH_SECONDS * 1000,
    )

    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearInterval(tick)
      window.clearTimeout(expiry)
      root.removeAttribute('data-glitch')
      document.title = originalTitle
    }
  }, [active])

  return (
    <>
      <button
        type="button"
        onClick={() => setActive((v) => !v)}
        aria-label={active ? 'Leave glitch mode' : 'Do not press'}
        aria-pressed={active}
        className="glitch-btn mx-auto mt-6 block h-1.5 w-1.5 cursor-pointer bg-gray-900 opacity-[0.06] transition-opacity hover:opacity-30 focus-visible:opacity-30 dark:bg-gray-100"
      />
      {active && (
        <div className="glitch-hint" role="status">
          ⚠️ MEGA GLITCH MODE ⚠️ &nbsp; reality returns in{' '}
          <strong>{secondsLeft}s</strong> &nbsp;·&nbsp; <kbd>esc</kbd> to flee
        </div>
      )}
    </>
  )
}
