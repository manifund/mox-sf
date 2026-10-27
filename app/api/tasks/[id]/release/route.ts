import { NextRequest, NextResponse } from 'next/server'
import { getClaimer } from '@/app/lib/tasks-auth'
import { notifyTaskCreator, taskUrl } from '@/app/lib/tasks-notify'
import { getTask, logTaskEvent, updateTask } from '@/app/lib/tasks'

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

  await updateTask(id, {
    Status: 'Open',
    'Claimant name': null,
    'Claimant email': null,
    'Claimed at': null,
    'Nudged at': null,
  })
  await logTaskEvent({
    taskId: id,
    taskTitle: task.title,
    name: claimer.name,
    email: claimer.email,
    type: 'Released',
  })
  await notifyTaskCreator(
    task,
    claimer.email,
    `“${task.title}” is back on the board`,
    `<p><strong>${claimer.name}</strong> released <a href="${taskUrl(task)}" style="color:#78350f">${task.title}</a> — it's open again for someone else to claim.</p>`,
    `${claimer.name} released "${task.title}" — it's open again. ${taskUrl(task)}`
  )

  return NextResponse.json({ ok: true })
}
