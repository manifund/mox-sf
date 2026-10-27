import Link from 'next/link'
import {
  FLOORS,
  listTasks,
  PRIORITY_RANK,
  priorityOf,
  type Task,
  type TaskType,
} from '@/app/lib/tasks'
import TaskCard from './TaskCard'

export const dynamic = 'force-dynamic'

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'Google sign-in isn’t configured yet.',
  google_denied: 'Sign-in was cancelled.',
  google_token: 'Google sign-in failed — please try again.',
  google_user: 'Couldn’t read your Google profile — please try again.',
  invalid_state: 'Sign-in expired — please try again.',
  no_email: 'Your Google account didn’t share an email.',
  server: 'Something went wrong signing in — please try again.',
}

export default async function TasksBoard({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; error?: string; type?: string }>
}) {
  const { tag, error, type } = await searchParams
  const activeType: TaskType = type === 'contractor' ? 'Contractor' : 'Volunteer'
  const typeParam = activeType === 'Contractor' ? 'contractor' : undefined

  let allTasks: Task[] = []
  let unavailable = false
  try {
    allTasks = await listTasks()
  } catch (err) {
    console.error('[tasks] board fetch failed:', err)
    unavailable = true
  }

  const openCount = (tt: TaskType) =>
    allTasks.filter((t) => t.status === 'Open' && t.taskTypes.includes(tt))
      .length
  const tasks = allTasks.filter((t) => t.taskTypes.includes(activeType))

  const matchesTag = (t: Task) =>
    !!tag && (t.skills.includes(tag) || t.floor === tag)
  let open = tasks.filter((t) => t.status === 'Open')
  // Most urgent first within each floor group (unset priority = Medium).
  open = [...open].sort(
    (a, b) =>
      (PRIORITY_RANK[priorityOf(a)] ?? 1) - (PRIORITY_RANK[priorityOf(b)] ?? 1)
  )
  if (tag)
    open = [...open.filter(matchesTag), ...open.filter((t) => !matchesTag(t))]

  // Group open tasks by floor: 1st → Rooftop, then floorless ("Anywhere").
  // A floor tag filter lifts that floor's group to the top.
  const groupOrder: string[] = [...FLOORS, '']
  if (tag && (FLOORS as readonly string[]).includes(tag)) {
    groupOrder.splice(groupOrder.indexOf(tag), 1)
    groupOrder.unshift(tag)
  }
  const floorGroups = groupOrder
    .map((floor) => ({
      floor,
      label: floor || 'Anywhere',
      tasks: open.filter((t) => (t.floor || '') === floor),
    }))
    .filter((g) => g.tasks.length > 0)

  const inProgress = tasks.filter(
    (t) => t.status === 'Claimed' || t.status === 'In review'
  )
  const twoWeeksAgo = Date.now() - 14 * 24 * 3600_000
  const recentlyDone = tasks
    .filter(
      (t) =>
        t.status === 'Done' &&
        t.completedAt &&
        Date.parse(t.completedAt) > twoWeeksAgo
    )
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .slice(0, 8)

  return (
    <div className="container">
      {error && ERROR_MESSAGES[error] && (
        <p className="error" style={{ marginTop: 24 }}>
          {ERROR_MESSAGES[error]}
        </p>
      )}

      <section className="hero">
        <h1>Help make Mox better.</h1>
        <p>
          Small, well-scoped tasks — most take an hour or two. Claim one, do it
          today, and it&rsquo;s yours.{' '}
          {!unavailable && (
            <span className="open-count">{open.length} open right now.</span>
          )}
        </p>
      </section>

      <div className="tabs">
        <Link
          href="/tasks"
          className={`tab${activeType === 'Volunteer' ? ' tab-active' : ''}`}
        >
          Volunteer tasks
          {!unavailable && (
            <span className="tab-count">{openCount('Volunteer')}</span>
          )}
        </Link>
        <Link
          href="/tasks?type=contractor"
          className={`tab${activeType === 'Contractor' ? ' tab-active' : ''}`}
        >
          Contractor tasks
          {!unavailable && (
            <span className="tab-count">{openCount('Contractor')}</span>
          )}
        </Link>
      </div>

      <section className="section">
        <h2 className="section-title">Open tasks</h2>
        {tag && (
          <p className="filter-note">
            Showing <span className="filter-tag">{tag}</span> tasks first ·{' '}
            <Link href={typeParam ? `/tasks?type=${typeParam}` : '/tasks'}>
              clear
            </Link>
          </p>
        )}
        {unavailable ? (
          <div className="empty-state">
            The board is warming up — check back in a little while.
          </div>
        ) : open.length > 0 ? (
          <div className="floor-groups">
            {floorGroups.map((g) => (
              <div key={g.label}>
                <h3 className="floor-group-title">
                  {g.floor ? `📍 ${g.label}` : g.label}{' '}
                  <span className="count">· {g.tasks.length}</span>
                </h3>
                <div className="grid">
                  {g.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      activeTag={tag}
                      typeParam={typeParam}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Nothing open right now — everything&rsquo;s claimed or done. Check
            back soon!
          </div>
        )}
      </section>

      {inProgress.length > 0 && (
        <section className="section">
          <h2 className="section-title">In progress</h2>
          <div className="grid">
            {inProgress.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                activeTag={tag}
                typeParam={typeParam}
              />
            ))}
          </div>
        </section>
      )}

      {recentlyDone.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recently completed 🎉</h2>
          <div className="done-list">
            {recentlyDone.map((t) => (
              <div key={t.id} className="done-item">
                <span className="who">
                  {t.claimantName.split(' ')[0] || 'Someone'}
                </span>
                <span>{t.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
