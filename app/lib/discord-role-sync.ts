import { findRecords, Tables } from './airtable'
import { ACTIVE_TIERS, PROGRAM_TO_ROLE } from './discord-constants'
import {
  listDiscordMembers,
  normalizeDiscordUsername,
  syncDiscordRole,
  type SyncResult,
} from './discord'

export interface DiscordPersonFields {
  Name?: string
  'Discord Username'?: string
  Tier?: string
  Status?: string
  Program?: string[]
}

/** Reconcile Airtable edits and retry members who joined Discord after onboarding. */
export async function syncAirtableDiscordRoles(
  options: { dryRun?: boolean } = {}
) {
  const started = Date.now()
  const records = await findRecords<DiscordPersonFields>(
    Tables.People,
    'AND({Discord Username} != "", {Status} = "Joined")',
    { fields: ['Name', 'Discord Username', 'Tier', 'Status', 'Program'] }
  )
  const people = records.filter(
    (p) =>
      p.fields.Status === 'Joined' && ACTIVE_TIERS.includes(p.fields.Tier || '')
  )
  const members = await listDiscordMembers()
  const byUsername = new Map(
    members.map((m) => [normalizeDiscordUsername(m.user.username), m])
  )
  const counts = new Map<string, number>()
  for (const person of people) {
    const key = normalizeDiscordUsername(
      person.fields['Discord Username'] || ''
    )
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const results: {
    success: Array<{
      personId: string
      name: string
      discordUsername: string
      role: string
      programRoles: string[]
      rolesAdded: string[]
      rolesRemoved: string[]
    }>
    failed: Array<{
      personId: string
      name: string
      discordUsername: string
      error: string
    }>
    skipped: Array<{
      personId: string
      name: string
      discordUsername: string
      reason: string
    }>
  } = { success: [], failed: [], skipped: [] }
  const unmappedProgramIds = new Set<string>()
  let processed = 0
  for (const person of people) {
    // Leave time for Vercel to return a useful response; the next run resumes
    // naturally because assignments are idempotent and completed roles are skipped.
    if (Date.now() - started > 240_000) break
    processed++
    const fields = person.fields
    const discordUsername = fields['Discord Username'] || ''
    const key = normalizeDiscordUsername(discordUsername)
    const identity = {
      personId: person.id,
      name: fields.Name || '',
      discordUsername,
    }
    for (const id of fields.Program || [])
      if (!PROGRAM_TO_ROLE[id]) unmappedProgramIds.add(id)
    if (!key || (counts.get(key) || 0) > 1) {
      results.skipped.push({
        ...identity,
        reason: !key
          ? 'Discord username is empty'
          : 'Discord username appears on multiple active Airtable records',
      })
      continue
    }
    const member = byUsername.get(key)
    if (!member) {
      results.skipped.push({
        ...identity,
        reason:
          'No exact Discord username match in Mox; confirm the current username or join the server',
      })
      continue
    }
    let result: SyncResult
    try {
      result = await syncDiscordRole(
        discordUsername,
        fields.Tier || null,
        fields.Status || null,
        fields.Program || [],
        { member, dryRun: options.dryRun }
      )
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Discord error',
      }
    }
    if (result.success) {
      results.success.push({
        ...identity,
        role: result.roleAssigned!,
        programRoles: result.programRoles || [],
        rolesAdded: result.rolesAdded || [],
        rolesRemoved: result.previousRoles || [],
      })
    } else {
      results.failed.push({
        ...identity,
        error: result.error || 'Unknown Discord error',
      })
    }
  }
  return {
    success: results.failed.length === 0 && processed === people.length,
    dryRun: !!options.dryRun,
    total: people.length,
    synced: results.success.length,
    changed: results.success.filter(
      (r) => r.rolesAdded.length > 0 || r.rolesRemoved.length > 0
    ).length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    pending: people.length - processed,
    unmappedProgramIds: [...unmappedProgramIds],
    results,
  }
}
