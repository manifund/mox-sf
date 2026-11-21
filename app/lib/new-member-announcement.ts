// Posts "X just started their Mox membership 🎉" to the public #welcomes
// channel when a membership subscription starts, with the member's photo and
// the same "is into A and B" line the homepage directory shows.

import {
  Tables,
  findRecord,
  getRecord,
  escapeAirtableString,
  type AirtableRecord,
} from '@/app/lib/airtable'
import { sendChannelMessageWithFile, DISCORD_CHANNELS } from '@/app/lib/discord'

export interface NewMemberFields {
  Name?: string
  Photo?: Array<{
    url?: string
    filename?: string
    type?: string
    thumbnails?: { large?: { url?: string } }
  }>
  'Work thing'?: string
  'Work thing URL'?: string
  'Fun thing'?: string
  'Fun thing URL'?: string
}

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/

// Discord markdown: escape characters that would format or break the line.
function escapeMarkdown(text: string) {
  return text.replace(/([\\*_~`|>\[\]()#-])/g, '\\$1')
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

// Angle brackets stop Discord from unfurling a preview card for each link.
function interest(text?: string, url?: string) {
  const label = text?.trim()
  if (!label) return null
  const safe = escapeMarkdown(label)
  const href = url?.trim()
  return href ? `[${safe}](<${withProtocol(href)}>)` : safe
}

export function formatNewMemberMessage(fields: NewMemberFields): string | null {
  const name = fields.Name?.trim()
  if (!name) return null

  const lines = [`**${escapeMarkdown(name)} just started their Mox membership 🎉**`]

  const things = [
    interest(fields['Work thing'], fields['Work thing URL']),
    interest(fields['Fun thing'], fields['Fun thing URL']),
  ].filter(Boolean)
  if (things.length) {
    const firstName = escapeMarkdown(name.split(/\s+/)[0])
    lines.push(`${firstName} is into ${things.join(' and ')}`)
  }

  return lines.join('\n')
}

// Finds the member: the record id from checkout metadata is exact; customer id
// and email cover subscriptions started elsewhere (e.g. the Stripe dashboard).
export async function findNewMember({
  recordId,
  customerId,
  email,
}: {
  recordId?: string | null
  customerId: string
  email?: string | null
}): Promise<AirtableRecord<NewMemberFields> | null> {
  if (recordId && RECORD_ID.test(recordId)) {
    const byId = await getRecord<NewMemberFields>(Tables.People, recordId)
    if (byId) return byId
  }
  const byCustomer = await findRecord<NewMemberFields>(
    Tables.People,
    `{Stripe Customer ID}="${escapeAirtableString(customerId)}"`
  )
  if (byCustomer) return byCustomer
  if (!email) return null
  return findRecord<NewMemberFields>(
    Tables.People,
    `LOWER({Email})="${escapeAirtableString(email.toLowerCase())}"`
  )
}

async function downloadPhoto(fields: NewMemberFields) {
  const photo = fields.Photo?.[0]
  // The large thumbnail (~512px) is plenty for chat and avoids multi-MB uploads.
  const url = photo?.thumbnails?.large?.url || photo?.url
  if (!url) return undefined
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const data = await response.blob()
    const extension = (photo?.type || data.type).includes('png') ? 'png' : 'jpg'
    return { data, filename: `photo.${extension}` }
  } catch (error) {
    console.error('[New member] Could not download photo:', error)
    return undefined
  }
}

// Never throws: a missed welcome post shouldn't block the rest of onboarding.
export async function announceNewMember(lookup: {
  recordId?: string | null
  customerId: string
  email?: string | null
  fallbackName?: string | null
}): Promise<boolean> {
  try {
    const person = await findNewMember(lookup)
    const fields: NewMemberFields = person?.fields ?? {
      Name: lookup.fallbackName || undefined,
    }
    const message = formatNewMemberMessage(fields)
    if (!message) {
      console.log('[New member] No name to announce, skipping')
      return false
    }
    const photo = await downloadPhoto(fields)
    const { success } = await sendChannelMessageWithFile(
      DISCORD_CHANNELS.WELCOMES,
      message,
      photo
    )
    return success
  } catch (error) {
    console.error('[New member] Announcement failed:', error)
    return false
  }
}
