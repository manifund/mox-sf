// Verkada helpers: one short-lived access user per guest pass (its own entry
// code, start/end window enforced at the keypad), the portal's remote
// unlock of the front door, and the reads and per-user unlock behind the web
// keypad at /door (see door-pins.ts). Member PINs are handled in
// app/portal/api/verkada-pin/route.ts.

import { env } from './env'

const API = 'https://api.verkada.com'
export const MOX_FRONT_DOOR_ID = 'ffa16025-e120-4094-b6be-29a6ed19b84c'
const TOKEN_TTL_MS = 25 * 60 * 1000
const TOKEN_TIMEOUT_MS = 8000
let cachedToken: { token: string; expiresAt: number } | null = null
let inflight: Promise<string | null> | null = null

async function fetchAdminToken(): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${API}/token`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-api-key': env.VERKADA_MEMBER_KEY,
      },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    })
  } catch (error) {
    console.error('Failed to reach Verkada for a token:', error)
    return null
  }

  if (!res.ok) {
    console.error('Failed to get Verkada token:', res.status)
    return null
  }

  const { token } = await res.json()
  return token ?? null
}

export async function getAdminToken(): Promise<string | null> {
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

export async function verkadaFetch(
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
    throw new Error(
      `template user lookup failed: ${await describeFailure(res)}`
    )
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

/** Tries per setup step when Verkada answers with a server error or 429. */
const SETUP_ATTEMPTS = 3
const SETUP_RETRY_BASE_MS = 400

/** Server errors and rate limits are worth another try; 4xx answers aren't. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * PUT one setup step for a just-created user. Verkada sometimes answers a
 * call made right after creating a user with a bare 500 ("Unable to set
 * start date.") that succeeds when repeated a moment later, so server errors,
 * rate limits and network failures are retried with a short backoff.
 */
async function setupPut(
  token: string,
  path: string,
  body: unknown,
  step: string
): Promise<void> {
  let lastFailure = ''
  for (let attempt = 1; attempt <= SETUP_ATTEMPTS; attempt++) {
    try {
      const res = await verkadaFetch(token, path, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        if (attempt > 1) {
          console.log(`[verkada] ${step} succeeded on attempt ${attempt}`)
        }
        return
      }
      lastFailure = await describeFailure(res)
      if (!isTransientStatus(res.status)) break
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    if (attempt < SETUP_ATTEMPTS) {
      console.warn(
        `[verkada] ${step} failed (attempt ${attempt}), retrying: ${lastFailure}`
      )
      await new Promise((resolve) =>
        setTimeout(resolve, SETUP_RETRY_BASE_MS * 2 ** (attempt - 1))
      )
    }
  }
  throw new Error(`${step} failed: ${lastFailure}`)
}

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
      await setupPut(
        token,
        `/access/v1/access_groups/group/user?group_id=${encodeURIComponent(groupId)}`,
        { user_id: userId },
        'add to group'
      )
    }

    await setupPut(
      token,
      `/access/v1/access_users/user/start_date?${q}`,
      { start_date: toSeconds(input.start) },
      'set start date'
    )
    await setupPut(
      token,
      `/access/v1/access_users/user/end_date?${q}`,
      { end_date: toSeconds(input.end) },
      'set end date'
    )

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
      // A clash (400/409) needs another code; a server hiccup or rate limit
      // needs a pause. Anything else won't be fixed by trying again.
      if (isTransientStatus(res.status)) {
        await new Promise((resolve) =>
          setTimeout(resolve, SETUP_RETRY_BASE_MS * 2 ** attempt)
        )
      } else if (res.status !== 400 && res.status !== 409) {
        break
      }
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

export interface UnlockResult {
  ok: boolean
  /** Verkada's HTTP status when the unlock was refused. */
  status?: number
  /** Verkada's own error message, for diagnosing refusals. */
  message?: string
}

/**
 * Open the front door remotely (Verkada admin_unlock). Only the member
 * portal calls this, for a signed-in active member. On failure we keep
 * Verkada's status and message so the portal can show why.
 */
export async function adminUnlockDoor(
  doorId: string = MOX_FRONT_DOOR_ID
): Promise<UnlockResult> {
  const token = await getAdminToken()
  if (!token) {
    return { ok: false, message: 'could not authenticate with Verkada' }
  }
  const res = await verkadaFetch(token, '/access/v1/door/admin_unlock', {
    method: 'POST',
    body: JSON.stringify({ door_id: doorId }),
  })
  return unlockResult(res)
}

async function unlockResult(res: Response): Promise<UnlockResult> {
  if (res.ok) return { ok: true }
  const text = await res.text().catch(() => '')
  let message = text.slice(0, 300)
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed?.message === 'string') message = parsed.message
  } catch {
    // not JSON; keep the raw text
  }
  return { ok: false, status: res.status, message }
}

/**
 * Open the front door as one particular access user (Verkada user_unlock).
 * Unlike admin_unlock, Verkada decides whether this user may open this door
 * right now (access levels, schedules) and records the unlock against them
 * in the access log, the same way a keypad entry would be. The web keypad at
 * /door uses this once it has matched a typed code to its owner.
 */
export async function userUnlockDoor(
  userId: string,
  options: { doorId?: string; timeoutMs?: number } = {}
): Promise<UnlockResult> {
  const token = await getAdminToken()
  if (!token) {
    return { ok: false, message: 'could not authenticate with Verkada' }
  }
  const res = await verkadaFetch(token, '/access/v1/door/user_unlock', {
    method: 'POST',
    body: JSON.stringify({
      door_id: options.doorId ?? MOX_FRONT_DOOR_ID,
      user_id: userId,
    }),
    signal: timeoutSignal(options.timeoutMs),
  })
  return unlockResult(res)
}

/** Gives up on a Verkada call after `timeoutMs` (the fetch then throws). */
function timeoutSignal(timeoutMs?: number): AbortSignal | undefined {
  return timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
}

export interface AccessUserSummary {
  userId: string
  name: string
  email: string
}

/**
 * Every access user in the organization. This list carries no entry codes;
 * those come one user at a time from getAccessUserCredentials.
 */
export async function listAccessUsers(): Promise<AccessUserSummary[]> {
  const token = await getAdminToken()
  if (!token) throw new Error('could not authenticate with Verkada')
  const res = await verkadaFetch(token, '/access/v1/access_users')
  if (!res.ok) {
    throw new Error(`list access users failed: ${await describeFailure(res)}`)
  }
  const data = await res.json()
  const members: Record<string, unknown>[] = data.access_members || []
  return members
    .filter((m) => typeof m.user_id === 'string' && m.user_id)
    .map((m) => ({
      userId: m.user_id as string,
      name: typeof m.full_name === 'string' ? m.full_name : '',
      email: typeof m.email === 'string' ? m.email : '',
    }))
}

export interface AccessUserCredentials {
  userId: string
  /** The keypad code, or null when the user has none. */
  entryCode: string | null
  /** When the user's access starts and stops, if limited. */
  start: Date | null
  end: Date | null
}

export class VerkadaRateLimitError extends Error {
  constructor() {
    super('Verkada rate limit reached')
    this.name = 'VerkadaRateLimitError'
  }
}

function parseSeconds(value: unknown): Date | null {
  const n = Number(value)
  if (value === null || value === undefined || value === '') return null
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n > 1e12 ? n : n * 1000)
}

/**
 * One access user's entry code and validity window. Returns null if the
 * user no longer exists. Throws VerkadaRateLimitError on a 429 so a caller
 * reading many users can slow down.
 */
export async function getAccessUserCredentials(
  userId: string,
  options: { timeoutMs?: number } = {}
): Promise<AccessUserCredentials | null> {
  const token = await getAdminToken()
  if (!token) throw new Error('could not authenticate with Verkada')
  const res = await verkadaFetch(
    token,
    `/access/v1/access_users/user?user_id=${encodeURIComponent(userId)}`,
    { signal: timeoutSignal(options.timeoutMs) }
  )
  if (res.status === 404) return null
  if (res.status === 429) throw new VerkadaRateLimitError()
  if (!res.ok) {
    throw new Error(`access user lookup failed: ${await describeFailure(res)}`)
  }
  const data = await res.json()
  return {
    userId,
    entryCode:
      typeof data.entry_code === 'string' && data.entry_code
        ? data.entry_code
        : null,
    start: parseSeconds(data.start_date),
    end: parseSeconds(data.end_date),
  }
}

/** Doors visible to the API key, for checking MOX_FRONT_DOOR_ID. */
export async function listDoors(): Promise<unknown> {
  const token = await getAdminToken()
  if (!token) throw new Error('could not authenticate with Verkada')
  const res = await verkadaFetch(token, '/access/v1/doors')
  if (!res.ok) {
    throw new Error(`list doors failed: ${await describeFailure(res)}`)
  }
  return res.json()
}
