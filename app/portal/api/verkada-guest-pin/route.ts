import { getSession } from '@/app/lib/session'
import { env } from '@/app/lib/env'

// Cache for Verkada API token (valid for 30 minutes, we refresh at 25 min to be safe)
let cachedToken: string | null = null
let tokenExpiresAt: number = 0
const TOKEN_TTL_MS = 25 * 60 * 1000 // 25 minutes

async function getVerkadaToken(): Promise<string | null> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  try {
    const tokenRes = await fetch('https://api.verkada.com/token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-api-key': env.VERKADA_MEMBER_KEY,
      },
    })

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text()
      console.error(
        '[Verkada API] Failed to get Verkada token:',
        tokenRes.status,
        errorText
      )
      return null
    }

    const { token } = await tokenRes.json()
    cachedToken = token
    tokenExpiresAt = Date.now() + TOKEN_TTL_MS
    return token
  } catch (error) {
    console.error('[Verkada API] Error getting token:', error)
    return null
  }
}

async function fetchVerkadaPinByUserId(
  userId: string
): Promise<string | null> {
  try {
    const token = await getVerkadaToken()
    if (!token) {
      return null
    }

    // Fetch user access info by user_id
    const url = `https://api.verkada.com/access/v1/access_users/user?user_id=${encodeURIComponent(userId)}`

    const userRes = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-verkada-auth': token,
      },
    })

    if (!userRes.ok) {
      const errorText = await userRes.text()
      console.error(
        '[Verkada API] Failed to fetch Verkada user data:',
        userRes.status,
        errorText
      )
      return null
    }

    const userData = await userRes.json()
    return userData.entry_code || null
  } catch (error) {
    console.error('[Verkada API] Error fetching Verkada user PIN:', error)
    return null
  }
}

export async function GET() {
  try {
    // Check if user is logged in
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const guestUserId = env.VERKADA_GUEST_USER_ID.trim()
    if (!guestUserId) {
      return Response.json({ pin: null, hasAccess: false })
    }

    const pin = await fetchVerkadaPinByUserId(guestUserId)

    if (!pin) {
      return Response.json({ pin: null, hasAccess: false })
    }

    return Response.json({ pin, hasAccess: true })
  } catch (error) {
    console.error('[Verkada Guest PIN] Error in verkada-guest-pin API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
