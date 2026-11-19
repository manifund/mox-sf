import { getSession } from './session'
import { getRecord, Tables } from './airtable'

export interface SessionMember {
  /** Airtable People record id */
  recordId: string
  email: string | null
  /** The Stripe customer on their People record, if any */
  stripeCustomerId: string | null
}

/**
 * The logged-in person (or the member a staff user is viewing as) and the
 * Stripe customer that belongs to them, read from Airtable on the server.
 *
 * Billing routes use this instead of a customer id sent by the browser: an id
 * from the client could be anyone's.
 */
export async function getSessionMember(): Promise<SessionMember | null> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return null

  const recordId = session.viewingAsUserId || session.userId
  const record = await getRecord<{
    Email?: string
    'Stripe Customer ID'?: string
  }>(Tables.People, recordId)
  if (!record) return null

  return {
    recordId: record.id,
    email: record.fields.Email?.trim() || null,
    stripeCustomerId: record.fields['Stripe Customer ID']?.trim() || null,
  }
}
