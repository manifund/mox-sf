// Matches a code typed into the web keypad (/door) to the Verkada access
// user who owns it.
//
// Verkada has no "who owns this code" lookup: a user's entry code can only
// be read one user at a time. So we keep an index of every user's code
// (stored as keyed hashes, never the codes themselves), built by reading
// each user once. That takes from half a minute to a couple of minutes, so
// it never happens while someone waits at the door: a cron rebuilds the
// index on a schedule, and codes the site itself issues are added the
// moment they are created (rememberDoorCode).
//
// The index is only a shortcut for finding the candidate user. Before any
// unlock we read that user again from Verkada and compare the live code and
// validity dates, so a stale index can make a code set by hand in Verkada
// Command slow to be recognised but can never let an old or revoked one in.

import { createHmac } from 'crypto'
import { env } from './env'
import { storeDelete, storeGet, storeSet } from './door-store'
import {
  getAccessUserCredentials,
  listAccessUsers,
  VerkadaRateLimitError,
  type AccessUserCredentials,
} from './verkada'

/** Verkada entry codes are 4 to 16 digits. */
export const PIN_PATTERN = /^\d{4,16}$/

const INDEX_KEY = 'pin-index'
/** Entries are re-checked live, so an old index is safe; keep it a week. */
const INDEX_TTL_SECONDS = 7 * 24 * 60 * 60
/** A code the site just issued, kept until the next rebuilds include it. */
const RECENT_TTL_SECONDS = 24 * 60 * 60
const recentKey = (hash: string) => `code:${hash}`

/** Marks a rebuild in progress so two never run at once (they starve each
 * other of Verkada's rate limit). Expires on its own if a build dies. */
const BUILDING_KEY = 'pin-index-building'
const BUILDING_TTL_SECONDS = 6 * 60
/** Stop a rebuild that runs this long; the next scheduled one starts over. */
const BUILD_DEADLINE_MS = 4 * 60 * 1000

// Kept low so a rebuild leaves room in Verkada's rate limit for someone
// unlocking the door at the same moment.
const READ_CONCURRENCY = 4
const READ_TIMEOUT_MS = 10_000
const RATE_LIMIT_RETRIES = 4

export interface PinMatch {
  userId: string
  name: string
}

interface PinIndex {
  builtAt: number
  /** How many access users Verkada listed. */
  users: number
  /** How many of them we failed to read (their codes are missing). */
  unread: number
  /** Keyed hash of an entry code -> its owner. */
  pins: Record<string, PinMatch>
}

function pinKey(pin: string): string {
  // Keyed with a server secret so the stored index can't be reversed by
  // hashing all million possible codes.
  return createHmac('sha256', `door-pin-index:${env.VERKADA_MEMBER_KEY}`)
    .update(pin)
    .digest('hex')
    .slice(0, 32)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readUser(
  userId: string
): Promise<AccessUserCredentials | null | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getAccessUserCredentials(userId, {
        timeoutMs: READ_TIMEOUT_MS,
      })
    } catch (error) {
      if (
        error instanceof VerkadaRateLimitError &&
        attempt < RATE_LIMIT_RETRIES
      ) {
        await sleep(1000 * (attempt + 1) + Math.random() * 500)
        continue
      }
      console.error(`[door-pins] could not read user ${userId}:`, error)
      return undefined
    }
  }
}

async function buildIndex(): Promise<PinIndex> {
  const started = Date.now()
  const users = await listAccessUsers()
  const pins: Record<string, PinMatch> = {}
  let unread = 0

  let next = 0
  const worker = async () => {
    while (next < users.length) {
      if (Date.now() - started > BUILD_DEADLINE_MS) {
        throw new Error(
          `index rebuild passed ${BUILD_DEADLINE_MS / 1000}s after ` +
            `${next} of ${users.length} users`
        )
      }
      const user = users[next++]
      const creds = await readUser(user.userId)
      if (creds === undefined) {
        unread++
      } else if (creds?.entryCode) {
        pins[pinKey(creds.entryCode)] = {
          userId: user.userId,
          name: user.name || user.email || user.userId,
        }
      }
    }
  }
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker))

  if (users.length > 0 && unread === users.length) {
    throw new Error('could not read any access user from Verkada')
  }

  const index: PinIndex = {
    builtAt: Date.now(),
    users: users.length,
    unread,
    pins,
  }
  console.log(
    `[door-pins] index built in ${Date.now() - started}ms: ` +
      `${users.length} users, ${Object.keys(pins).length} codes, ${unread} unread`
  )
  await storeSet(INDEX_KEY, index, INDEX_TTL_SECONDS)
  return index
}

export type RefreshResult =
  | { built: true; users: number; codes: number; unread: number; ms: number }
  | { built: false; reason: 'fresh' | 'already-building' }

/**
 * Rebuild the index unless it is younger than `maxAgeMs` or another rebuild
 * is already running. Slow (reads every access user): call it from the cron
 * or in the background, never while a person waits.
 */
export async function refreshPinIndex(
  maxAgeMs: number
): Promise<RefreshResult> {
  const index = await storeGet<PinIndex>(INDEX_KEY)
  if (index && Date.now() - index.builtAt <= maxAgeMs) {
    return { built: false, reason: 'fresh' }
  }
  if (await storeGet<number>(BUILDING_KEY)) {
    return { built: false, reason: 'already-building' }
  }

  const started = Date.now()
  await storeSet(BUILDING_KEY, started, BUILDING_TTL_SECONDS)
  try {
    const built = await buildIndex()
    return {
      built: true,
      users: built.users,
      codes: Object.keys(built.pins).length,
      unread: built.unread,
      ms: Date.now() - started,
    }
  } finally {
    await storeDelete(BUILDING_KEY)
  }
}

/**
 * Make a code the site just set in Verkada usable at /door straight away,
 * without waiting for the next rebuild. Never throws: failing here only
 * delays the code, and must not fail the flow that issued it.
 */
export async function rememberDoorCode(
  userId: string,
  name: string,
  code: string
): Promise<void> {
  try {
    const match: PinMatch = { userId, name: name || userId }
    await storeSet(recentKey(pinKey(code)), match, RECENT_TTL_SECONDS)
  } catch (error) {
    console.error(`[door-pins] could not remember code for ${userId}:`, error)
  }
}

/**
 * Check the candidate against Verkada right now: the user still exists,
 * still has exactly this code, and is inside their validity window.
 */
async function verify(
  candidate: PinMatch,
  pin: string,
  now: number,
  timeoutMs?: number
): Promise<boolean> {
  const creds = await getAccessUserCredentials(candidate.userId, { timeoutMs })
  if (!creds || creds.entryCode !== pin) return false
  if (creds.start && now < creds.start.getTime()) return false
  if (creds.end && now >= creds.end.getTime()) return false
  return true
}

export interface ResolveResult {
  /** The code's owner, or null if no valid user has this code right now. */
  match: PinMatch | null
  /**
   * False when there is no index yet, so a null match means "can't tell",
   * not "wrong code".
   */
  indexReady: boolean
  /** Age of the index, or null when there is none. */
  indexAgeMs: number | null
}

/**
 * Find the access user whose entry code is `pin`. Quick: one or two store
 * reads and one Verkada read. Throws if Verkada can't be reached, so callers
 * can tell "wrong code" from "door system down".
 */
export async function resolvePin(
  pin: string,
  options: { now?: number; timeoutMs?: number } = {}
): Promise<ResolveResult> {
  const now = options.now ?? Date.now()
  const hash = pinKey(pin)
  const [index, recent] = await Promise.all([
    storeGet<PinIndex>(INDEX_KEY),
    storeGet<PinMatch>(recentKey(hash)),
  ])

  // The just-issued entry first: it is newer than the index.
  const candidates: PinMatch[] = []
  if (recent) candidates.push(recent)
  const indexed = index?.pins[hash]
  if (indexed && indexed.userId !== recent?.userId) candidates.push(indexed)

  let match: PinMatch | null = null
  for (const candidate of candidates) {
    if (await verify(candidate, pin, now, options.timeoutMs)) {
      match = candidate
      break
    }
  }

  return {
    match,
    indexReady: index !== null,
    indexAgeMs: index ? Date.now() - index.builtAt : null,
  }
}
