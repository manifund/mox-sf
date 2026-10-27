import { NextRequest, NextResponse } from 'next/server'
import { getClaimer } from '@/app/lib/tasks-auth'
import { notifyTaskCreator, taskUrl } from '@/app/lib/tasks-notify'
import {
  getTask,
  listTasks,
  logTaskEvent,
  RELEASE_HOURS,
  updateTask,
} from '@/app/lib/tasks'

const MAX_ACTIVE_CLAIMS = 3

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const claimer = await getClaimer()
  if (!claimer)
    return NextResponse.json(
      { error: 'Sign in to claim a task.' },
      { status: 401 }
    )

  const { id } = await params
  const task = await getTask(id)
  if (!task)
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  if (task.status !== 'Open') {
    return NextResponse.json(
      { error: 'Someone beat you to it — this task was just claimed.' },
      { status: 409 }
    )
  }

  const active = (await listTasks()).filter(
    (t) => t.status === 'Claimed' && t.claimantEmail === claimer.email
  )
  if (active.length >= MAX_ACTIVE_CLAIMS) {
    return NextResponse.json(
      {
        error: `You already have ${MAX_ACTIVE_CLAIMS} tasks in progress — finish or release one first.`,
      },
      { status: 409 }
    )
  }

  await updateTask(id, {
    Status: 'Claimed',
    'Claimant name': claimer.name,
    'Claimant email': claimer.email,
    'Claimed at': new Date().toISOString(),
    'Nudged at': null,
  })
  await logTaskEvent({
    taskId: id,
    taskTitle: task.title,
    name: claimer.name,
    email: claimer.email,
    type: 'Claimed',
  })
  await notifyTaskCreator(
    task,
    claimer.email,
    `${claimer.name} claimed “${task.title}”`,
    `<p><strong>${claimer.name}</strong> just claimed your task <a href="${taskUrl(task)}" style="color:#78350f">${task.title}</a> — that means they're on it today. It auto-releases after ${RELEASE_HOURS}h if it isn't finished.</p>`,
    `${claimer.name} just claimed your task "${task.title}" — they're on it today. ${taskUrl(task)}`
  )

  return NextResponse.json({ ok: true })
}
