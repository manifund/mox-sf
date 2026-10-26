import { env } from './env'

const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

// Table names as constants to avoid typos
export const Tables = {
  People: 'People',
  Events: 'Events',
  Orgs: 'Orgs',
  Programs: 'Programs',
  DayPasses: 'Day Passes',
  Rooms: 'Rooms',
  RoomBookings: 'Room Bookings',
  Floors: 'Floors',
  Staff: 'tblbmm9NRs5ANd6IV',
  // Door-presence records written by the sync-checkins cron (NOT the same as
  // "Check-ins", which is the staff 1:1 conversation tracker).
  Attendance: 'Attendance',
  CheckIns: 'Check-ins',
  // The live admissions pipeline. Website interest starts here — not in a
  // separate intake table.
  GefPipeline: 'GEF | Global Experts Fellowship',
  // Legacy standalone intake table; retained only for historical reads.
  GefApplications: 'GEF Applications',
  Roles: 'Roles',
  // Filled by the moxsf.com/request Airtable form; shown in the portal.
  OperationsRequests: 'tbl77SjSdonCzvVMr',
  // Public task board (app/tasks, served at tasks.moxsf.com). These live in
  // their own base (env.TASKS_AIRTABLE_BASE_ID), not the main Mox base.
  Tasks: 'Tasks',
  TaskClaims: 'Claims',
  TaskComments: 'Task Comments',
} as const

export type TableName = (typeof Tables)[keyof typeof Tables]

// Tables that live in the dedicated task-board base rather than the main base.
const TASKS_BASE_TABLES: readonly TableName[] = [
  Tables.Tasks,
  Tables.TaskClaims,
  Tables.TaskComments,
]

function baseIdFor(table: TableName): string {
  return TASKS_BASE_TABLES.includes(table)
    ? env.TASKS_AIRTABLE_BASE_ID
    : env.AIRTABLE_BASE_ID
}

// Generic type for Airtable records - use Record<string, unknown> for flexibility
export interface AirtableRecord<T = Record<string, unknown>> {
  id: string
  fields: T
  createdTime?: string
}

/**
 * Query options for select operations
 */
export interface QueryOptions {
  filterByFormula?: string
  fields?: string[]
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>
  maxRecords?: number
  view?: string
  /**
   * Seconds to cache the response in Next's data cache. Omit/0 = no cache.
   * Use for read-mostly tables on public pages.
   */
  revalidate?: number
}

// Common headers for all requests. The task-board tables can use their own
// token (TASKS_AIRTABLE_API_KEY) when the main key has no access to that base.
function getHeaders(table: TableName): HeadersInit {
  const key = TASKS_BASE_TABLES.includes(table)
    ? env.TASKS_AIRTABLE_API_KEY || env.AIRTABLE_API_KEY
    : env.AIRTABLE_API_KEY
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

// Build URL with query params for list operations
function buildListUrl(
  table: TableName,
  options: QueryOptions,
  offset?: string
): string {
  const base = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}`
  const params: string[] = []

  if (options.filterByFormula) {
    params.push(
      `filterByFormula=${encodeURIComponent(options.filterByFormula)}`
    )
  }
  if (options.maxRecords) {
    params.push(`maxRecords=${options.maxRecords}`)
  }
  if (options.view) {
    params.push(`view=${encodeURIComponent(options.view)}`)
  }
  if (offset) {
    params.push(`offset=${offset}`)
  }

  // Handle fields[] array parameter
  if (options.fields) {
    for (const field of options.fields) {
      params.push(`fields%5B%5D=${encodeURIComponent(field)}`)
    }
  }

  // Handle sort[] array parameter
  if (options.sort) {
    options.sort.forEach((s, i) => {
      params.push(`sort%5B${i}%5D%5Bfield%5D=${encodeURIComponent(s.field)}`)
      if (s.direction) {
        params.push(`sort%5B${i}%5D%5Bdirection%5D=${s.direction}`)
      }
    })
  }

  return params.length > 0 ? `${base}?${params.join('&')}` : base
}

export async function getRecords<T = Record<string, unknown>>(
  table: TableName,
  options: QueryOptions = {}
): Promise<AirtableRecord<T>[]> {
  const records: AirtableRecord<T>[] = []
  let offset: string | undefined

  do {
    const url = buildListUrl(table, options, offset)

    const res = await fetch(url, {
      headers: getHeaders(table),
      ...(options.revalidate
        ? { next: { revalidate: options.revalidate } }
        : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(
        `Airtable API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
      )
    }

    const data = await res.json()

    for (const record of data.records || []) {
      records.push({
        id: record.id,
        fields: record.fields as T,
        createdTime: record.createdTime,
      })
    }

    offset = data.offset

    // Stop if we've reached maxRecords
    if (options.maxRecords && records.length >= options.maxRecords) {
      break
    }
  } while (offset)

  return records
}

/**
 * Fetches a single record by ID.
 *
 * @param table - Table name
 * @param recordId - Airtable record ID
 * @returns The record or null if not found
 */
export async function getRecord<T = Record<string, unknown>>(
  table: TableName,
  recordId: string
): Promise<AirtableRecord<T> | null> {
  try {
    const url = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}/${recordId}`

    const res = await fetch(url, {
      headers: getHeaders(table),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      if (res.status === 404) {
        return null
      }
      const errorData = await res.json().catch(() => ({}))
      console.error(
        `Error fetching record ${recordId} from ${table}:`,
        errorData
      )
      return null
    }

    const data = await res.json()
    return {
      id: data.id,
      fields: data.fields as T,
    }
  } catch (error) {
    console.error(`Error fetching record ${recordId} from ${table}:`, error)
    return null
  }
}

/**
 * Updates a record. This operation is NOT cached.
 *
 * @param table - Table name
 * @param recordId - Airtable record ID
 * @param fields - Fields to update
 * @returns The updated record
 */
export async function updateRecord<T = Record<string, unknown>>(
  table: TableName,
  recordId: string,
  fields: Partial<T>,
  options: { typecast?: boolean } = {}
): Promise<AirtableRecord<T>> {
  const url = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}/${recordId}`

  const res = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(table),
    body: JSON.stringify({
      fields,
      ...(options.typecast ? { typecast: true } : {}),
    }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Airtable update error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await res.json()
  return {
    id: data.id,
    fields: data.fields as T,
  }
}

/**
 * Creates a new record. This operation is NOT cached.
 *
 * @param table - Table name
 * @param fields - Fields for the new record
 * @returns The created record
 */
export async function createRecord<T = Record<string, unknown>>(
  table: TableName,
  fields: Partial<T>,
  options: { typecast?: boolean } = {}
): Promise<AirtableRecord<T>> {
  const url = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(table),
    body: JSON.stringify({
      fields,
      ...(options.typecast ? { typecast: true } : {}),
    }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Airtable create error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await res.json()
  return {
    id: data.id,
    fields: data.fields as T,
  }
}

/**
 * Creates multiple records, batching 10 per request (the Airtable API limit).
 * This operation is NOT cached.
 *
 * @param table - Table name
 * @param records - Field sets for the new records
 * @returns The created records, in input order
 */
export async function createRecords<T = Record<string, unknown>>(
  table: TableName,
  records: Partial<T>[],
  options: { typecast?: boolean } = {}
): Promise<AirtableRecord<T>[]> {
  const url = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}`
  const created: AirtableRecord<T>[] = []

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10)
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(table),
      body: JSON.stringify({
        records: batch.map((fields) => ({ fields })),
        ...(options.typecast ? { typecast: true } : {}),
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(
        `Airtable create error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
      )
    }

    const data = await res.json()
    for (const record of data.records || []) {
      created.push({ id: record.id, fields: record.fields as T })
    }
  }

  return created
}

/**
 * Finds records matching a filter formula.
 * Convenience wrapper around getRecords for simple queries.
 *
 * @param table - Table name
 * @param filterByFormula - Airtable formula
 * @param options - Additional query options
 * @returns Array of matching records
 */
export async function findRecords<T = Record<string, unknown>>(
  table: TableName,
  filterByFormula: string,
  options: Omit<QueryOptions, 'filterByFormula'> = {}
): Promise<AirtableRecord<T>[]> {
  return getRecords<T>(table, { ...options, filterByFormula })
}

/**
 * Finds a single record matching a filter formula.
 *
 * @param table - Table name
 * @param filterByFormula - Airtable formula
 * @param options - Additional query options
 * @returns The first matching record or null
 */
export async function findRecord<T = Record<string, unknown>>(
  table: TableName,
  filterByFormula: string,
  options: Omit<QueryOptions, 'filterByFormula'> = {}
): Promise<AirtableRecord<T> | null> {
  const records = await findRecords<T>(table, filterByFormula, {
    ...options,
    maxRecords: 1,
  })
  return records[0] || null
}

/**
 * Deletes a record by ID.
 *
 * @param table - Table name
 * @param recordId - Airtable record ID
 * @returns true if deleted, false if not found
 */
export async function deleteRecord(
  table: TableName,
  recordId: string
): Promise<boolean> {
  const url = `${AIRTABLE_API_URL}/${baseIdFor(table)}/${encodeURIComponent(table)}/${recordId}`

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(table),
  })

  if (!res.ok) {
    if (res.status === 404) {
      return false
    }
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Airtable delete error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  return true
}

// Re-export the escape helper for use in formulas
export { escapeAirtableString } from './airtable-helpers'
