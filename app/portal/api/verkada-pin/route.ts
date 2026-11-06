import { getSession } from '@/app/lib/session'
import { getRecord, updateRecord, Tables } from '@/app/lib/airtable'
import { env } from '@/app/lib/env'
import { isActiveMember } from '@/app/lib/membership'

interface PersonFields {
  Email?: string
  Name?: string
  Status?: string
  Tier?: string
  'In Verkada'?: boolean
}

interface VerkadaUser {
  user_id?: string
  entry_code?: string
  access_groups?: Array<{ group_id?: string; name?: string }>
}

interface VerkadaGroup {
  group_id?: string
  name?: string
}

const MOX_ACCESS_GROUP_NAME = 'MoxSF'

// Cache for Verkada API token (valid for 30 minutes, we refresh at 25 min to be safe)
let cachedToken: string | null = null
let tokenExpiresAt: number = 0
const TOKEN_TTL_MS = 25 * 60 * 1000 // 25 minutes

// Cache for in-flight PIN requests to dedupe concurrent calls
// TODO: This is a workaround for the portal rendering both mobile and desktop views
// simultaneously, causing duplicate VerkadaPin components to mount and fetch.
// The proper fix is to refactor the portal to only render one view based on screen size.
// See TODO in app/portal/page.tsx
const inFlightRequests = new Map<string, Promise<Response>>()

async function getVerkadaToken(): Promise<string | null> {
  if (!env.VERKADA_MEMBER_KEY) {
    console.error('[Verkada API] No API key configured')
    return null
  }
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

// Generate a cryptographically secure random 6-digit PIN
function generateSecurePin(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  // Generate a number between 100000 and 999999
  const pin = (array[0] % 900000) + 100000
  return pin.toString()
}

async function fetchVerkadaUserByEmail(
  email: string,
  token: string
): Promise<{ user: VerkadaUser | null; notFound: boolean }> {
  try {
    const url = `https://api.verkada.com/access/v1/access_users/user?email=${encodeURIComponent(email)}`

    const userRes = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-verkada-auth': token,
      },
    })

    if (userRes.status === 404) {
      return { user: null, notFound: true }
    }

    if (!userRes.ok) {
      const errorText = await userRes.text()
      console.error(
        '[Verkada API] Failed to fetch Verkada user data:',
        userRes.status,
        errorText
      )
      return { user: null, notFound: false }
    }

    return { user: await userRes.json(), notFound: false }
  } catch (error) {
    console.error('[Verkada API] Error fetching Verkada user:', error)
    return { user: null, notFound: false }
  }
}

async function getMember(userId: string) {
  try {
    const record = await getRecord<PersonFields>(Tables.People, userId)

    if (!record) {
      console.error('[Verkada PIN] User not found in Airtable:', userId)
      return null
    }

    return record
  } catch (error) {
    console.error('[Verkada PIN] Failed to fetch user from Airtable:', error)
    return null
  }
}

async function createVerkadaUser(
  email: string,
  name: string,
  token: string
): Promise<string | null> {
  try {
    const [firstName, ...rest] = name.trim().split(/\s+/)
    const userRes = await fetch('https://api.verkada.com/core/v1/user', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-verkada-auth': token,
      },
      body: JSON.stringify({
        external_id: email,
        email,
        first_name: firstName || email,
        ...(rest.length > 0 ? { last_name: rest.join(' ') } : {}),
      }),
    })

    if (!userRes.ok) {
      console.error('[Verkada API] Failed to create user:', userRes.status, await userRes.text())
      return null
    }

    const userData = await userRes.json()
    return userData.user_id || userData.user?.user_id || null
  } catch (error) {
    console.error('[Verkada API] Error creating user:', error)
    return null
  }
}

async function getMoxAccessGroupId(token: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.verkada.com/access/v1/access_groups', {
      headers: { accept: 'application/json', 'x-verkada-auth': token },
    })
    if (!response.ok) {
      console.error('[Verkada API] Failed to list access groups:', response.status, await response.text())
      return null
    }
    const { access_groups: groups = [] } = await response.json() as { access_groups?: VerkadaGroup[] }
    return groups.find((group) => group.name === MOX_ACCESS_GROUP_NAME)?.group_id || null
  } catch (error) {
    console.error('[Verkada API] Error listing access groups:', error)
    return null
  }
}

async function ensureMoxAccessGroup(user: VerkadaUser, token: string): Promise<boolean> {
  const groupId = await getMoxAccessGroupId(token)
  if (!groupId || !user.user_id) return false

  if (user.access_groups?.some((group) => group.group_id === groupId)) return true

  try {
    const response = await fetch(
      `https://api.verkada.com/access/v1/access_groups/group/user?group_id=${encodeURIComponent(groupId)}`,
      {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-verkada-auth': token,
        },
        body: JSON.stringify({ user_id: user.user_id }),
      }
    )
    if (!response.ok) {
      console.error('[Verkada API] Failed to add member to MoxSF:', response.status, await response.text())
    }
    return response.ok
  } catch (error) {
    console.error('[Verkada API] Error adding member to MoxSF:', error)
    return false
  }
}

async function setVerkadaPin(userId: string, pin: string, token: string): Promise<boolean> {
  try {
    if (!userId) {
      console.error('[Verkada API] No user_id found for PIN update')
      return false
    }

    const setPinRes = await fetch(
      `https://api.verkada.com/access/v1/access_users/user/entry_code?user_id=${encodeURIComponent(userId)}&override=false`,
      {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-verkada-auth': token,
        },
        body: JSON.stringify({
          entry_code: pin,
        }),
      }
    )

    if (!setPinRes.ok) {
      const errorText = await setPinRes.text()
      console.error(
        '[Verkada API] Failed to set PIN:',
        setPinRes.status,
        errorText
      )
      return false
    }

    return true
  } catch (error) {
    console.error('[Verkada API] Error setting PIN:', error)
    return false
  }
}

async function getMemberAndToken(userId: string) {
  const record = await getMember(userId)
  const fields = record?.fields
  if (!record || !fields?.Email || !isActiveMember({ status: fields.Status, tier: fields.Tier })) {
    return null
  }
  const token = await getVerkadaToken()
  if (!token) return null
  return { record, fields, token }
}

async function fetchPinForUser(effectiveUserId: string): Promise<Response> {
  const member = await getMemberAndToken(effectiveUserId)
  if (!member) {
    return Response.json({ pin: null, hasAccess: false })
  }

  const { user, notFound } = await fetchVerkadaUserByEmail(member.fields.Email!, member.token)
  if (!user) {
    return Response.json({ pin: null, hasAccess: false, needsProvisioning: notFound })
  }

  return Response.json({ pin: user.entry_code || null, hasAccess: Boolean(user.entry_code), needsProvisioning: !user.entry_code })
}

export async function GET() {
  try {
    // Check if user is logged in
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use viewingAsUserId if staff is viewing as another user
    const effectiveUserId = session.viewingAsUserId || session.userId

    // Dedupe concurrent requests for the same user
    const existingRequest = inFlightRequests.get(effectiveUserId)
    if (existingRequest) {
      return existingRequest.then((res) => res.clone())
    }

    const requestPromise = fetchPinForUser(effectiveUserId)
    inFlightRequests.set(effectiveUserId, requestPromise)

    try {
      const response = await requestPromise
      return response
    } finally {
      inFlightRequests.delete(effectiveUserId)
    }
  } catch (error) {
    console.error('[Verkada PIN] Error in verkada-pin API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    // Check if user is logged in
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Don't allow PIN regeneration when viewing as another user
    if (session.viewingAsUserId) {
      return Response.json(
        { error: 'Cannot regenerate PIN while viewing as another user' },
        { status: 403 }
      )
    }

    const member = await getMemberAndToken(session.userId)
    if (!member) {
      return Response.json({ error: 'Your active membership could not be verified' }, { status: 403 })
    }

    let { user, notFound } = await fetchVerkadaUserByEmail(member.fields.Email!, member.token)
    if (!user && notFound) {
      const userId = await createVerkadaUser(member.fields.Email!, member.fields.Name || '', member.token)
      if (!userId) {
        return Response.json({ error: 'Failed to create your door-access account' }, { status: 502 })
      }
      user = { user_id: userId }
    }
    if (!user?.user_id) {
      return Response.json({ error: 'Door system is temporarily unavailable' }, { status: 502 })
    }

    if (!await ensureMoxAccessGroup(user, member.token)) {
      return Response.json({ error: 'Failed to grant door access' }, { status: 502 })
    }

    // Entry codes are unique across the organization. A collision is rare but
    // should not leave a member stranded at the door, so try fresh values
    // before returning an error.
    let newPin: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateSecurePin()
      if (await setVerkadaPin(user.user_id, candidate, member.token)) {
        newPin = candidate
        break
      }
    }

    if (!newPin) {
      return Response.json({ error: 'Failed to update PIN' }, { status: 500 })
    }

    // Keep the member record in sync. A stale checkbox must never prevent a
    // successfully provisioned member from receiving their code.
    if (!member.fields['In Verkada']) {
      try {
        await updateRecord<PersonFields>(Tables.People, member.record.id, { 'In Verkada': true })
      } catch (error) {
        console.error('[Verkada PIN] Failed to mark member as provisioned:', error)
      }
    }

    return Response.json({ pin: newPin, hasAccess: true })
  } catch (error) {
    console.error('[Verkada PIN] Error regenerating PIN:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
