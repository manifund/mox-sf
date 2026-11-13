import { Tables, getRecord, updateRecord } from '@/app/lib/airtable'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { env } from '@/app/lib/env'
import {
  addMemberToForkable,
  FORKABLE_CLUBS,
  type ForkableClubId,
} from '@/app/lib/forkable'
import {
  offboardFromForkable,
  describeOffboardResult,
  type OffboardResult,
} from '@/app/lib/forkable-offboard'

// A bulk removal makes one Forkable call per person.
export const maxDuration = 300

// Upper bound on one bulk removal request.
const MAX_REMOVE_EMAILS = 100

// Map Airtable Tier to Forkable club IDs
// Private Office → MOX_RESIDENTS (they get resident-level meal access)
// Program → MOX_MEMBERS (they get member-level meal access)
const TIER_TO_FORKABLE_CLUBS: Record<string, ForkableClubId[]> = {
  'Private Office': [FORKABLE_CLUBS.MOX_RESIDENTS],
  Program: [FORKABLE_CLUBS.MOX_MEMBERS],
}

interface PersonFields {
  Name?: string
  Email?: string
  Tier?: string
  Status?: string
  'In Forkable'?: boolean
  'First Name'?: string
  'Last Name'?: string
}

interface SyncPayload {
  recordId?: string
  secret?: string
  /** Defaults to 'add'. */
  action?: 'add' | 'remove'
  /** Remove only: a list of emails instead of a single recordId. */
  emails?: string[]
}

/**
 * API endpoint for syncing members to Forkable based on their Airtable record.
 *
 * Add (default): called by Airtable automation when a member's Tier is set to
 * Private Office or Program.
 *   Body: { recordId: string, secret?: string }
 *
 * Remove: called by Airtable automation when a member who is "In Forkable" is
 * no longer Joined or Paused, or by staff with a list of emails for a cleanup.
 * Anyone whose membership is still active or paused is skipped, never removed.
 *   Body: { action: 'remove', recordId: string, secret: string }
 *   Body: { action: 'remove', emails: string[], secret: string }
 *
 * POST /api/forkable-sync
 */
export async function POST(request: Request) {
  let payload: SyncPayload

  try {
    payload = await request.json()
  } catch {
    console.error('[Forkable Sync] Invalid JSON payload')
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify secret if configured
  const expectedSecret = env.FORKABLE_SYNC_SECRET
  if (expectedSecret && payload.secret !== expectedSecret) {
    console.error('[Forkable Sync] Invalid secret')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.action === 'remove') {
    return handleRemove(payload)
  }

  const { recordId } = payload

  if (!recordId) {
    console.error('[Forkable Sync] Missing recordId')
    return Response.json({ error: 'Missing recordId' }, { status: 400 })
  }

  console.log(`[Forkable Sync] Processing sync for record: ${recordId}`)

  // Fetch the person record from Airtable
  const person = await getRecord<PersonFields>(Tables.People, recordId)

  if (!person) {
    console.error(`[Forkable Sync] Person not found: ${recordId}`)
    return Response.json({ error: 'Person not found' }, { status: 404 })
  }

  const { Name, Email, Tier, Status } = person.fields
  const inForkable = person.fields['In Forkable']

  // Skip if already in Forkable
  if (inForkable) {
    console.log(`[Forkable Sync] ${Email} already in Forkable, skipping`)
    return Response.json({ success: true, skipped: true, reason: 'Already in Forkable' })
  }

  // Skip if not "Joined" status
  if (Status !== 'Joined') {
    console.log(`[Forkable Sync] ${Email} status is "${Status}", not "Joined", skipping`)
    return Response.json({ success: true, skipped: true, reason: 'Not Joined status' })
  }

  // Check if tier qualifies for Forkable
  const clubIds = Tier ? TIER_TO_FORKABLE_CLUBS[Tier] : undefined

  if (!clubIds || clubIds.length === 0) {
    console.log(`[Forkable Sync] Tier "${Tier}" does not qualify for Forkable`)
    return Response.json({ success: true, skipped: true, reason: 'Tier not eligible' })
  }

  if (!Email) {
    console.error(`[Forkable Sync] No email for record ${recordId}`)
    return Response.json({ error: 'Missing email' }, { status: 400 })
  }

  // Parse name - use Airtable formula fields if available, otherwise parse
  let firstName = person.fields['First Name'] || ''
  let lastName = person.fields['Last Name'] || ''

  if (!firstName && Name) {
    const parts = Name.trim().split(/\s+/)
    firstName = parts[0] || ''
    lastName = parts.slice(1).join(' ')
  }

  console.log(`[Forkable Sync] Adding ${Email} (${Tier}) to Forkable clubs: ${clubIds.join(', ')}`)

  // Add to Forkable
  const result = await addMemberToForkable({
    email: Email,
    firstName: firstName || Email.split('@')[0],
    lastName,
    clubIds,
  })

  if (!result.success) {
    console.error(`[Forkable Sync] Failed to add ${Email} to Forkable:`, result.errors)

    // Send failure notification
    await sendNotification({
      email: Email,
      name: Name || Email,
      tier: Tier || 'Unknown',
      success: false,
      errors: result.errors,
    })

    return Response.json({
      success: false,
      errors: result.errors,
    }, { status: 500 })
  }

  console.log(`[Forkable Sync] Successfully added ${Email} to Forkable`)

  // Update "In Forkable" checkbox in Airtable
  try {
    await updateRecord(Tables.People, recordId, {
      'In Forkable': true,
    })
    console.log(`[Forkable Sync] Updated "In Forkable" checkbox for ${Email}`)
  } catch (error) {
    console.error(`[Forkable Sync] Failed to update "In Forkable" checkbox:`, error)
    // Don't fail the whole request - Forkable sync succeeded
  }

  // Send success notification
  await sendNotification({
    email: Email,
    name: Name || Email,
    tier: Tier || 'Unknown',
    success: true,
  })

  return Response.json({
    success: true,
    memberships: result.memberships,
  })
}

async function handleRemove(payload: SyncPayload) {
  // The add path only acts on what Airtable says about one record. Removal can
  // be driven by a bare list of emails, so it refuses to run unauthenticated.
  if (!env.FORKABLE_SYNC_SECRET) {
    console.error('[Forkable Sync] Removal requires FORKABLE_SYNC_SECRET to be configured')
    return Response.json(
      { error: 'FORKABLE_SYNC_SECRET is not configured' },
      { status: 503 }
    )
  }

  let emails: string[]

  if (payload.recordId) {
    const person = await getRecord<PersonFields>(Tables.People, payload.recordId)
    if (!person) {
      console.error(`[Forkable Sync] Person not found: ${payload.recordId}`)
      return Response.json({ error: 'Person not found' }, { status: 404 })
    }
    if (!person.fields.Email) {
      console.error(`[Forkable Sync] No email for record ${payload.recordId}`)
      return Response.json({ error: 'Missing email' }, { status: 400 })
    }
    emails = [person.fields.Email]
  } else if (
    Array.isArray(payload.emails) &&
    payload.emails.length > 0 &&
    payload.emails.every((e) => typeof e === 'string' && e.trim())
  ) {
    emails = [...new Set(payload.emails.map((e) => e.trim().toLowerCase()))]
    if (emails.length > MAX_REMOVE_EMAILS) {
      return Response.json(
        { error: `Too many emails (max ${MAX_REMOVE_EMAILS} per request)` },
        { status: 400 }
      )
    }
  } else {
    console.error('[Forkable Sync] Removal needs a recordId or a list of emails')
    return Response.json({ error: 'Missing recordId or emails' }, { status: 400 })
  }

  console.log(`[Forkable Sync] Processing removal for ${emails.length} email(s)`)

  const results: OffboardResult[] = []
  for (const email of emails) {
    try {
      results.push(await offboardFromForkable(email))
    } catch (error) {
      console.error(`[Forkable Sync] Error removing ${email}:`, error)
      results.push({
        email,
        outcome: 'failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      })
    }
  }

  const removed = results.filter((r) => r.outcome === 'removed')
  const skipped = results.filter((r) => r.outcome === 'skipped')
  const failed = results.filter((r) => r.outcome === 'failed')

  await sendRemovalNotification(results)

  return Response.json(
    {
      success: failed.length === 0,
      removed: removed.length,
      skipped: skipped.length,
      failed: failed.length,
      results,
    },
    { status: failed.length === 0 ? 200 : 500 }
  )
}

async function sendRemovalNotification(results: OffboardResult[]) {
  const channelId = DISCORD_CHANNELS.NOTIFICATIONS
  if (!channelId) {
    console.log('[Forkable Sync] No Discord notifications channel configured, skipping notification')
    return
  }

  let message: string
  if (results.length === 1) {
    // Nothing happened and nothing needs doing, so nothing to tell staff.
    if (results[0].outcome === 'skipped') return
    message = describeOffboardResult(results[0])
  } else {
    const count = (outcome: OffboardResult['outcome']) =>
      results.filter((r) => r.outcome === outcome).length
    const failed = results.filter((r) => r.outcome === 'failed')
    message =
      `🍽️ **Forkable cleanup:** ${count('removed')} removed from the Mox clubs, ` +
      `${count('skipped')} kept (still active or paused), ${failed.length} failed.`
    if (failed.length > 0) {
      // Discord caps a message at 2000 characters.
      const list = failed.map((r) => r.email).join(', ')
      message +=
        `\nRemove these manually at https://forkable.com/mc/admin/members: ` +
        (list.length > 1500 ? `${list.slice(0, 1500)}…` : list)
    }
  }

  const sent = await sendChannelMessage(channelId, message)
  if (sent) {
    console.log('[Forkable Sync] Sent Discord notification')
  } else {
    console.error('[Forkable Sync] Failed to send Discord notification')
  }
}

async function sendNotification({
  email,
  name,
  tier,
  success,
  errors,
}: {
  email: string
  name: string
  tier: string
  success: boolean
  errors?: string[]
}) {
  const channelId = DISCORD_CHANNELS.NOTIFICATIONS
  if (!channelId) {
    console.log('[Forkable Sync] No Discord notifications channel configured, skipping notification')
    return
  }

  const clubName = tier === 'Private Office' ? 'Mox Residents' : 'Mox Members'

  const message = success
    ? `✅ **Forkable:** ${name} (${email}) added to ${clubName}`
    : `❌ **Forkable:** Failed to add ${name} (${email}) to ${clubName}.` +
      `Please add them manually at https://forkable.com\n\n` +
      `**Errors:**\n${errors?.join('\n') || 'Unknown error'}`

  const sent = await sendChannelMessage(channelId, message)
  if (sent) {
    console.log('[Forkable Sync] Sent Discord notification')
  } else {
    console.error('[Forkable Sync] Failed to send Discord notification')
  }
}
