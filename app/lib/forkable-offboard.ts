/**
 * Take people out of the Mox Forkable clubs once their membership has ended.
 *
 * Airtable is the only input: the daily cron (api/cron/forkable-offboard)
 * reads the People table for anyone marked "In Forkable" whose Status is
 * Cancelled, and removes them. A person is kept while any of their People
 * records is `Joined` or `Paused` (see keepsForkableAccess).
 */

import {
  Tables,
  findRecords,
  updateRecord,
  escapeAirtableString,
} from './airtable'
import { removeMemberFromForkable, type ForkableClubId } from './forkable'
import { hasEndedMembership, keepsForkableAccess } from './membership'

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
  | {
      email: string
      outcome: 'failed'
      errors: string[]
      name?: string
      /** Forkable rejected the request itself; see removeMemberFromForkable. */
      rejectedBySchema?: boolean
      apiHints?: string[]
      /** Forkable refused it for this person only. */
      refusedForMember?: boolean
    }

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
      rejectedBySchema: result.rejectedBySchema,
      apiHints: result.apiHints,
      refusedForMember: result.refusedForMember,
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

/** Emails of everyone Airtable says is in Forkable but no longer a member. */
export async function findEndedMembersInForkable(): Promise<string[]> {
  const people = await findRecords<PersonFields>(
    Tables.People,
    `AND({In Forkable}, TRIM({Status} & '') = 'Cancelled', {Email} != '')`,
    { fields: ['Email', 'Status'] }
  )
  const emails = people
    .filter((p) => hasEndedMembership(p.fields.Status))
    .map((p) => p.fields.Email?.trim().toLowerCase())
    .filter((email): email is string => !!email)
  return [...new Set(emails)]
}

export interface OffboardRun {
  /** How many people Airtable listed, before the per-run limit. */
  candidates: number
  results: OffboardResult[]
  /** Why the run stopped before reaching everyone, if it did. */
  stopped?: string
}

// After this many failures in a row something is wrong with Forkable or the
// session, not with the people: stop instead of failing for everyone.
const MAX_CONSECUTIVE_FAILURES = 3

export async function offboardEndedMembers({
  limit,
}: {
  limit: number
}): Promise<OffboardRun> {
  const emails = await findEndedMembersInForkable()
  const results: OffboardResult[] = []
  let consecutiveFailures = 0
  let stopped: string | undefined

  for (const email of emails.slice(0, limit)) {
    let result: OffboardResult
    try {
      result = await offboardFromForkable(email)
    } catch (error) {
      console.error(`[Forkable Offboard] Error removing ${email}:`, error)
      result = {
        email,
        outcome: 'failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      }
    }
    results.push(result)

    if (result.outcome !== 'failed') {
      consecutiveFailures = 0
      continue
    }
    if (result.rejectedBySchema) {
      stopped = 'Forkable does not accept the removal request'
      break
    }
    // One person Forkable will not remove (e.g. not in the club) must not
    // hold up everyone behind them, today or on later runs.
    if (result.refusedForMember) continue
    if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      stopped = `${MAX_CONSECUTIVE_FAILURES} removals failed in a row`
      break
    }
  }

  if (!stopped && emails.length > limit) {
    stopped = `limit of ${limit} per run reached; the rest go next run`
  }

  return { candidates: emails.length, results, stopped }
}

// Discord caps a message at 2000 characters.
const DISCORD_LIMIT = 1900

/** The Discord message for a cron run, or null when there is nothing to say. */
export function describeOffboardRun(run: OffboardRun): string | null {
  const removed = run.results.filter((r) => r.outcome === 'removed')
  const failed = run.results.filter((r) => r.outcome === 'failed')
  if (removed.length === 0 && failed.length === 0) return null

  const who = (r: OffboardResult) => r.name ?? r.email
  const lines = [
    `🍽️ **Forkable offboarding:** ${removed.length} removed from the Mox clubs, ` +
      `${failed.length} failed, ${run.candidates} cancelled member(s) were marked In Forkable.`,
  ]
  if (run.stopped) lines.push(`Stopped early: ${run.stopped}.`)
  if (removed.length) lines.push(`Removed: ${removed.map(who).join(', ')}`)

  const first = failed[0]
  if (first?.outcome === 'failed') {
    lines.push(`❌ ${who(first)}: ${first.errors.join('; ')}`)
    if (first.apiHints?.length) {
      lines.push(
        'Forkable offers these club/member operations (paste this to whoever maintains app/lib/forkable.ts):',
        '```',
        ...first.apiHints,
        '```'
      )
    } else {
      lines.push(
        'Remove them manually at https://forkable.com/mc/admin/members if this keeps failing.'
      )
    }
  }

  const message = lines.join('\n')
  if (message.length <= DISCORD_LIMIT) return message
  // Keep the code block closed when the hints are what overflowed.
  const cut = message.slice(0, DISCORD_LIMIT)
  return (cut.split('```').length % 2 === 0 ? `${cut}\n\`\`\`` : cut) + '\n…'
}
