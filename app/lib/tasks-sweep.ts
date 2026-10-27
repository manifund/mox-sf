/**
 * Task board maintenance sweep, run by the tasks-sweep cron:
 *   1. ✅ approvals — close "In review" tasks whose Discord message got a ✅.
 *   2. Nudge — email claimers who've gone quiet past NUDGE_HOURS.
 *   3. Auto-release — return stale claims (past RELEASE_HOURS) to Open.
 *   4. Reopen — put completed Weekly/Monthly tasks back on the board.
 */
import { sendChannelMessage } from './discord'
import { DISCORD_CHANNELS } from './discord-constants'
import { sendEmail } from './email'
import { env } from './env'
import { notifyTaskCreator, TASKS_FROM, taskEmailShell } from './tasks-notify'
import {
  listTasks,
  logTaskEvent,
  NUDGE_HOURS,
  RELEASE_HOURS,
  REPEAT_DAYS,
  updateTask,
  type Task,
} from './tasks'

const BASE = env.TASKS_BASE_URL
const emailShell = taskEmailShell

async function hasCheckReaction(messageId: string): Promise<boolean> {
  const token = env.DISCORD_BOT_TOKEN
  if (!token) return false
  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNELS.TASKS}/messages/${messageId}`,
      { headers: { Authorization: `Bot ${token}` }, cache: 'no-store' }
    )
    if (!res.ok) return false
    const msg = await res.json()
    return (msg.reactions ?? []).some(
      (r: { emoji?: { name?: string } }) => r.emoji?.name === '✅'
    )
  } catch (err) {
    console.error('[tasks-sweep] reaction check failed:', err)
    return false
  }
}

/** Reopens completed Weekly/Monthly tasks once their interval has passed. */
async function processReopens(tasks: Task[]): Promise<string[]> {
  const reopened: string[] = []
  const now = Date.now()
  for (const task of tasks) {
    if (task.status !== 'Done' || !task.repeat || !task.completedAt) continue
    const days = REPEAT_DAYS[task.repeat]
    if (!days) continue
    if (now - Date.parse(task.completedAt) < days * 24 * 3600_000) continue

    await updateTask(task.id, {
      Status: 'Open',
      'Claimant name': null,
      'Claimant email': null,
      'Claimed at': null,
      'Nudged at': null,
      'Completed at': null,
      'Completion note': null,
      'Discord message ID': null,
    })
    await logTaskEvent({
      taskId: task.id,
      taskTitle: task.title,
      name: 'Mox board',
      type: 'Reopened',
      note: `${task.repeat} repeat`,
    })
    await sendChannelMessage(
      DISCORD_CHANNELS.TASKS,
      `🔁 **${task.title}** is due again (${task.repeat.toLowerCase()}) — back on the board.\n<${BASE}/tasks/${task.id}>`
    )
    reopened.push(task.title)
  }
  return reopened
}

async function processApprovals(tasks: Task[]): Promise<string[]> {
  const approved: string[] = []
  for (const task of tasks) {
    if (task.status !== 'In review' || !task.discordMessageId) continue
    if (!(await hasCheckReaction(task.discordMessageId))) continue
    await updateTask(task.id, { Status: 'Done' })
    await logTaskEvent({
      taskId: task.id,
      taskTitle: task.title,
      name: 'Mox team',
      type: 'Approved',
      note: 'Approved via ✅ reaction on Discord',
    })
    await sendChannelMessage(
      DISCORD_CHANNELS.TASKS,
      `🎉 **${task.title}** approved & closed. Thanks ${task.claimantName.split(' ')[0] || 'friend'}!`
    )
    approved.push(task.title)
  }
  return approved
}

export async function sweepTasks(): Promise<{
  approved: string[]
  nudged: string[]
  released: string[]
  reopened: string[]
}> {
  const tasks = await listTasks()
  const approved = await processApprovals(tasks)
  const reopened = await processReopens(tasks)
  const nudged: string[] = []
  const released: string[] = []
  const now = Date.now()

  for (const task of tasks) {
    if (task.status !== 'Claimed' || !task.claimedAt) continue
    const hours = (now - Date.parse(task.claimedAt)) / 3600_000
    const first = task.claimantName.split(' ')[0] || 'there'
    const taskUrl = `${BASE}/tasks/${task.id}`

    if (hours >= RELEASE_HOURS) {
      await updateTask(task.id, {
        Status: 'Open',
        'Claimant name': null,
        'Claimant email': null,
        'Claimed at': null,
        'Nudged at': null,
      })
      await logTaskEvent({
        taskId: task.id,
        taskTitle: task.title,
        name: task.claimantName,
        email: task.claimantEmail,
        type: 'Auto-released',
        note: `No completion after ${Math.round(hours)}h`,
      })
      if (task.claimantEmail) {
        await sendEmail({
          to: task.claimantEmail,
          from: TASKS_FROM,
          subject: `“${task.title}” went back on the board`,
          text: `Hey ${first}, no worries — "${task.title}" wasn't marked done within ${RELEASE_HOURS} hours, so it's back on the board. Grab another anytime: ${BASE}`,
          html: emailShell(
            `<p>Hey ${first},</p>
             <p>No worries at all — <strong>${task.title}</strong> wasn't marked done within ${RELEASE_HOURS} hours, so it's back on the board for someone else. That's just how we keep tasks fresh.</p>
             <p>If you actually finished it, tell us and we'll sort it out. And feel free to <a href="${BASE}" style="color:#78350f">claim another task</a> anytime.</p>`
          ),
        })
      }
      await notifyTaskCreator(
        task,
        null,
        `“${task.title}” is back on the board`,
        `<p><strong>${task.claimantName || 'The claimer'}</strong> didn't finish <a href="${BASE}/tasks/${task.id}" style="color:#78350f">${task.title}</a> within ${RELEASE_HOURS}h, so it auto-released and is open again.</p>`,
        `"${task.title}" auto-released after ${RELEASE_HOURS}h and is open again. ${BASE}/tasks/${task.id}`
      )
      released.push(task.title)
    } else if (hours >= NUDGE_HOURS && !task.nudgedAt) {
      await updateTask(task.id, { 'Nudged at': new Date().toISOString() })
      if (task.claimantEmail) {
        await sendEmail({
          to: task.claimantEmail,
          from: TASKS_FROM,
          subject: `Still on “${task.title}”?`,
          text: `Hey ${first}, you claimed "${task.title}" about ${Math.round(hours)}h ago. Claims auto-release after ${RELEASE_HOURS}h. Mark it done or release it: ${taskUrl}`,
          html: emailShell(
            `<p>Hey ${first},</p>
             <p>You claimed <strong>${task.title}</strong> about ${Math.round(hours)} hours ago. Claims auto-release after ${RELEASE_HOURS} hours so the board stays fresh.</p>
             <p><a href="${taskUrl}" style="color:#78350f;font-weight:600">Mark it done</a> when you finish (a photo closes it instantly), or release it from the same page if today got away from you — zero judgment.</p>`
          ),
        })
      }
      nudged.push(task.title)
    }
  }

  return { approved, nudged, released, reopened }
}
