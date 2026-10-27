import { getRecord, Tables } from '@/app/lib/airtable'

interface ProfileFields {
  Name?: string
  Email?: string
  Website?: string
  Photo?: Array<{ url: string }>
  'Show in directory'?: boolean
  'Stripe Customer ID'?: string
  Status?: string
  Tier?: string
  Org?: string[]
  'Discord Username'?: string
  'Work thing'?: string
  'Work thing URL'?: string
  'Fun thing'?: string
  'Fun thing URL'?: string
  'Job status'?: string
  Hiring?: boolean
  LinkedIn?: string
  'Career notes'?: string
  'Event digest'?: boolean
}

export interface UserProfile {
  name: string
  email: string
  website: string
  photo: string | null
  directoryVisible: boolean
  stripeCustomerId: string | null
  status: string | null
  tier: string | null
  orgId: string | null
  discordUsername: string | null
  workThing: string | null
  workThingUrl: string | null
  funThing: string | null
  funThingUrl: string | null
  jobStatus: string | null
  hiring: boolean
  linkedin: string | null
  careerNotes: string | null
  eventDigest: boolean
}

export async function getUserProfile(
  recordId: string
): Promise<UserProfile | null> {
  const record = await getRecord<ProfileFields>(Tables.People, recordId)
  if (!record) return null

  const fields = record.fields
  return {
    name: fields.Name || '',
    email: fields.Email || '',
    website: fields.Website || '',
    photo: fields.Photo?.[0]?.url || null,
    directoryVisible: fields['Show in directory'] === true,
    stripeCustomerId: fields['Stripe Customer ID'] || null,
    status: fields.Status || null,
    tier: fields.Tier || null,
    orgId: fields.Org?.[0] || null,
    discordUsername: fields['Discord Username'] || null,
    workThing: fields['Work thing'] || null,
    workThingUrl: fields['Work thing URL'] || null,
    funThing: fields['Fun thing'] || null,
    funThingUrl: fields['Fun thing URL'] || null,
    jobStatus: fields['Job status'] || null,
    hiring: fields.Hiring === true,
    linkedin: fields.LinkedIn || null,
    careerNotes: fields['Career notes'] || null,
    eventDigest: fields['Event digest'] === true,
  }
}
