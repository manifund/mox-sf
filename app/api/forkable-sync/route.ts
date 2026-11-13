import { Tables, getRecord, updateRecord } from '@/app/lib/airtable'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { env } from '@/app/lib/env'
import {
  addMemberToForkable,
  FORKABLE_CLUBS,
  type ForkableClubId,
} from '@/app/lib/forkable'

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
  recordId: string
  secret?: string
}

/**
 * API endpoint for syncing members to Forkable based on their Airtable Tier.
 * Called by Airtable automation when a member's Tier is set to Private Office or Program.
 *
 * POST /api/forkable-sync
 * Body: { recordId: string, secret?: string }
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
