import { NextRequest, NextResponse } from 'next/server'
import { sendChannelMessage } from '@/app/lib/discord'
import { DISCORD_CHANNELS } from '@/app/lib/discord-constants'
import { sendEmail } from '@/app/lib/email'
import { env } from '@/app/lib/env'
import { addTaskComment, getTask, listTaskComments } from '@/app/lib/tasks'
import { getTaskActor } from '@/app/lib/tasks-auth'
import { taskEmailShell, TASKS_FROM } from '@/app/lib/tasks-notify'

const MAX_COMMENT_CHARS = 2000

// Post a comment on a task. Any signed-in visitor (Google claimer or staff
// member) can join the conversation; everyone already in the thread — the
// creator, the claimant, and earlier commenters — is emailed, minus the poster.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getTaskActor()
  if (!actor) {
    return NextResponse.json(
      { error: 'Sign in to join the conversation.' },
      { status: 401 }
    )
  }

  const { id } = await params
  const task = await getTask(id)
  if (!task || task.status === 'Archived') {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const text = String(body.text || '').trim()
  if (!text) {
    return NextResponse.json(
      { error: 'Write something first.' },
      { status: 400 }
    )
  }
  if (text.length > MAX_COMMENT_CHARS) {
    return NextResponse.json(
      { error: 'Keep comments under 2000 characters.' },
      { status: 400 }
    )
  }

  const priorComments = await listTaskComments(id)
  await addTaskComment({
    taskId: id,
    taskTitle: task.title,
    authorName: actor.name,
    authorEmail: actor.email,
    text,
  })

  const taskUrl = `${env.TASKS_BASE_URL}/tasks/${id}`
  const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text
  await sendChannelMessage(
    DISCORD_CHANNELS.TASKS,
    `💬 **${actor.name}** on **${task.title}**: “${preview.replace(/\n/g, ' ')}”\n<${taskUrl}>`
  )

  // Email everyone in the thread (creator + claimant + earlier commenters),
  // minus the poster.
  const participants = new Set<string>()
  if (task.createdByEmail) participants.add(task.createdByEmail.toLowerCase())
  if (task.claimantEmail) participants.add(task.claimantEmail.toLowerCase())
  for (const c of priorComments)
    if (c.authorEmail) participants.add(c.authorEmail.toLowerCase())
  participants.delete(actor.email.toLowerCase())
  if (participants.size > 0) {
    await sendEmail({
      to: [...participants],
      from: TASKS_FROM,
      subject: `New comment on “${task.title}”`,
      text: `${actor.name} wrote on "${task.title}": ${text}\n\nReply on the task page: ${taskUrl}`,
      html: taskEmailShell(
        `<p><strong>${actor.name}</strong> wrote on <a href="${taskUrl}" style="color:#78350f">${task.title}</a>:</p>
         <p style="border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">${text.replace(/\n/g, '<br>')}</p>
         <p><a href="${taskUrl}" style="color:#78350f;font-weight:600">Reply on the task page</a></p>`
      ),
    })
  }

  return NextResponse.json({ ok: true })
}
