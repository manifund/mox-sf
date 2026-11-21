'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DiscordIcon } from '../DiscordIcon'

// Map URL error codes to user-friendly messages
const errorMessages: Record<string, string> = {
  invalid: 'invalid login link. please try again.',
  expired: 'your login link has expired. please request a new one.',
  server: 'something went wrong. please try again.',
  discord_not_configured: 'discord login is not available at this time.',
  discord_denied: 'discord authorization was cancelled.',
  discord_token_failed: 'failed to connect with discord. please try again.',
  discord_user_failed: 'failed to get your discord info. please try again.',
  discord_not_linked:
    'that discord account isn\'t connected to a mox membership yet. log in with email, then use "connect discord" in the portal.',
  invalid_state: 'invalid request. please try again.',
  no_email: 'your account is missing an email address. please contact us.',
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <>
          <h1>member portal</h1>
          <p className="loading">loading...</p>
        </>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [message, setMessage] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    // Check for error in URL params (from OAuth callbacks)
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setStatus('error')
      setMessage(errorMessages[errorParam] || 'something went wrong. please try again.')
    }
  }, [searchParams])

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/portal/api/session')
        if (response.ok) {
          const data = await response.json()
          if (data.isLoggedIn) {
            router.push('/portal')
            return
          }
        }
      } catch (error) {
        console.error('Error checking session:', error)
      } finally {
        setCheckingSession(false)
      }
    }
    checkSession()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/portal/api/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('check your email! we sent you a login link.')
      } else {
        setStatus('error')
        setMessage(data.error || 'something went wrong. please try again.')
      }
    } catch (error) {
      setStatus('error')
      setMessage('failed to send email. please try again.')
    }
  }

  if (checkingSession) {
    return (
      <>
        <h1>member portal</h1>
        <p className="loading">checking session...</p>
      </>
    )
  }

  return (
    <>
      <Link href="/" className="back-link">
        ← back to home
      </Link>

      <h1>member portal</h1>

      {searchParams.get('joined') === '1' && (
        <div className="alert info">
          <p>
            welcome to mox! your membership is set up. sign in below with the
            email you used at checkout to finish your profile.
          </p>
        </div>
      )}

      <p>sign in to edit your profile and manage your membership.</p>

      <hr />

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">email address:</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={status === 'loading' || status === 'success'}
          />
        </div>

        {message && (
          <p className={status === 'success' ? 'success' : 'error'}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading' || status === 'success'}
          className="primary"
        >
          {status === 'loading' ? 'sending...' : 'send login link'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: '20px' }}>
        we'll email you a secure link to access your profile. the link expires
        in 24 hours.
      </p>

      <hr />

      <p>or sign in with discord:</p>

      <a
        href="/portal/auth/discord"
        className="button discord-button"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#5865F2',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '4px',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        <DiscordIcon size={20} />
        login with discord
      </a>

      <p className="muted" style={{ marginTop: '12px', fontSize: '0.9em' }}>
        works once you&apos;ve connected discord from the member portal.
      </p>
    </>
  )
}
