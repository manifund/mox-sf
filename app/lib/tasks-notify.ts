/**
 * Creator notifications for the task board: the person who posted a task gets
 * an email when someone claims it, finishes it, or lets it go — so tasks never
 * silently need action (mox-sf#100).
 */
import { sendEmail } from './email'
import { env } from './env'
import type { Task } from './tasks'

export const TASKS_FROM = 'Mox Tasks <portal@account.moxsf.com>'

export function taskEmailShell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.55">
  <p style="font-weight:700;letter-spacing:0.08em;font-size:13px;color:#78350f;margin:0 0 20px">MOX ᴛᴀꜱᴋꜱ</p>
  ${body}
  <p style="color:#6b7280;font-size:13px;margin-top:28px">— the Mox task board, ${env.TASKS_BASE_URL}</p>
</div>`
}

/**
 * Emails the task's creator. Skips silently when the task has no recorded
 * creator or when the creator did the action themselves.
 */
export async function notifyTaskCreator(
  task: Task,
  actorEmail: string | null,
  subject: string,
  bodyHtml: string,
  bodyText: string
): Promise<void> {
  const to = task.createdByEmail
  if (!to) return
  if (actorEmail && to.toLowerCase() === actorEmail.toLowerCase()) return
  const first = task.createdByName.split(' ')[0] || 'there'
  await sendEmail({
    to,
    from: TASKS_FROM,
    subject,
    text: `Hey ${first}, ${bodyText}`,
    html: taskEmailShell(`<p>Hey ${first},</p>${bodyHtml}`),
  })
}

export function taskUrl(task: Task): string {
  return `${env.TASKS_BASE_URL}/tasks/${task.id}`
}
