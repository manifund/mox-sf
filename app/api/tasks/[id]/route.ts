import { NextRequest, NextResponse } from 'next/server'
import { canManageTask, getTaskActor } from '@/app/lib/tasks-auth'
import {
  getTask,
  logTaskEvent,
  PRIORITIES,
  REPEATS,
  TASK_TYPES,
  updateTask,
  uploadTaskImage,
} from '@/app/lib/tasks'

const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const MAX_PHOTOS = 4

/** Edit a task. Allowed for organizers and the task's creator (mox-sf#100). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const task = await getTask(id)
  if (!task)
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (!(await canManageTask(task.createdByEmail))) {
    return NextResponse.json(
      { error: 'Only the Mox team or the task creator can edit this task.' },
      { status: 403 }
    )
  }

  const form = await request.formData()
  const title = String(form.get('title') || '').trim()
  if (!title)
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  const str = (k: string) => String(form.get(k) || '').trim()
  const skills = form.getAll('skills').map(String).filter(Boolean)
  const repeat = str('repeat')
  const mp = str('mapPoint')

  const fields: Record<string, unknown> = {
    Title: title,
    Summary: str('summary') || null,
    Brief: str('brief') || null,
    'Done criteria': str('doneCriteria') || null,
    'Context links': str('contextLinks') || null,
    Floor: str('floor') || null,
    Effort: str('effort') || null,
    Skills: skills,
    Repeat: (REPEATS as readonly string[]).includes(repeat) ? repeat : null,
    Priority: (PRIORITIES as readonly string[]).includes(str('priority'))
      ? str('priority')
      : null,
    'Map point': /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(mp) ? mp : null,
  }
  // Which board tab(s) it shows under (multi-select; empty counts as Volunteer).
  fields['Task type'] = form
    .getAll('types')
    .map(String)
    .filter((t) => (TASK_TYPES as readonly string[]).includes(t))

  // Reference photos: keep the surviving originals (by attachment id, sent as
  // keepPhotoIds) and append any newly uploaded ones.
  const keepIds = new Set(form.getAll('keepPhotoIds').map(String))
  const kept = task.refPhotos
    .filter((p) => p.id && keepIds.has(p.id))
    .map((p) => ({ id: p.id }))
  const urls: ({ id: string } | { url: string })[] = [...kept]
  const photos = form
    .getAll('photos')
    .filter((p): p is File => p instanceof File && p.size > 0)
  for (const photo of photos.slice(0, Math.max(0, MAX_PHOTOS - kept.length))) {
    if (photo.size > MAX_PHOTO_BYTES || !photo.type.startsWith('image/'))
      continue
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64')
    const url = await uploadTaskImage(base64)
    if (url) urls.push({ url })
  }
  fields['Reference photos'] = urls

  await updateTask(id, fields)
  return NextResponse.json({ ok: true })
}

/** Archive a task (soft delete — it disappears from the board). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const task = await getTask(id)
  if (!task)
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (!(await canManageTask(task.createdByEmail))) {
    return NextResponse.json(
      { error: 'Only the Mox team or the task creator can archive this task.' },
      { status: 403 }
    )
  }

  const actor = await getTaskActor()
  await updateTask(id, { Status: 'Archived' })
  await logTaskEvent({
    taskId: id,
    taskTitle: task.title,
    name: actor?.name || 'Mox team',
    email: actor?.email,
    type: 'Released',
    note: 'Task archived',
  })
  return NextResponse.json({ ok: true })
}
