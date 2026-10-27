// Airtable access for member-issued guest passes. Server only (node crypto).
// Rules live in guest-passes.ts; this file just reads and writes records.

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
  type GuestPassSummary,
} from './guest-passes'

export interface GuestPassFields {
  Name?: string
  'Pass Type'?: string
  Status?: string
  'Guest Name'?: string
  'Guest Email'?: string
  Token?: string
  'Valid Date'?: string
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
    unlockCount: f['Unlock Count'] || 0,
    firstUsedAt: f['First Used'] || null,
    hostId: f['Issued By']?.[0] || null,
  }
}

export function summarizeGuestPass(
  pass: GuestPassRecord,
  now: Date = new Date()
): GuestPassSummary {
  return {
    id: pass.id,
    token: pass.token,
    guestName: pass.guestName,
    guestEmail: pass.guestEmail,
    validDate: pass.validDate,
    state: guestPassState(pass, now),
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

export async function createGuestPass(input: {
  hostId: string
  guestName: string
  guestEmail: string
  validDate: string
}): Promise<GuestPassRecord> {
  const token = generateGuestToken()
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
      'Unlock Count': 0,
      'Issued By': [input.hostId],
    },
    { typecast: true }
  )
  return parseGuestPass(record)
}

export async function revokeGuestPass(passId: string): Promise<void> {
  await updateRecord<GuestPassFields>(
    Tables.DayPasses,
    passId,
    { Status: 'Revoked' },
    { typecast: true }
  )
}

/** Record one door unlock: bump the count, stamp first use, mark Activated. */
export async function recordGuestUnlock(pass: GuestPassRecord): Promise<void> {
  await updateRecord<GuestPassFields>(
    Tables.DayPasses,
    pass.id,
    {
      'Unlock Count': pass.unlockCount + 1,
      ...(pass.firstUsedAt ? {} : { 'First Used': new Date().toISOString() }),
      ...(pass.status === 'Unused' ? { Status: 'Activated' } : {}),
    },
    { typecast: true }
  )
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
