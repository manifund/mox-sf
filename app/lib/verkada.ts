// Verkada helpers for door codes that live outside a member's own account:
// one short-lived access user per guest pass, with its own entry code and a
// start/end window that Verkada enforces at the keypad. Member PINs are
// handled in app/portal/api/verkada-pin/route.ts. There is deliberately no
// remote-unlock helper here: the website never opens the door itself.

import { env } from './env'

const API = 'https://api.verkada.com'
const TOKEN_TTL_MS = 25 * 60 * 1000
let cachedToken: { token: string; expiresAt: number } | null = null
let inflight: Promise<string | null> | null = null

async function fetchAdminToken(): Promise<string | null> {
  const res = await fetch(`${API}/token`, {
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

async function verkadaFetch(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-verkada-auth': token,
      ...(init.headers || {}),
    },
  })
}

async function describeFailure(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  return `${res.status} ${text.slice(0, 300)}`
}

/** Cryptographically random entry code of `length` digits, no leading zero. */
export function generateEntryCode(length = 6): string {
  const digits = new Uint8Array(length)
  crypto.getRandomValues(digits)
  let out = ''
  for (let i = 0; i < length; i++) {
    const d = digits[i] % 10
    out += i === 0 && d === 0 ? '7' : String(d)
  }
  return out
}

/**
 * Access groups of the user whose door permissions a guest should copy. We
 * use the shared "Day Pass User": whatever doors and schedule a paid day pass
 * gets, a free guest pass gets too. No separate configuration needed.
 */
async function templateAccessGroupIds(token: string): Promise<string[]> {
  const templateId = env.VERKADA_UUID.trim()
  if (!templateId) {
    throw new Error('VERKADA_UUID (day pass template user) is not set')
  }
  const res = await verkadaFetch(
    token,
    `/access/v1/access_users/user?user_id=${encodeURIComponent(templateId)}`
  )
  if (!res.ok) {
    throw new Error(`template user lookup failed: ${await describeFailure(res)}`)
  }
  const data = await res.json()
  const groups: { group_id?: string }[] = data.access_groups || []
  const ids = groups.map((g) => g.group_id).filter((id): id is string => !!id)
  if (ids.length === 0) {
    throw new Error('template user is in no access groups')
  }
  return ids
}

export interface GuestAccessUserInput {
  /** Unique id on our side; Verkada rejects duplicates (409). */
  externalId: string
  firstName: string
  lastName: string
  /** When the code starts and stops working. */
  start: Date
  end: Date
}

export interface GuestAccessUser {
  userId: string
  entryCode: string
}

const ENTRY_CODE_ATTEMPTS = 4

/**
 * Create a Verkada access user for one guest pass: a user in the day-pass
 * access groups, active only between `start` and `end`, with a fresh entry
 * code. If any step after creation fails the user is deleted again so we
 * never leave a half-configured account behind.
 */
export async function createGuestAccessUser(
  input: GuestAccessUserInput
): Promise<GuestAccessUser> {
  const token = await getAdminToken()
  if (!token) throw new Error('Failed to authenticate with door system')

  const groupIds = await templateAccessGroupIds(token)

  const createRes = await verkadaFetch(token, '/core/v1/user', {
    method: 'POST',
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      external_id: input.externalId,
    }),
  })
  if (!createRes.ok) {
    throw new Error(`create user failed: ${await describeFailure(createRes)}`)
  }
  const created = await createRes.json()
  const userId: string | undefined = created.user_id
  if (!userId) throw new Error('create user returned no user_id')

  try {
    const q = `user_id=${encodeURIComponent(userId)}`
    const toSeconds = (d: Date) => String(Math.floor(d.getTime() / 1000))

    for (const groupId of groupIds) {
      const res = await verkadaFetch(
        token,
        `/access/v1/access_groups/group/user?group_id=${encodeURIComponent(groupId)}`,
        { method: 'PUT', body: JSON.stringify({ user_id: userId }) }
      )
      if (!res.ok) {
        throw new Error(`add to group failed: ${await describeFailure(res)}`)
      }
    }

    const startRes = await verkadaFetch(
      token,
      `/access/v1/access_users/user/start_date?${q}`,
      { method: 'PUT', body: JSON.stringify({ start_date: toSeconds(input.start) }) }
    )
    if (!startRes.ok) {
      throw new Error(`set start date failed: ${await describeFailure(startRes)}`)
    }
    const endRes = await verkadaFetch(
      token,
      `/access/v1/access_users/user/end_date?${q}`,
      { method: 'PUT', body: JSON.stringify({ end_date: toSeconds(input.end) }) }
    )
    if (!endRes.ok) {
      throw new Error(`set end date failed: ${await describeFailure(endRes)}`)
    }

    // Entry codes are unique per organization. override=false means a clash
    // with an existing code fails instead of stealing it, so try a few.
    let lastFailure = ''
    for (let attempt = 0; attempt < ENTRY_CODE_ATTEMPTS; attempt++) {
      const entryCode = generateEntryCode()
      const res = await verkadaFetch(
        token,
        `/access/v1/access_users/user/entry_code?${q}&override=false`,
        { method: 'PUT', body: JSON.stringify({ entry_code: entryCode }) }
      )
      if (res.ok) return { userId, entryCode }
      lastFailure = await describeFailure(res)
      // Anything other than a clash won't be fixed by trying another code.
      if (res.status !== 400 && res.status !== 409) break
    }
    throw new Error(`set entry code failed: ${lastFailure}`)
  } catch (error) {
    await deleteAccessUser(userId).catch((cleanupError) =>
      console.error(
        `[verkada] could not clean up guest user ${userId} after failure:`,
        cleanupError
      )
    )
    throw error
  }
}

/**
 * Delete a Verkada user (and with it the entry code). A user that is already
 * gone counts as success so cleanup can be retried safely.
 */
export async function deleteAccessUser(userId: string): Promise<void> {
  const token = await getAdminToken()
  if (!token) throw new Error('Failed to authenticate with door system')
  const res = await verkadaFetch(
    token,
    `/core/v1/user?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  )
  if (res.ok || res.status === 404) return
  throw new Error(`delete user failed: ${await describeFailure(res)}`)
}

export interface AccessEvent {
  timestamp: Date
  accepted: boolean
}

/**
 * Door events for one access user between two instants. Used after a guest
 * pass ends to record whether, and when, the guest actually came in.
 */
export async function listAccessEventsForUser(
  userId: string,
  start: Date,
  end: Date
): Promise<AccessEvent[]> {
  const token = await getAdminToken()
  if (!token) throw new Error('Failed to authenticate with door system')

  const events: AccessEvent[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      user_id: userId,
      start_time: String(Math.floor(start.getTime() / 1000)),
      end_time: String(Math.floor(end.getTime() / 1000)),
      page_size: '200',
    })
    if (pageToken) params.set('page_token', pageToken)
    const res = await verkadaFetch(token, `/events/v1/access?${params}`)
    if (!res.ok) {
      throw new Error(`events lookup failed: ${await describeFailure(res)}`)
    }
    const data = await res.json()
    for (const raw of data.events || []) {
      const ts = Number(raw.timestamp)
      if (!Number.isFinite(ts)) continue
      const type = String(
        raw.event_type || raw.event_info?.eventType || ''
      ).toLowerCase()
      const accepted =
        raw.event_info?.accepted !== false && !/denied|reject|fail/.test(type)
      events.push({
        timestamp: new Date(ts > 1e12 ? ts : ts * 1000),
        accepted,
      })
    }
    pageToken = data.next_page_token || undefined
  } while (pageToken && events.length < 2000)

  return events
}
