/**
 * Take someone out of the Mox Forkable clubs once their membership has ended.
 *
 * Rule: a person keeps Forkable while any of their People records is `Joined`
 * or `Paused` (see keepsForkableAccess). Everything that removes people from
 * Forkable goes through here so that rule is checked in exactly one place.
 */

import {
  Tables,
  findRecords,
  updateRecord,
  escapeAirtableString,
} from './airtable'
import { removeMemberFromForkable, type ForkableClubId } from './forkable'
import { keepsForkableAccess } from './membership'

interface PersonFields {
  Name?: string
  Email?: string
  Tier?: string
  Status?: string
  'In Forkable'?: boolean
}

export type OffboardResult =
  | { email: string; outcome: 'removed'; name?: string }
  | { email: string; outcome: 'skipped'; reason: string; name?: string }
  | { email: string; outcome: 'failed'; errors: string[]; name?: string }

interface OffboardOptions {
  /** Defaults to every Mox membership club. */
  clubIds?: ForkableClubId[]
}

export async function offboardFromForkable(
  rawEmail: string,
  { clubIds }: OffboardOptions = {}
): Promise<OffboardResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!email) {
    return { email, outcome: 'failed', errors: ['Missing email'] }
  }

  // One person can have several People records (e.g. member + event host), so
  // look at all of them: any live record means they keep their meals.
  const people = await findRecords<PersonFields>(
    Tables.People,
    `LOWER(TRIM({Email})) = '${escapeAirtableString(email)}'`,
    { fields: ['Name', 'Email', 'Tier', 'Status', 'In Forkable'] }
  )
  const name = people.find((p) => p.fields.Name)?.fields.Name

  const live = people.find((p) =>
    keepsForkableAccess({ status: p.fields.Status, tier: p.fields.Tier })
  )
  if (live) {
    const reason = `Membership still active or paused (${live.fields.Status ?? 'no status'} / ${live.fields.Tier ?? 'no tier'})`
    console.log(`[Forkable Offboard] Keeping ${email}: ${reason}`)
    return { email, outcome: 'skipped', reason, name }
  }

  const result = await removeMemberFromForkable({ email, clubIds })
  if (!result.success) {
    return {
      email,
      outcome: 'failed',
      errors: result.errors ?? ['Unknown error'],
      name,
    }
  }

  // Forkable is the part that matters; a stale checkbox must not turn a
  // successful removal into a reported failure.
  for (const person of people) {
    if (!person.fields['In Forkable']) continue
    try {
      await updateRecord(Tables.People, person.id, { 'In Forkable': false })
    } catch (error) {
      console.error(
        `[Forkable Offboard] Removed ${email} but could not clear "In Forkable" on ${person.id}:`,
        error
      )
    }
  }

  return { email, outcome: 'removed', name }
}

/** One Discord line per person, in the same style as the "added" messages. */
export function describeOffboardResult(result: OffboardResult): string {
  const who = result.name ? `${result.name} (${result.email})` : result.email
  switch (result.outcome) {
    case 'removed':
      return `✅ **Forkable:** ${who} removed from the Mox clubs (membership ended)`
    case 'skipped':
      return `⏭️ **Forkable:** ${who} kept. ${result.reason}`
    case 'failed':
      return (
        `❌ **Forkable:** Failed to remove ${who} from the Mox clubs. ` +
        `Please remove them manually at https://forkable.com/mc/admin/members\n\n` +
        `**Errors:**\n${result.errors.join('\n')}`
      )
  }
}
