import { env } from './env'

export const MOX_FRONT_DOOR_ID = 'ffa16025-e120-4094-b6be-29a6ed19b84c'

// The access group that grants members front-door access. The Airtable
// "Add member to Verkada" automation adds users here (keyed by
// external_id = email) when a person's Status becomes Joined.
export const MOX_MEMBER_ACCESS_GROUP_ID = '01f7cb18-76f2-497c-9563-d865ba0ff536'

const TOKEN_TTL_MS = 25 * 60 * 1000
let cachedToken: { token: string; expiresAt: number } | null = null
let inflight: Promise<string | null> | null = null

async function fetchAdminToken(): Promise<string | null> {
  const res = await fetch('https://api.verkada.com/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-api-key': env.VERKADA_MEMBER_KEY,
    },
  })

  if (!res.ok) {
    console.error('Failed to get Verkada token:', res.status)
    return null
  }

  const { token } = await res.json()
  return token ?? null
}

async function getAdminToken(): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token
  }
  if (inflight) return inflight

  inflight = (async () => {
    const token = await fetchAdminToken()
    if (token) {
      cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS }
    }
    return token
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export async function adminUnlockDoor(
  doorId: string = MOX_FRONT_DOOR_ID
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAdminToken()
    if (!token) {
      return { ok: false, error: 'Failed to authenticate with door system' }
    }

    const resp = await fetch(
      'https://api.verkada.com/access/v1/door/admin_unlock',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-verkada-auth': token,
        },
        body: JSON.stringify({ door_id: doorId }),
      }
    )

    if (resp.status === 200) {
      return { ok: true }
    }

    const data = await resp.json().catch(() => ({}))
    console.error('Verkada unlock failed:', data)
    return { ok: false, error: 'Failed to unlock door' }
  } catch (error) {
    console.error('Error unlocking door:', error)
    return { ok: false, error: 'Failed to unlock door' }
  }
}

/**
 * Revoke a member's front-door access by removing them from the member access
 * group. The Verkada user itself is kept, so re-adding them (which the Airtable
 * "Add member to Verkada" automation does once "In Verkada" is unchecked and
 * Status is Joined again) is a no-op for the user and just restores the group.
 *
 * A 404 means the user was never in the group (or never existed); that is
 * treated as success because the goal state is reached.
 */
export async function removeMemberDoorAccess(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAdminToken()
    if (!token) {
      return { ok: false, error: 'Failed to authenticate with door system' }
    }

    const params = new URLSearchParams({
      group_id: MOX_MEMBER_ACCESS_GROUP_ID,
      external_id: email.trim(),
    })
    const resp = await fetch(
      `https://api.verkada.com/access/v1/access_groups/group/user?${params}`,
      {
        method: 'DELETE',
        headers: { accept: 'application/json', 'x-verkada-auth': token },
      }
    )

    if (resp.ok || resp.status === 404) {
      return { ok: true }
    }

    const body = await resp.text().catch(() => '')
    console.error('Verkada group removal failed:', resp.status, body)
    return { ok: false, error: `Verkada responded ${resp.status}` }
  } catch (error) {
    console.error('Error removing door access:', error)
    return { ok: false, error: 'Failed to reach door system' }
  }
}
