'use client'

import { useEffect, useState } from 'react'

const GLITCH_TITLE = 'x̷o̵M̸ ̶— ̴ɹoɹɹǝ ̷ʎʇılɐǝɹ'

/**
 * A tiny, barely-visible square at the bottom of the homepage. Clicking it
 * toggles "mega glitch mode": a `data-glitch` attribute on <html> that
 * globals.css turns into an upside-down, hue-cycling, Comic Sans fever dream.
 * Click again or press Escape to come back.
 */
export default function GlitchButton() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (!active) return

    const originalTitle = document.title
    root.setAttribute('data-glitch', '')
    document.title = GLITCH_TITLE

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
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
          ⚠️ MEGA GLITCH MODE ENGAGED ⚠️ &nbsp; press <kbd>esc</kbd> or click
          the square to flee
        </div>
      )}
    </>
  )
}
