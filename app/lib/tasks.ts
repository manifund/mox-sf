/**
 * Data layer for the public task board (app/tasks, served at tasks.moxsf.com).
 *
 * Built on the shared Airtable helpers. Two tables in the dedicated task-board
 * base (env.TASKS_AIRTABLE_BASE_ID, the "Mox ᴛᴀꜱᴋꜱ" base — NOT the main Mox
 * base):
 *   - Tasks  — one row per task; rows with Status "Open" show publicly.
 *   - Claims — append-only activity log (claims/completions/releases…).
 *
 * Note on the map: the pin uses app/lib/tasks-floorplans.ts (a snapshot of the
 * internal room-map service with real room polygons). The repo's own Floors
 * table only has static SVG images with no room coordinates, so it can't drive
 * clickable pins — hence the dedicated snapshot.
 */
import {
  createRecord,
  deleteRecord,
  getRecord,
  getRecords,
  Tables,
  updateRecord,
} from './airtable'
import { env } from './env'
import { storyForFloor } from './tasks-floorplans'

export { storyForFloor }

export const SKILLS = [
  'Space & setup',
  'Errand',
  'Design',
  'Writing',
  'Tech',
  'Events',
  'Ops & admin',
] as const

export const EFFORTS = ['< 1h', '1–2h', '2–3h'] as const
// Which board tab(s) a task shows under. The Airtable field is a
// multi-select — a task can be for volunteers, contractors, or both; tasks
// with no type count as Volunteer.
export const TASK_TYPES = ['Volunteer', 'Contractor'] as const
export type TaskType = (typeof TASK_TYPES)[number]
export const FLOORS = [
  '1st floor',
  '2nd floor',
  '3rd floor',
  '4th floor',
  'Rooftop',
] as const

export const NUDGE_HOURS = Number(env.TASKS_NUDGE_HOURS) || 8
export const RELEASE_HOURS = Number(env.TASKS_RELEASE_HOURS) || 24

// Urgency levels; unset counts as Medium. Lower rank = more urgent.
export const PRIORITIES = ['Low', 'Medium', 'High'] as const
export const PRIORITY_RANK: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
}

export function priorityOf(task: { priority: string }): string {
  return PRIORITY_RANK[task.priority] !== undefined ? task.priority : 'Medium'
}

// Periodic tasks: how long after completion a repeating task reopens.
export const REPEATS = ['Weekly', 'Monthly'] as const
export const REPEAT_DAYS: Record<string, number> = { Weekly: 7, Monthly: 30 }

export type TaskStatus = 'Open' | 'Claimed' | 'In review' | 'Done' | 'Archived'
export type TaskEventType =
  | 'Claimed'
  | 'Completed'
  | 'Released'
  | 'Auto-released'
  | 'Approved'
  | 'Reopened'

export interface ContextLink {
  label: string
  url: string
}

export interface TaskPhoto {
  /** Airtable attachment id — needed to keep an existing photo on edit. */
  id: string
  url: string
  thumbUrl: string
  filename: string
}

// Raw Airtable field shape (by name) for the Tasks table.
interface TaskFields {
  Title?: string
  Summary?: string
  Brief?: string
  'Done criteria'?: string
  'Context links'?: string
  Skills?: string[]
  Effort?: string
  Status?: TaskStatus
  Floor?: string
  'Map point'?: string
  'Task type'?: string[]
  'Claimant name'?: string
  'Claimant email'?: string
  'Claimed at'?: string
  'Nudged at'?: string
  'Completed at'?: string
  'Completion note'?: string
  'Proof photo'?: AirtableAttachment[]
  'Reference photos'?: AirtableAttachment[]
  'Discord message ID'?: string
  Priority?: string
  'Created by name'?: string
  'Created by email'?: string
  Repeat?: string
}

interface AirtableAttachment {
  id?: string
  url: string
  filename?: string
  thumbnails?: { large?: { url: string } }
}

export interface Task {
  id: string
  title: string
  summary: string
  brief: string
  doneCriteria: string
  contextLinks: ContextLink[]
  skills: string[]
  effort: string
  status: TaskStatus
  floor: string
  mapPoint: { x: number; y: number } | null
  taskTypes: TaskType[]
  claimantName: string
  claimantEmail: string
  claimedAt: string | null
  nudgedAt: string | null
  completedAt: string | null
  completionNote: string
  hasProofPhoto: boolean
  refPhotos: TaskPhoto[]
  discordMessageId: string
  priority: string
  createdByName: string
  createdByEmail: string
  repeat: string
}

function parseTaskTypes(raw?: string[]): TaskType[] {
  const types = (raw ?? []).filter((t): t is TaskType =>
    (TASK_TYPES as readonly string[]).includes(t)
  )
  return types.length > 0 ? types : ['Volunteer']
}

function parseContextLinks(raw: string): ContextLink[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split('|').map((s) => s.trim())
      return b ? { label: a, url: b } : { label: a, url: a }
    })
    .filter((l) => l.url.startsWith('http'))
}

function parseMapPoint(raw?: string): { x: number; y: number } | null {
  if (!raw) return null
  const [x, y] = raw.split(',').map((s) => Number(s.trim()))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function parsePhotos(atts?: AirtableAttachment[]): TaskPhoto[] {
  return (atts ?? []).map((a) => ({
    id: a.id ?? '',
    url: a.url,
    thumbUrl: a.thumbnails?.large?.url ?? a.url,
    filename: a.filename ?? 'photo',
  }))
}

function toTask(rec: { id: string; fields: TaskFields }): Task {
  const f = rec.fields
  return {
    id: rec.id,
    title: f.Title ?? '',
    summary: f.Summary ?? '',
    brief: f.Brief ?? '',
    doneCriteria: f['Done criteria'] ?? '',
    contextLinks: parseContextLinks(f['Context links'] ?? ''),
    skills: f.Skills ?? [],
    effort: f.Effort ?? '',
    status: (f.Status ?? 'Open') as TaskStatus,
    floor: f.Floor ?? '',
    mapPoint: parseMapPoint(f['Map point']),
    taskTypes: parseTaskTypes(f['Task type']),
    claimantName: f['Claimant name'] ?? '',
    claimantEmail: f['Claimant email'] ?? '',
    claimedAt: f['Claimed at'] ?? null,
    nudgedAt: f['Nudged at'] ?? null,
    completedAt: f['Completed at'] ?? null,
    completionNote: f['Completion note'] ?? '',
    hasProofPhoto: (f['Proof photo']?.length ?? 0) > 0,
    refPhotos: parsePhotos(f['Reference photos']),
    discordMessageId: f['Discord message ID'] ?? '',
    priority: f.Priority ?? '',
    createdByName: f['Created by name'] ?? '',
    createdByEmail: f['Created by email'] ?? '',
    repeat: f.Repeat ?? '',
  }
}

export async function listTasks(): Promise<Task[]> {
  const records = await getRecords<TaskFields>(Tables.Tasks, {
    maxRecords: 500,
  })
  return records.map(toTask)
}

export async function getTask(id: string): Promise<Task | null> {
  const rec = await getRecord<TaskFields>(Tables.Tasks, id)
  return rec ? toTask(rec) : null
}

// Writes accept a loose record so callers can pass `null` to clear a field
// (e.g. resetting claimant details on release), which Airtable requires.
export async function createTask(
  fields: Record<string, unknown>
): Promise<string> {
  const rec = await createRecord<TaskFields>(
    Tables.Tasks,
    fields as Partial<TaskFields>,
    {
      typecast: true,
    }
  )
  return rec.id
}

export async function updateTask(
  id: string,
  fields: Record<string, unknown>
): Promise<Task> {
  const rec = await updateRecord<TaskFields>(
    Tables.Tasks,
    id,
    fields as Partial<TaskFields>,
    {
      typecast: true,
    }
  )
  return toTask(rec)
}

export async function deleteTask(id: string): Promise<boolean> {
  return deleteRecord(Tables.Tasks, id)
}

// --- activity log -----------------------------------------------------------

interface TaskClaimFields {
  Event?: string
  Task?: string[]
  Name?: string
  Email?: string
  Type?: TaskEventType
  At?: string
  Note?: string
}

const EVENT_VERB: Record<TaskEventType, string> = {
  Claimed: 'claimed',
  Completed: 'completed',
  Released: 'released',
  'Auto-released': 'was auto-released from',
  Approved: 'approved',
  Reopened: 'reopened',
}

export async function logTaskEvent(opts: {
  taskId: string
  taskTitle: string
  name: string
  email?: string
  type: TaskEventType
  note?: string
}): Promise<void> {
  await createRecord<TaskClaimFields>(
    Tables.TaskClaims,
    {
      Event: `${opts.name || opts.email} ${EVENT_VERB[opts.type]}: ${opts.taskTitle}`,
      Task: [opts.taskId],
      Name: opts.name,
      ...(opts.email ? { Email: opts.email } : {}),
      Type: opts.type,
      At: new Date().toISOString(),
      ...(opts.note ? { Note: opts.note } : {}),
    },
    { typecast: true }
  )
}

export interface TaskEvent {
  name: string
  email: string
  type: TaskEventType
  at: string
  summary: string
}

export async function listRecentTaskEvents(
  hours: number
): Promise<TaskEvent[]> {
  const since = Date.now() - hours * 3600_000
  const records = await getRecords<TaskClaimFields>(Tables.TaskClaims, {
    sort: [{ field: 'At', direction: 'desc' }],
    maxRecords: 200,
  })
  const events: TaskEvent[] = []
  for (const rec of records) {
    const at = rec.fields.At ? Date.parse(rec.fields.At) : 0
    if (at < since) break
    events.push({
      name: rec.fields.Name ?? '',
      email: rec.fields.Email ?? '',
      type: rec.fields.Type ?? 'Claimed',
      at: rec.fields.At ?? '',
      summary: rec.fields.Event ?? '',
    })
  }
  return events
}

// --- comments ---------------------------------------------------------------

// Task Comments table: conversation threads on task pages (claimers asking
// questions, creators clarifying). 'Task rec id' stores the plain record id of
// the linked task so the thread can be filtered by formula (linked fields
// render as names in formulas).
interface TaskCommentFields {
  Name?: string
  Task?: string[]
  'Author name'?: string
  'Author email'?: string
  Comment?: string
  At?: string
  'Task rec id'?: string
}

export interface TaskComment {
  id: string
  authorName: string
  authorEmail: string
  text: string
  at: string
}

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const records = await getRecords<TaskCommentFields>(Tables.TaskComments, {
    filterByFormula: `{Task rec id} = '${taskId}'`,
    sort: [{ field: 'At', direction: 'asc' }],
    maxRecords: 200,
  })
  return records.map((rec) => ({
    id: rec.id,
    authorName: rec.fields['Author name'] ?? '',
    authorEmail: rec.fields['Author email'] ?? '',
    text: rec.fields.Comment ?? '',
    at: rec.fields.At ?? '',
  }))
}

export async function addTaskComment(opts: {
  taskId: string
  taskTitle: string
  authorName: string
  authorEmail: string
  text: string
}): Promise<void> {
  await createRecord<TaskCommentFields>(
    Tables.TaskComments,
    {
      Name: `${opts.authorName.split(' ')[0] || opts.authorEmail} on: ${opts.taskTitle}`,
      Task: [opts.taskId],
      'Author name': opts.authorName,
      'Author email': opts.authorEmail,
      Comment: opts.text,
      At: new Date().toISOString(),
      'Task rec id': opts.taskId,
    },
    { typecast: true }
  )
}

// --- attachments ------------------------------------------------------------

/**
 * Uploads an image to ImgBB and returns a hosted URL, matching how the rest of
 * the app writes Airtable attachment fields (upload to ImgBB, store the URL).
 * Returns null if IMGBB_API_KEY is unset or the upload fails.
 */
export async function uploadTaskImage(base64: string): Promise<string | null> {
  const key = env.IMGBB_API_KEY
  if (!key) return null
  try {
    const body = new URLSearchParams({ image: base64 })
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
      method: 'POST',
      body,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.url ?? null
  } catch {
    return null
  }
}

export function airtableTaskUrl(taskId: string): string {
  return `https://airtable.com/${env.TASKS_AIRTABLE_BASE_ID}/${Tables.Tasks}/${taskId}`
}
