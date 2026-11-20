'use server'
import { getRecord, Tables } from '@/app/lib/airtable'
import { findExistingMembership } from '@/app/lib/existing-membership'

interface PersonFields {
  Name?: string
  Email?: string
  Status?: string
  Tier?: string
  'Stripe Customer ID'?: string
}

/** Statuses whose /join?id= link opens the checkout page. Joined covers people
 *  who came in through a program (Tier Program) or by hand and now want a
 *  paid membership; anyone already paying is caught by the Stripe check. */
const JOINABLE_STATUSES = ['Invited', 'To Invite', 'Cancelled', 'Joined']

export type JoinLookup =
  | { kind: 'invited'; name: string; recordId: string; email: string | null }
  | { kind: 'member'; name: string }
  | { kind: 'not-found' }

/** Resolves a /join?id= link to what the page should show. */
export async function lookupJoinLink(recordId: string): Promise<JoinLookup> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return { kind: 'not-found' }
  try {
    const record = await getRecord<PersonFields>(Tables.People, recordId)
    const name = record?.fields.Name
    if (!record || !name) return { kind: 'not-found' }
    if (!JOINABLE_STATUSES.includes(record.fields.Status ?? '')) {
      return { kind: 'not-found' }
    }

    const existing = await findExistingMembership({
      customerIds: [record.fields['Stripe Customer ID']],
      email: record.fields.Email,
    })
    if (existing.held) return { kind: 'member', name }

    return {
      kind: 'invited',
      name,
      recordId: record.id,
      email: record.fields.Email ?? null,
    }
  } catch (e) {
    console.error('Failed to look up join link:', e)
    return { kind: 'not-found' }
  }
}
