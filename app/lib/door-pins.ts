// Matches a code typed into the web keypad (/door) to the Verkada access
// user who owns it.
//
// Verkada has no "who owns this code" lookup: a user's entry code can only
// be read one user at a time. So we keep an index of every user's code
// (stored as keyed hashes, never the codes themselves), built by reading
// each user once. The index is only a shortcut for finding the candidate
// user. Before any unlock we read that user again from Verkada and compare
// the live code and validity dates, so a stale index can make a new code
// slow to be recognised but can never let an old or revoked one in.

import { createHmac } from 'crypto'
import { env } from './env'
import { storeGet, storeSet } from './door-store'
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
/**
 * A code we don't recognise may simply be newer than the index, so a miss
 * triggers a rebuild, but at most this often.
 */
export const REBUILD_COOLDOWN_MS = 60_000
const READ_CONCURRENCY = 8
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
      return await getAccessUserCredentials(userId)
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

// One rebuild at a time per instance; later callers share the result.
let inflight: Promise<PinIndex> | null = null

function rebuildIndex(): Promise<PinIndex> {
  if (!inflight) {
    inflight = buildIndex().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/**
 * Check the candidate against Verkada right now: the user still exists,
 * still has exactly this code, and is inside their validity window.
 */
async function verify(
  candidate: PinMatch | undefined,
  pin: string,
  now: number
): Promise<PinMatch | null> {
  if (!candidate) return null
  const creds = await getAccessUserCredentials(candidate.userId)
  if (!creds || creds.entryCode !== pin) return null
  if (creds.start && now < creds.start.getTime()) return null
  if (creds.end && now >= creds.end.getTime()) return null
  return candidate
}

export interface ResolveResult {
  /** The code's owner, or null if no valid user has this code right now. */
  match: PinMatch | null
  /** Age of the index the answer came from. */
  indexAgeMs: number
}

/**
 * Find the access user whose entry code is `pin`. Throws if Verkada can't
 * be reached, so callers can tell "wrong code" from "door system down".
 */
export async function resolvePin(
  pin: string,
  now: number = Date.now()
): Promise<ResolveResult> {
  let index = (await storeGet<PinIndex>(INDEX_KEY)) ?? (await rebuildIndex())
  let match = await verify(index.pins[pinKey(pin)], pin, now)

  if (!match && Date.now() - index.builtAt > REBUILD_COOLDOWN_MS) {
    index = await rebuildIndex()
    match = await verify(index.pins[pinKey(pin)], pin, now)
  }

  return { match, indexAgeMs: Date.now() - index.builtAt }
}

/** Rebuild the index if it is older than `maxAgeMs` (for background refresh). */
export async function refreshPinIndex(maxAgeMs: number): Promise<void> {
  const index = await storeGet<PinIndex>(INDEX_KEY)
  if (index && Date.now() - index.builtAt <= maxAgeMs) return
  await rebuildIndex()
}
