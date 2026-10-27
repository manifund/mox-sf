import { findRecords, Tables, escapeAirtableString } from '@/app/lib/airtable'

export const REQUEST_FORM_URL =
  'https://airtable.com/appkHZ2UvU6SouT5y/pagh2wfAVD2lItviY/form'

interface OperationsRequestFields {
  'Your Email'?: string
  'Request Details'?: string
  'Request Category'?: string[]
  Status?: string
}

export interface OperationsRequest {
  id: string
  summary: string
  categories: string[]
  status: string
  submittedAt: string | null
}

// Request Details is a rich text field (markdown). Keep the first line as
// plain text so it fits in a table cell.
function summarize(details: string | undefined): string {
  if (!details) return '(no details)'
  const firstLine =
    details
      .split('\n')
      .map((l) => l.replace(/[*_`#>~]|\[|\]\([^)]*\)/g, '').trim())
      .find(Boolean) || '(no details)'
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

export async function fetchUserRequests(
  email: string
): Promise<OperationsRequest[]> {
  if (!email) return []
  const formula = `LOWER({Your Email}) = '${escapeAirtableString(email.toLowerCase())}'`
  try {
    const records = await findRecords<OperationsRequestFields>(
      Tables.OperationsRequests,
      formula
    )
    return records
      .map((record) => ({
        id: record.id,
        summary: summarize(record.fields['Request Details']),
        categories: record.fields['Request Category'] || [],
        status: record.fields.Status || 'New',
        submittedAt: record.createdTime || null,
      }))
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
  } catch (error) {
    console.error('Error fetching operations requests:', error)
    return []
  }
}

// Prefill name and email so new requests match this member's table.
export function requestFormUrl(name: string, email: string): string {
  const params = new URLSearchParams()
  if (name) params.set('prefill_Name (first and last)', name)
  if (email) params.set('prefill_Your Email', email)
  const query = params.toString()
  return query ? `${REQUEST_FORM_URL}?${query}` : REQUEST_FORM_URL
}
