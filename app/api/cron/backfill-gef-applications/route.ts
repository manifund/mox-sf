import { createRecords, getRecords, Tables } from '@/app/lib/airtable'
import { env } from '@/app/lib/env'

export const maxDuration = 60

type LegacyApplication = {
  Name?: string
  Email?: string
  Country?: string
  'Focus area'?: string
  Background?: string
  'Proud of'?: string
  Intentions?: string
  Status?: string
}

type PipelineApplication = {
  Email?: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstContact(createdTime?: string): string | undefined {
  if (!createdTime) return undefined
  const date = new Date(createdTime)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10)
}

/**
 * One-time, cron-authenticated migration for applications collected before
 * moxsf.com/gef began writing directly into the live GEF admissions pipeline.
 * It is idempotent: email addresses already in the pipeline are skipped.
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [legacy, pipeline] = await Promise.all([
      getRecords<LegacyApplication>(Tables.GefApplications, {
        fields: [
          'Name',
          'Email',
          'Country',
          'Focus area',
          'Background',
          'Proud of',
          'Intentions',
          'Status',
        ],
      }),
      getRecords<PipelineApplication>(Tables.GefPipeline, {
        fields: ['Email'],
      }),
    ])

    const existingEmails = new Set(
      pipeline
        .map((record) => text(record.fields.Email).toLowerCase())
        .filter(Boolean)
    )
    const records = []
    let skippedExisting = 0
    let skippedWithoutEmail = 0

    for (const record of legacy) {
      const email = text(record.fields.Email)
      if (!email) {
        skippedWithoutEmail += 1
        continue
      }

      const normalizedEmail = email.toLowerCase()
      if (existingEmails.has(normalizedEmail)) {
        skippedExisting += 1
        continue
      }

      // Add immediately so duplicate emails inside the legacy table are not
      // copied more than once in this run.
      existingEmails.add(normalizedEmail)
      const legacyStatus = text(record.fields.Status)
      const submittedOn = firstContact(record.createdTime)
      records.push({
        Name: text(record.fields.Name),
        Email: email,
        Country: text(record.fields.Country),
        Focus: text(record.fields['Focus area']),
        Background: text(record.fields.Background),
        Proud: text(record.fields['Proud of']),
        Intentions: text(record.fields.Intentions),
        Stage: 'Interest received',
        ...(submittedOn ? { 'First contact': submittedOn } : {}),
        Notes: [
          `Backfilled from legacy GEF Applications record ${record.id}.`,
          legacyStatus ? `Legacy status: ${legacyStatus}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      })
    }

    const created = await createRecords(Tables.GefPipeline, records, {
      typecast: true,
    })
    const result = {
      success: true,
      legacy: legacy.length,
      created: created.length,
      skippedExisting,
      skippedWithoutEmail,
    }
    console.log('[GEF backfill]', result)
    return Response.json(result)
  } catch (error) {
    console.error('[GEF backfill] Failed:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
