'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface SessionData {
  isLoggedIn: boolean
  name?: string
  email?: string
}

export default function PortalNav() {
  const pathname = usePathname()
  const [session, setSession] = useState<SessionData | null>(null)
  const [bannerHeight, setBannerHeight] = useState(0)
  const [weeklyCode, setWeeklyCode] = useState<string | null>(null)

  // Don't render on portal pages or full-screen special pages
  const isPortalPage =
    pathname?.startsWith('/portal') ||
    pathname?.startsWith('/lobby') ||
    pathname?.startsWith('/summerseason') ||
    pathname?.startsWith('/gef') ||
    pathname?.startsWith('/guest') || // guest pass unlock page
    pathname?.startsWith('/door') || // event door unlock page
    pathname?.startsWith('/tasks') // task board has its own header

  useEffect(() => {
    if (isPortalPage) return

    fetch('/portal/api/session')
      .then((res) => res.json())
      .then((data) => setSession(data))
      .catch(() => setSession({ isLoggedIn: false }))
  }, [isPortalPage])

  useEffect(() => {
    if (isPortalPage || !session?.isLoggedIn) return

    fetch('/portal/api/weekly-door-code')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code) setWeeklyCode(data.code)
      })
      .catch(() => {})
  }, [isPortalPage, session?.isLoggedIn])

  // Track banner visibility and adjust nav position on scroll
  useEffect(() => {
    const updateNavPosition = () => {
      const banner = document.querySelector('[data-top-banner]')
      if (!banner) {
        setBannerHeight(0)
        return
      }
      // Get how much of the banner is still visible (bottom edge relative to viewport top)
      const bannerBottom = banner.getBoundingClientRect().bottom
      // Nav should be positioned at banner bottom, but never below 0
      setBannerHeight(Math.max(0, bannerBottom))
    }

    // Check immediately and after a short delay (for SSR hydration)
    updateNavPosition()
    const timeout = setTimeout(updateNavPosition, 100)

    // Update on scroll
    window.addEventListener('scroll', updateNavPosition, { passive: true })

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('scroll', updateNavPosition)
    }
  }, [pathname])

  // Don't render on portal/full-screen pages or while loading
  if (isPortalPage || !session) {
    return null
  }

  return (
    <nav className="fixed right-0 z-50 p-4" style={{ top: bannerHeight }}>
      {session.isLoggedIn ? (
        <div className="flex items-center gap-2">
          {weeklyCode && (
            <div className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm">
              <svg
                className="w-4 h-5 text-gray-600 dark:text-gray-400"
                viewBox="0 0 24 32"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M4 1.5C2.6 1.5 1.5 2.6 1.5 4v24c0 1.4 1.1 2.5 2.5 2.5h16c1.4 0 2.5-1.1 2.5-2.5V4c0-1.4-1.1-2.5-2.5-2.5H4zm3 6a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zM7 13.4a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zM7 19.3a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm5 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zM5 25.5a.7.7 0 00-.7.7v1.6c0 .4.3.7.7.7h14a.7.7 0 00.7-.7v-1.6a.7.7 0 00-.7-.7H5z"
                  fill="currentColor"
                />
              </svg>
              <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                {weeklyCode}#
              </span>
            </div>
          )}
          <a
            href="/portal"
            className="flex items-center justify-center p-2 sm:p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors shadow-sm text-gray-600 dark:text-gray-400"
            aria-label="Go to member portal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </a>
        </div>
      ) : (
        <a
          href="/portal"
          className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-amber-900 dark:bg-yellow-400 border border-amber-900 dark:border-yellow-400 hover:bg-amber-800 dark:hover:bg-yellow-300 transition-colors shadow-sm text-white dark:text-gray-900"
          aria-label="Login to member portal"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="sm:inline text-sm uppercase font-sans font-semibold">
            Login
          </span>
        </a>
      )}
    </nav>
  )
}
