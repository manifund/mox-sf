'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
    'your discord account is not linked to a mox membership. please use email login or contact us.',
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
        <svg width="20" height="20" viewBox="0 0 71 55" fill="currentColor">
          <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1099 30.1693C30.1099 34.1136 27.2680 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7680 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.7018 30.1693C53.7018 34.1136 50.9027 37.3253 47.3178 37.3253Z" />
        </svg>
        login with discord
      </a>

      <p className="muted" style={{ marginTop: '12px', fontSize: '0.9em' }}>
        works if your discord account is linked to your membership.
      </p>
    </>
  )
}
