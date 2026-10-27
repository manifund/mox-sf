import { NextRequest, NextResponse } from 'next/server'
import { getTaskActor, isOrganizer } from '@/app/lib/tasks-auth'
import {
  createTask,
  PRIORITIES,
  REPEATS,
  TASK_TYPES,
  updateTask,
  uploadTaskImage,
} from '@/app/lib/tasks'

const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const MAX_PHOTOS = 4

// Organizer-only: add a task to the board. Organizer = Mox staff (member
// session) or an allowlisted claimer email — never Google alone.
export async function POST(request: NextRequest) {
  if (!(await isOrganizer())) {
    return NextResponse.json(
      { error: 'Only the Mox team can add tasks.' },
      { status: 403 }
    )
  }

  const form = await request.formData()
  const title = String(form.get('title') || '').trim()
  if (!title)
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  const str = (k: string) => String(form.get(k) || '').trim()
  const skills = form.getAll('skills').map(String).filter(Boolean)

  const fields: Record<string, unknown> = { Title: title, Status: 'Open' }
  if (str('summary')) fields['Summary'] = str('summary')
  if (str('brief')) fields['Brief'] = str('brief')
  if (str('doneCriteria')) fields['Done criteria'] = str('doneCriteria')
  if (str('contextLinks')) fields['Context links'] = str('contextLinks')
  if (str('floor')) fields['Floor'] = str('floor')
  if (str('effort')) fields['Effort'] = str('effort')
  if (skills.length) fields['Skills'] = skills
  if ((REPEATS as readonly string[]).includes(str('repeat')))
    fields['Repeat'] = str('repeat')
  if ((PRIORITIES as readonly string[]).includes(str('priority')))
    fields['Priority'] = str('priority')
  // Which board tab(s) it shows under (multi-select; empty counts as Volunteer).
  const types = form
    .getAll('types')
    .map(String)
    .filter((t) => (TASK_TYPES as readonly string[]).includes(t))
  if (types.length) fields['Task type'] = types

  // Record who posted it — they get notifications and edit rights.
  const actor = await getTaskActor()
  if (actor) {
    fields['Created by name'] = actor.name
    fields['Created by email'] = actor.email
  }

  const mp = str('mapPoint')
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(mp)) fields['Map point'] = mp

  const id = await createTask(fields)

  const photos = form
    .getAll('photos')
    .filter((p): p is File => p instanceof File && p.size > 0)
  const urls: { url: string }[] = []
  for (const photo of photos.slice(0, MAX_PHOTOS)) {
    if (photo.size > MAX_PHOTO_BYTES || !photo.type.startsWith('image/'))
      continue
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64')
    const url = await uploadTaskImage(base64)
    if (url) urls.push({ url })
  }
  if (urls.length) {
    await updateTask(id, { 'Reference photos': urls })
  }

  return NextResponse.json({ ok: true, id })
}
