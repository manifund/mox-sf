// Airtable and Verkada access for member-issued guest passes. Server only
// (node crypto). Rules live in guest-passes.ts; this file reads and writes
// records and keeps each pass's Verkada access user in step with them.

import crypto from 'crypto'
import {
  Tables,
  createRecord,
  findRecord,
  findRecords,
  getRecord,
  updateRecord,
  escapeAirtableString,
} from './airtable'
import {
  GUEST_PASS_TYPE,
  GUEST_TOKEN_PATTERN,
  guestPassState,
  passWindow,
  verkadaGuestName,
  type GuestPassSummary,
} from './guest-passes'
import {
  createGuestAccessUser,
  deleteAccessUser,
  listAccessEventsForUser,
} from './verkada'

export interface GuestPassFields {
  Name?: string
  'Pass Type'?: string
  Status?: string
  'Guest Name'?: string
  'Guest Email'?: string
  Token?: string
  'Valid Date'?: string
  'Door Code'?: string
  'Verkada User ID'?: string
  'Unlock Count'?: number
  'First Used'?: string
  'Issued By'?: string[]
  'Issued By Email'?: string[]
}

export interface GuestPassRecord {
  id: string
  token: string
  guestName: string
  guestEmail: string
  validDate: string
  status: string
  /** Keypad code; empty once the Verkada user is gone. */
  code: string
  /** Verkada user holding the code; empty once deleted. */
  verkadaUserId: string
  unlockCount: number
  firstUsedAt: string | null
  hostId: string | null
}

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

/** 12 chars from an unambiguous alphabet, ~68 bits of entropy. */
export function generateGuestToken(): string {
  const bytes = crypto.randomBytes(12)
  let out = ''
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]
  return out
}

export function parseGuestPass(record: {
  id: string
  fields: GuestPassFields
}): GuestPassRecord {
  const f = record.fields
  return {
    id: record.id,
    token: f.Token || '',
    guestName: f['Guest Name'] || '',
    guestEmail: f['Guest Email'] || '',
    validDate: f['Valid Date'] || '',
    status: f.Status || 'Unused',
    code: f['Door Code'] || '',
    verkadaUserId: f['Verkada User ID'] || '',
    unlockCount: f['Unlock Count'] || 0,
    firstUsedAt: f['First Used'] || null,
    hostId: f['Issued By']?.[0] || null,
  }
}

export function summarizeGuestPass(
  pass: GuestPassRecord,
  now: Date = new Date()
): GuestPassSummary {
  const state = guestPassState(pass, now)
  const live = state === 'active' || state === 'upcoming'
  return {
    id: pass.id,
    token: pass.token,
    guestName: pass.guestName,
    guestEmail: pass.guestEmail,
    validDate: pass.validDate,
    state,
    code: live && pass.code && pass.verkadaUserId ? pass.code : null,
    unlockCount: pass.unlockCount,
    firstUsedAt: pass.firstUsedAt,
  }
}

export async function findGuestPassByToken(
  token: string
): Promise<GuestPassRecord | null> {
  if (!GUEST_TOKEN_PATTERN.test(token)) return null
  const record = await findRecord<GuestPassFields>(
    Tables.DayPasses,
    `AND({Pass Type}='${GUEST_PASS_TYPE}', {Token}='${escapeAirtableString(token)}')`
  )
  return record ? parseGuestPass(record) : null
}

/** Every guest pass a host has issued, newest valid date first. */
export async function listGuestPassesForHost(
  hostEmail: string
): Promise<GuestPassRecord[]> {
  if (!hostEmail) return []
  const formula = `AND({Pass Type}='${GUEST_PASS_TYPE}', LOWER(ARRAYJOIN({Issued By Email}))='${escapeAirtableString(hostEmail.toLowerCase())}')`
  const records = await findRecords<GuestPassFields>(
    Tables.DayPasses,
    formula,
    {
      sort: [{ field: 'Valid Date', direction: 'desc' }],
    }
  )
  return records.map(parseGuestPass)
}

/**
 * Issue a pass: create the guest's Verkada access user (door code, active
 * only during the pass window), then the Airtable record. If Airtable fails
 * the Verkada user is removed again so no orphan code stays live.
 */
export async function createGuestPass(input: {
  hostId: string
  hostFirstName: string
  guestName: string
  guestEmail: string
  validDate: string
}): Promise<GuestPassRecord> {
  const token = generateGuestToken()
  const { start, end } = passWindow(input.validDate)
  const name = verkadaGuestName(input.guestName, input.hostFirstName)
  const access = await createGuestAccessUser({
    externalId: `guest-pass-${token}`,
    firstName: name.firstName,
    lastName: name.lastName,
    start,
    end,
  })

  try {
    // typecast lets Airtable add the "Guest Pass" select option on first use.
    const record = await createRecord<GuestPassFields>(
      Tables.DayPasses,
      {
        Name: `guest-${token}`,
        'Pass Type': GUEST_PASS_TYPE,
        Status: 'Unused',
        'Guest Name': input.guestName,
        'Guest Email': input.guestEmail,
        Token: token,
        'Valid Date': input.validDate,
        'Door Code': access.entryCode,
        'Verkada User ID': access.userId,
        'Unlock Count': 0,
        'Issued By': [input.hostId],
      },
      { typecast: true }
    )
    return parseGuestPass(record)
  } catch (error) {
    await deleteAccessUser(access.userId).catch((cleanupError) =>
      console.error(
        `[guest-passes] Airtable create failed and Verkada user ${access.userId} could not be removed:`,
        cleanupError
      )
    )
    throw error
  }
}

/** Kill the code in Verkada first, then mark the record. */
export async function revokeGuestPass(pass: GuestPassRecord): Promise<void> {
  if (pass.verkadaUserId) {
    await deleteAccessUser(pass.verkadaUserId)
  }
  await updateRecord<GuestPassFields>(
    Tables.DayPasses,
    pass.id,
    { Status: 'Revoked', 'Verkada User ID': '' },
    { typecast: true }
  )
}

/** Guest passes whose day is over but whose Verkada user still exists. */
export async function listGuestPassesToExpire(
  todayPT: string
): Promise<GuestPassRecord[]> {
  const formula = `AND({Pass Type}='${GUEST_PASS_TYPE}', {Verkada User ID}!='', DATETIME_FORMAT({Valid Date}, 'YYYY-MM-DD')<'${escapeAirtableString(todayPT)}')`
  const records = await findRecords<GuestPassFields>(Tables.DayPasses, formula)
  return records.map(parseGuestPass)
}

export interface ExpireResult {
  unlockCount: number
  firstUsedAt: string | null
}

/**
 * Close out a finished pass: note whether the guest came in (from Verkada's
 * door events for their user), delete the user, and mark the record. The
 * events lookup is best-effort; the deletion is not.
 */
export async function expireGuestPass(
  pass: GuestPassRecord
): Promise<ExpireResult> {
  const { start, end } = passWindow(pass.validDate)
  let unlockCount = pass.unlockCount
  let firstUsedAt = pass.firstUsedAt
  try {
    const events = await listAccessEventsForUser(pass.verkadaUserId, start, end)
    const accepted = events
      .filter((e) => e.accepted)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    if (accepted.length > 0) {
      unlockCount = accepted.length
      firstUsedAt = firstUsedAt || accepted[0].timestamp.toISOString()
    }
  } catch (error) {
    console.error(
      `[guest-passes] could not read door events for pass ${pass.id}:`,
      error
    )
  }

  await deleteAccessUser(pass.verkadaUserId)

  const used = unlockCount > 0
  await updateRecord<GuestPassFields>(
    Tables.DayPasses,
    pass.id,
    {
      'Verkada User ID': '',
      'Unlock Count': unlockCount,
      ...(firstUsedAt ? { 'First Used': firstUsedAt } : {}),
      ...(pass.status === 'Revoked'
        ? {}
        : { Status: used ? 'Activated' : 'Expired' }),
    },
    { typecast: true }
  )
  return { unlockCount, firstUsedAt }
}

export interface HostInfo {
  id: string
  name: string
  email: string
  status: string | null
  tier: string | null
}

export async function getHost(hostId: string): Promise<HostInfo | null> {
  const record = await getRecord<{
    Name?: string
    Email?: string
    Status?: string
    Tier?: string
  }>(Tables.People, hostId)
  if (!record) return null
  return {
    id: record.id,
    name: record.fields.Name || '',
    email: record.fields.Email || '',
    status: record.fields.Status || null,
    tier: record.fields.Tier || null,
  }
}
