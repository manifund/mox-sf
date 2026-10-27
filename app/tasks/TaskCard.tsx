import Link from 'next/link'
import type { Task } from '@/app/lib/tasks'
import { PriorityDot } from './ui'

export default function TaskCard({
  task,
  activeTag,
  typeParam,
}: {
  task: Task
  activeTag?: string
  /** Current board tab ('contractor' or undefined) — kept in tag links. */
  typeParam?: string
}) {
  const claimed = task.status !== 'Open'
  const firstName = task.claimantName.split(' ')[0]
  const typeQuery = typeParam ? `type=${typeParam}` : ''
  const boardHref = typeQuery ? `/tasks?${typeQuery}` : '/tasks'
  const tagHref = (t: string) =>
    activeTag === t
      ? boardHref
      : `/tasks?${typeQuery ? `${typeQuery}&` : ''}tag=${encodeURIComponent(t)}`

  return (
    <article className={`card task-card${claimed ? ' is-claimed' : ''}`}>
      <div className="card-top">
        <span className="effort-wrap">
          {task.effort && <span className="effort">{task.effort}</span>}
          {task.repeat && (
            <span
              className="repeat-mark"
              title={`Repeats ${task.repeat.toLowerCase()}`}
            >
              🔁
            </span>
          )}
        </span>
        <span className="card-top-right">
          {task.status === 'Claimed' && (
            <span className="badge badge-claimed">In progress</span>
          )}
          {task.status === 'In review' && (
            <span className="badge badge-review">Wrapping up</span>
          )}
          <PriorityDot priority={task.priority} />
        </span>
      </div>
      <h3>
        {/* card-link stretches over the whole card; chips sit above it */}
        <Link href={`/tasks/${task.id}`} className="card-link">
          {task.title}
        </Link>
      </h3>
      <p>{task.summary}</p>
      {(task.floor || task.skills.length > 0) && (
        <div className="chips">
          {task.floor && (
            <Link
              href={tagHref(task.floor)}
              className={`chip chip-floor${activeTag === task.floor ? ' chip-active' : ''}`}
            >
              📍 {task.floor}
            </Link>
          )}
          {task.skills.map((s) => (
            <Link
              key={s}
              href={tagHref(s)}
              data-skill={s}
              className={`chip${activeTag === s ? ' chip-active' : ''}`}
            >
              {s}
            </Link>
          ))}
        </div>
      )}
      {claimed && firstName && <p className="claimed-by">Claimed by {firstName}</p>}
    </article>
  )
}
