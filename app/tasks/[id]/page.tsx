import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getTask,
  listTaskComments,
  priorityOf,
  RELEASE_HOURS,
  storyForFloor,
} from '@/app/lib/tasks'
import { canManageTask, getClaimer, getTaskActor } from '@/app/lib/tasks-auth'
import CommentForm from '../CommentForm'
import FloorMap from '../FloorMap'
import { ClaimButton, DonePanel } from '../TaskActions'
import { ManageTaskButtons } from '../TaskForm'
import { PriorityDot, Prose, STATUS_BADGE, STATUS_LABEL } from '../ui'

export const dynamic = 'force-dynamic'

export default async function TaskDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [task, claimer, actor] = await Promise.all([
    getTask(id),
    getClaimer(),
    getTaskActor(),
  ])
  if (!task || task.status === 'Archived') notFound()
  const [canManage, comments] = await Promise.all([
    canManageTask(task.createdByEmail),
    listTaskComments(id).catch(() => []),
  ])

  const isMine = !!claimer && task.claimantEmail === claimer.email
  const firstName = task.claimantName.split(' ')[0]
  const story = storyForFloor(task.floor)
  const hoursLeft = task.claimedAt
    ? Math.max(
        0,
        Math.round(
          RELEASE_HOURS - (Date.now() - Date.parse(task.claimedAt)) / 3600_000
        )
      )
    : null

  // Board links go back to the tab this task lives under (a contractor-only
  // task returns to the contractor tab; anything else to the default).
  const typeQuery =
    task.taskTypes.includes('Contractor') && !task.taskTypes.includes('Volunteer')
      ? 'type=contractor'
      : ''
  const boardHref = typeQuery ? `/tasks?${typeQuery}` : '/tasks'
  const tagHref = (t: string) =>
    `/tasks?${typeQuery ? `${typeQuery}&` : ''}tag=${encodeURIComponent(t)}`

  return (
    <div className="container">
      <Link href={boardHref} className="back-link">
        ← All tasks
      </Link>
      <div className="task-page">
        <article className="task-detail">
          {task.skills.length > 0 && (
            <div className="chips">
              {task.skills.map((s) => (
                <Link key={s} href={tagHref(s)} className="chip" data-skill={s}>
                  {s}
                </Link>
              ))}
            </div>
          )}
          <h1>{task.title}</h1>
          {task.summary && <p className="lede">{task.summary}</p>}
          <div className="meta-row">
            {task.effort && <span className="effort">{task.effort}</span>}
            {task.taskTypes.includes('Contractor') && (
              <span className="chip chip-contractor">Contractor task</span>
            )}
            {task.floor && (
              <Link href={tagHref(task.floor)} className="chip chip-floor">
                📍 {task.floor}
              </Link>
            )}
            {STATUS_BADGE[task.status] && (
              <span className={`badge ${STATUS_BADGE[task.status]}`}>
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            )}
            <span className="prio-label">
              <PriorityDot priority={task.priority} />
              {priorityOf(task)} priority
            </span>
            {task.repeat && (
              <span className="chip">🔁 {task.repeat}</span>
            )}
            {canManage && (
              <ManageTaskButtons
                task={{
                  id: task.id,
                  title: task.title,
                  summary: task.summary,
                  brief: task.brief,
                  doneCriteria: task.doneCriteria,
                  contextLinks: task.contextLinks
                    .map((l) =>
                      l.label === l.url ? l.url : `${l.label} | ${l.url}`
                    )
                    .join('\n'),
                  skills: task.skills,
                  effort: task.effort,
                  floor: task.floor,
                  repeat: task.repeat,
                  priority: task.priority,
                  taskTypes: task.taskTypes,
                  mapPoint: task.mapPoint,
                  refPhotos: task.refPhotos.map((p) => ({
                    id: p.id,
                    thumbUrl: p.thumbUrl,
                    filename: p.filename,
                  })),
                }}
              />
            )}
          </div>

          {task.brief && (
            <section className="detail-section">
              <h2>The task</h2>
              <Prose text={task.brief} />
            </section>
          )}

          {task.mapPoint && story && (
            <section className="detail-section">
              <h2>Where to find it</h2>
              <FloorMap story={story} pin={task.mapPoint} height={280} />
            </section>
          )}

          {task.doneCriteria && (
            <section className="detail-section">
              <h2>What done looks like</h2>
              <div className="done-criteria">
                <Prose text={task.doneCriteria} />
              </div>
            </section>
          )}

          {task.refPhotos.length > 0 && (
            <section className="detail-section">
              <h2>Photos</h2>
              <div className="photo-grid">
                {task.refPhotos.map((p) => (
                  <a
                    key={p.url}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl} alt={p.filename} loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {task.contextLinks.length > 0 && (
            <section className="detail-section">
              <h2>Useful links</h2>
              <ul className="link-list">
                {task.contextLinks.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <h2>Conversation</h2>
            {comments.length > 0 ? (
              <div className="comments-list">
                {comments.map((c) => (
                  <div key={c.id} className="comment">
                    <div className="comment-head">
                      <span className="comment-author">
                        {c.authorName || c.authorEmail}
                      </span>
                      {c.at && (
                        <span className="comment-when">
                          {new Date(c.at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <Prose text={c.text} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="comments-empty">
                No comments yet — questions and context welcome.
              </p>
            )}
            {actor ? (
              <CommentForm taskId={task.id} />
            ) : (
              <p className="comments-empty">
                <Link href={`/tasks/auth/google?redirect=/tasks/${task.id}`}>
                  Sign in
                </Link>{' '}
                to join the conversation.
              </p>
            )}
          </section>
        </article>

        <aside className="card action-card">
          {task.status === 'Open' &&
            (claimer ? (
              <>
                <h2>Take it on</h2>
                <p className="hint">
                  Claiming means &ldquo;I&rsquo;m doing this today.&rdquo; It
                  goes back on the board after {RELEASE_HOURS}h if it
                  isn&rsquo;t finished — no hard feelings.
                </p>
                <ClaimButton taskId={task.id} />
              </>
            ) : (
              <>
                <h2>Take it on</h2>
                <p className="hint">
                  Sign in with Google to claim this task. Claiming means
                  &ldquo;I&rsquo;m doing this today.&rdquo;
                </p>
                <Link
                  href={`/tasks/auth/google?redirect=/tasks/${task.id}`}
                  className="btn btn-primary btn-block"
                >
                  Sign in with Google
                </Link>
              </>
            ))}

          {task.status === 'Claimed' && isMine && (
            <>
              <h2>You&rsquo;re on it 💪</h2>
              {hoursLeft !== null && (
                <p className="hint">
                  Auto-releases in about {hoursLeft}h. Finish and mark it done —
                  the Mox team gives it a quick look and closes it out.
                </p>
              )}
              <DonePanel taskId={task.id} />
            </>
          )}

          {task.status === 'Claimed' && !isMine && (
            <>
              <h2>{firstName || 'Someone'} is on it</h2>
              <p className="hint">
                If it isn&rsquo;t finished within {RELEASE_HOURS} hours it goes
                back on the board automatically — check back later.
              </p>
            </>
          )}

          {task.status === 'In review' && (
            <>
              <h2>Almost done ✨</h2>
              <p className="hint">
                {isMine
                  ? 'Nice work! The Mox team will give it a quick look and close it out.'
                  : `${firstName || 'Someone'} finished this — the Mox team is giving it a quick look.`}
              </p>
            </>
          )}

          {task.status === 'Done' && (
            <>
              <h2>Completed 🎉</h2>
              <p className="hint">
                {firstName ? `Done by ${firstName}. ` : ''}Thanks for making
                Mox better.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
