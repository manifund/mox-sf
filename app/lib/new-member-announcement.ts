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
  Website?: string
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

// Discord markdown: escape only what would restyle plain text. Over-escaping
// shows literal backslashes (Discord doesn't unescape "\-" inside links).
function escapeMarkdown(text: string) {
  return text.replace(/([\\*_~`|])/g, '\\$1')
}

// Link labels can't be escaped reliably, so drop the characters that would
// restyle the label or close the link early.
function linkLabel(text: string) {
  return text.replace(/[\\*_~`|\[\]]/g, '').trim()
}

// Member-entered URLs are messy ("example.com", or a sentence with a link
// buried in it). Use the first token that parses as a real http(s) URL with a
// dotted hostname; otherwise no link.
export function cleanUrl(raw?: string): string | null {
  if (!raw) return null
  for (const token of raw.trim().split(/\s+/)) {
    const candidate = token.replace(/^[<(]+|[>),.;]+$/g, '')
    if (!candidate) continue
    const withProtocol = /^https?:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`
    try {
      const url = new URL(withProtocol)
      if (!/^https?:$/.test(url.protocol)) continue
      if (!/\.[a-z]{2,}$/i.test(url.hostname)) continue
      return url.href
    } catch {
      continue
    }
  }
  return null
}

// Angle brackets stop Discord from unfurling a preview card for each link.
function linked(text: string, url?: string) {
  const href = cleanUrl(url)
  const label = href ? linkLabel(text) : ''
  return href && label ? `[${label}](<${href}>)` : escapeMarkdown(text)
}

export function formatNewMemberMessage(fields: NewMemberFields): string | null {
  const name = fields.Name?.trim()
  if (!name) return null

  const lines = [
    `**${linked(name, fields.Website)} just started their Mox membership 🎉**`,
  ]

  const things = [
    [fields['Work thing'], fields['Work thing URL']],
    [fields['Fun thing'], fields['Fun thing URL']],
  ]
    .filter(([text]) => text?.trim())
    .map(([text, url]) => linked(text!.trim(), url))
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
