import { escapeAirtableString, isValidEmail } from '@/app/lib/airtable-helpers'
import { createRecord, findRecord, Tables, updateRecord } from '@/app/lib/airtable'
import { sendEmail } from '@/app/lib/email'

// Both people responsible for GEF admissions receive every website interest.
const RECIPIENTS = ['carolina@moxsf.com', 'robin@moxsf.com']

// Fields collected by the GEF interest form, in display order.
const FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'country', label: 'Current country' },
  { key: 'focus', label: 'Primary focus area' },
  { key: 'background', label: 'Background' },
  { key: 'proud', label: 'Work they are proud of' },
  { key: 'intentions', label: 'What they would work on in SF' },
]

// Guard against oversized payloads.
const MAX_FIELD_LENGTH = 5000

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Collect + trim submitted values.
  const values: Record<string, string> = {}
  for (const { key } of FIELDS) {
    const raw = body[key]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value.length > MAX_FIELD_LENGTH) {
      return Response.json(
        { error: 'One of your answers is too long.' },
        { status: 400 }
      )
    }
    values[key] = value
  }

  // Every field on the form is required.
  const missing = FIELDS.filter(({ key }) => !values[key])
  if (missing.length > 0) {
    return Response.json(
      { error: `Please fill in: ${missing.map((f) => f.label).join(', ')}.` },
      { status: 400 }
    )
  }

  if (!isValidEmail(values.email)) {
    return Response.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    )
  }

  // A submitted interest form is the pipeline entry point. Field names here
  // must match the "GEF | Global Experts Fellowship" table exactly (see
  // docs/airtable-schema.md); Airtable rejects unknown fields outright.
  //
  // If Airtable fails, the email still goes out so no applicant is lost. The
  // failure is logged and flagged in the email so staff can add them by hand.
  const today = new Date().toISOString().slice(0, 10)
  let airtableError: string | null = null
  try {
    const existing = await findRecord<{ Email?: string; Notes?: string }>(
      Tables.GefPipeline,
      `LOWER({Email}) = LOWER('${escapeAirtableString(values.email)}')`,
      { fields: ['Email', 'Notes'] }
    )

    if (existing) {
      // Returning applicant (or a browser retry): note the resubmission on the
      // existing record instead of creating a second person.
      const previousNotes = existing.fields.Notes ?? ''
      await updateRecord(Tables.GefPipeline, existing.id, {
        'Last contact': today,
        Notes: `${previousNotes}${previousNotes ? '\n\n' : ''}Resubmitted the moxsf.com/gef interest form on ${today}.`,
      })
    } else {
      await createRecord(
        Tables.GefPipeline,
        {
          Name: values.name,
          Email: values.email,
          Country: values.country,
          'Focus area': values.focus,
          Background: values.background,
          'Proud of': values.proud,
          Intentions: values.intentions,
          Stage: 'Interest received',
          'First contact': today,
          'Last contact': today,
          Notes: 'Interest submitted via moxsf.com/gef.',
        },
        { typecast: true }
      )
    }
  } catch (error) {
    console.error('[GEF] Error saving website interest to the GEF pipeline:', error)
    airtableError = error instanceof Error ? error.message : String(error)
  }

  const airtableWarning = airtableError
    ? `NOT SAVED TO AIRTABLE - please add this person to the GEF pipeline by hand. Error: ${airtableError}`
    : ''

  const text =
    (airtableWarning ? `${airtableWarning}\n\n` : '') +
    FIELDS.map(({ key, label }) => `${label}:\n${values[key]}`).join('\n\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">New Global Expert Fellowship interest</h2>
      <p style="color: #666; margin-top: 0;">Submitted via moxsf.com/gef</p>
      ${
        airtableWarning
          ? `<p style="color: #b00020; font-weight: 600;">${escapeHtml(airtableWarning)}</p>`
          : ''
      }
      ${FIELDS.map(
        ({ key, label }) => `
        <div style="margin: 16px 0;">
          <div style="font-weight: 600; color: #111;">${escapeHtml(label)}</div>
          <div style="white-space: pre-wrap;">${escapeHtml(values[key])}</div>
        </div>`
      ).join('')}
    </div>`

  let sent = false
  try {
    sent = await sendEmail({
      to: RECIPIENTS,
      from: 'Mox GEF <portal@account.moxsf.com>',
      replyTo: values.email,
      subject: `${airtableError ? '[NOT IN AIRTABLE] ' : ''}GEF interest: ${values.name}`,
      text,
      html,
    })
  } catch (error) {
    console.error('[GEF] Error sending interest email:', error)
  }

  if (!sent) {
    return Response.json(
      { error: 'Something went wrong sending your form. Please try again.' },
      { status: 502 }
    )
  }

  return Response.json({ success: true })
}
