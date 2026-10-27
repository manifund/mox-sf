import { NextRequest, NextResponse } from 'next/server'
import { sendChannelMessage } from '@/app/lib/discord'
import { DISCORD_CHANNELS } from '@/app/lib/discord-constants'
import { getClaimer } from '@/app/lib/tasks-auth'
import { notifyTaskCreator, taskUrl } from '@/app/lib/tasks-notify'
import {
  airtableTaskUrl,
  getTask,
  logTaskEvent,
  updateTask,
  uploadTaskImage,
} from '@/app/lib/tasks'

const MAX_PHOTO_BYTES = 4 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const claimer = await getClaimer()
  if (!claimer)
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const { id } = await params
  const task = await getTask(id)
  if (!task)
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (task.status !== 'Claimed' || task.claimantEmail !== claimer.email) {
    return NextResponse.json(
      { error: "This task isn't claimed by you." },
      { status: 403 }
    )
  }

  const form = await request.formData()
  const note = String(form.get('note') || '').trim()
  const photo = form.get('photo')

  let photoUrl: string | null = null
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: 'Photo too large — keep it under 4 MB.' },
        { status: 413 }
      )
    }
    if (!photo.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are accepted as proof.' },
        { status: 415 }
      )
    }
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64')
    photoUrl = await uploadTaskImage(base64)
  }

  // Every completion waits for organizer review (✅ on Discord); a photo is
  // attached as proof but never auto-closes the task.
  const hasPhoto = !!photoUrl
  await updateTask(id, {
    Status: 'In review',
    'Completed at': new Date().toISOString(),
    ...(note ? { 'Completion note': note } : {}),
    ...(photoUrl ? { 'Proof photo': [{ url: photoUrl }] } : {}),
  })

  await logTaskEvent({
    taskId: id,
    taskTitle: task.title,
    name: claimer.name,
    email: claimer.email,
    type: 'Completed',
    note,
  })

  const noteLine = note ? `\n> ${note.replace(/\n/g, ' ')}` : ''
  const photoNote = hasPhoto ? ' (proof photo attached)' : ''
  const result = await sendChannelMessage(
    DISCORD_CHANNELS.TASKS,
    `🔎 **${claimer.name}** marked **${task.title}** as done${photoNote} — react with ✅ to approve & close it.${noteLine}\n<${airtableTaskUrl(id)}>`
  )
  if (result.messageId)
    await updateTask(id, { 'Discord message ID': result.messageId })

  const noteHtml = note ? `<p>Their note: “${note}”</p>` : ''
  await notifyTaskCreator(
    task,
    claimer.email,
    `“${task.title}” needs your review`,
    `<p><strong>${claimer.name}</strong> marked <a href="${taskUrl(task)}" style="color:#78350f">${task.title}</a> as done${hasPhoto ? ' and attached a proof photo' : ''}. React with ✅ on the Discord message (or flip it in Airtable) to approve & close it.</p>${noteHtml}`,
    `${claimer.name} marked "${task.title}" as done${hasPhoto ? ' with a proof photo' : ''} — react ✅ on Discord to approve. ${taskUrl(task)}`
  )

  return NextResponse.json({ ok: true, status: 'In review' })
}
