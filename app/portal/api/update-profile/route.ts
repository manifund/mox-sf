import { getSession } from '@/app/lib/session'
import { syncDiscordRole, isDiscordConfigured } from '@/app/lib/discord'
import { updateRecord, Tables } from '@/app/lib/airtable'
import { env } from '@/app/lib/env'

const MAX_PHOTO_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]

function isValidURL(url: string): boolean {
  if (!url) return true // Empty is okay
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidDiscordUsername(username: string): boolean {
  if (!username) return true // Empty is okay (unlinking)
  // Discord usernames: 2-32 chars, lowercase letters, numbers, underscores, periods
  // New format (2023+): no discriminator, just username
  const trimmed = username.trim().toLowerCase()
  if (trimmed.length < 2 || trimmed.length > 32) return false
  // Allow alphanumeric, underscores, periods
  return /^[a-z0-9_.]+$/.test(trimmed)
}

interface PersonFields {
  Name?: string
  Website?: string
  'Discord Username'?: string | null
  'Show in directory'?: boolean
  Photo?: { url: string; filename: string }[]
  Tier?: string
  Status?: string
  Program?: string[]
  'Work thing'?: string | null
  'Work thing URL'?: string | null
  'Fun thing'?: string | null
  'Fun thing URL'?: string | null
  'Job status'?: string | null
  Hiring?: boolean
  LinkedIn?: string | null
  'Career notes'?: string | null
  'Event digest'?: boolean
}

const JOB_STATUSES = ['Looking now', 'Open to offers', 'Not looking']

export async function POST(request: Request) {
  try {
    const session = await getSession()

    if (!session.isLoggedIn) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    // Ignore any client-supplied userId: only the session's own record (or
    // the record a staff member is viewing-as) may be edited.
    const userId = session.viewingAsUserId || session.userId
    const name = formData.get('name') as string
    const website = formData.get('website') as string
    const discordUsername = formData.get('discordUsername') as string | null
    const directoryVisible = formData.get('directoryVisible') === 'true'
    const photoFile = formData.get('photo') as File | null
    const workThing = formData.get('workThing') as string | null
    const workThingUrl = formData.get('workThingUrl') as string | null
    const funThing = formData.get('funThing') as string | null
    const funThingUrl = formData.get('funThingUrl') as string | null
    const jobStatus = formData.get('jobStatus') as string | null
    const hiring = formData.get('hiring')
    const linkedin = formData.get('linkedin') as string | null
    const careerNotes = formData.get('careerNotes') as string | null
    const eventDigest = formData.get('eventDigest')

    // Validate name
    if (!name || name.trim().length === 0) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return Response.json(
        { error: 'Name is too long (max 200 characters)' },
        { status: 400 }
      )
    }

    // Validate website URL
    const trimmedWebsite = website?.trim() || ''
    if (trimmedWebsite && !isValidURL(trimmedWebsite)) {
      return Response.json({ error: 'Invalid website URL' }, { status: 400 })
    }

    // Validate work thing URL
    const trimmedWorkThingUrl = workThingUrl?.trim() || ''
    if (trimmedWorkThingUrl && !isValidURL(trimmedWorkThingUrl)) {
      return Response.json({ error: 'Invalid work thing URL' }, { status: 400 })
    }

    // Validate fun thing URL
    const trimmedFunThingUrl = funThingUrl?.trim() || ''
    if (trimmedFunThingUrl && !isValidURL(trimmedFunThingUrl)) {
      return Response.json({ error: 'Invalid fun thing URL' }, { status: 400 })
    }

    // Validate Discord username
    const trimmedDiscord = discordUsername?.trim().toLowerCase() || ''
    if (trimmedDiscord && !isValidDiscordUsername(trimmedDiscord)) {
      return Response.json(
        {
          error:
            'Invalid Discord username. Use 2-32 characters: lowercase letters, numbers, underscores, or periods.',
        },
        { status: 400 }
      )
    }

    // Validate career fields (staff-only data, but still user-submitted)
    const trimmedJobStatus = jobStatus?.trim() || ''
    if (trimmedJobStatus && !JOB_STATUSES.includes(trimmedJobStatus)) {
      return Response.json({ error: 'Invalid job status' }, { status: 400 })
    }
    const trimmedLinkedin = linkedin?.trim() || ''
    if (trimmedLinkedin && !isValidURL(trimmedLinkedin)) {
      return Response.json({ error: 'Invalid LinkedIn URL' }, { status: 400 })
    }
    const trimmedCareerNotes = careerNotes?.trim() || ''
    if (trimmedCareerNotes.length > 1000) {
      return Response.json(
        { error: 'Career notes are too long (max 1000 characters)' },
        { status: 400 }
      )
    }

    // Prepare fields to update
    const fields: Partial<PersonFields> = {
      Name: name.trim(),
      Website: trimmedWebsite,
      'Discord Username': trimmedDiscord || null,
      'Show in directory': directoryVisible,
      'Work thing': workThing?.trim() || null,
      'Work thing URL': trimmedWorkThingUrl || null,
      'Fun thing': funThing?.trim() || null,
      'Fun thing URL': trimmedFunThingUrl || null,
      // Career fields are STAFF-ONLY: stored in Airtable, surfaced only on
      // /portal/admin/careers — never in the directory.
      'Job status': trimmedJobStatus || null,
      Hiring: hiring === 'true',
      LinkedIn: trimmedLinkedin || null,
      'Career notes': trimmedCareerNotes || null,
      'Event digest': eventDigest === 'true',
    }

    // Update Airtable record (without photo - that's handled separately)
    const data = await updateRecord<PersonFields>(Tables.People, userId, fields)

    // Handle photo upload via ImgBB, then save URL to Airtable
    if (photoFile && photoFile.size > 0) {
      // Validate file size
      if (photoFile.size > MAX_PHOTO_SIZE) {
        return Response.json(
          {
            error: `Photo is too large (max ${MAX_PHOTO_SIZE / 1024 / 1024}MB)`,
          },
          { status: 400 }
        )
      }

      // Validate file type
      if (!ALLOWED_PHOTO_TYPES.includes(photoFile.type)) {
        return Response.json(
          {
            error: 'Invalid photo format. Allowed: JPEG, PNG, WebP, GIF, HEIC',
          },
          { status: 400 }
        )
      }

      try {
        // Upload to ImgBB first
        const arrayBuffer = await photoFile.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        const imgbbFormData = new FormData()
        imgbbFormData.append('image', base64)
        imgbbFormData.append('name', photoFile.name || 'profile-photo')

        const imgbbResponse = await fetch(
          `https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`,
          {
            method: 'POST',
            body: imgbbFormData,
          }
        )

        if (!imgbbResponse.ok) {
          const errorText = await imgbbResponse.text()
          console.error('ImgBB upload error:', errorText)
          return Response.json(
            { error: 'Failed to upload photo. Please try again.' },
            { status: 500 }
          )
        }

        const imgbbData = await imgbbResponse.json()
        const imageUrl = imgbbData.data?.url

        if (!imageUrl) {
          console.error('ImgBB response missing URL:', imgbbData)
          return Response.json(
            { error: 'Failed to upload photo. Please try again.' },
            { status: 500 }
          )
        }

        // Update Airtable with the ImgBB URL
        await updateRecord<PersonFields>(Tables.People, userId, {
          Photo: [
            { url: imageUrl, filename: photoFile.name || 'profile-photo.jpg' },
          ],
        })
      } catch (photoError) {
        console.error('Error uploading photo:', photoError)
        return Response.json(
          { error: 'Failed to upload photo. Please try again.' },
          { status: 500 }
        )
      }
    }

    // Sync Discord role if username was provided and Discord is configured
    let discordSyncResult = null
    if (trimmedDiscord && isDiscordConfigured()) {
      const tier = data.fields.Tier || null
      const status = data.fields.Status || null
      discordSyncResult = await syncDiscordRole(
        trimmedDiscord,
        tier,
        status,
        data.fields.Program || []
      )
    }

    return Response.json({
      success: true,
      profile: data.fields,
      discordSync: discordSyncResult,
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return Response.json(
      { error: 'An error occurred while updating your profile' },
      { status: 500 }
    )
  }
}
