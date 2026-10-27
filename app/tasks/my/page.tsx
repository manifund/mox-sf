import Link from 'next/link'
import { listTasks, RELEASE_HOURS } from '@/app/lib/tasks'
import { getClaimer } from '@/app/lib/tasks-auth'

export const dynamic = 'force-dynamic'

export default async function MyTasks() {
  const claimer = await getClaimer()

  if (!claimer) {
    return (
      <div className="container page-pad">
        <h1>My tasks</h1>
        <p className="sub">Sign in to see the tasks you&rsquo;ve claimed.</p>
        <Link
          href="/tasks/auth/google?redirect=/tasks/my"
          className="btn btn-primary"
        >
          Sign in with Google
        </Link>
      </div>
    )
  }

  const tasks = await listTasks()
  const active = tasks.filter(
    (t) => t.status === 'Claimed' && t.claimantEmail === claimer.email
  )
  const past = tasks
    .filter(
      (t) =>
        (t.status === 'In review' || t.status === 'Done') &&
        t.claimantEmail === claimer.email
    )
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))

  return (
    <div className="container page-pad">
      <h1>My tasks</h1>
      <p className="sub">
        {active.length > 0
          ? `You have ${active.length} task${active.length > 1 ? 's' : ''} in progress.`
          : 'Nothing in progress — grab something from the board!'}
      </p>

      {active.map((t) => {
        const hoursLeft = t.claimedAt
          ? Math.max(
              0,
              Math.round(
                RELEASE_HOURS -
                  (Date.now() - Date.parse(t.claimedAt)) / 3600_000
              )
            )
          : null
        return (
          <div key={t.id} className="card my-task">
            <div>
              <h3>{t.title}</h3>
              <p className="when">
                {hoursLeft !== null
                  ? `Auto-releases in about ${hoursLeft}h`
                  : 'In progress'}
              </p>
            </div>
            <div className="my-task-right">
              <span className="badge badge-claimed">In progress</span>
              <Link href={`/tasks/${t.id}`} className="btn btn-ghost">
                Open →
              </Link>
            </div>
          </div>
        )
      })}

      {past.length > 0 && (
        <section className="section">
          <h2 className="section-title">Your contributions</h2>
          {past.map((t) => (
            <div key={t.id} className="card my-task">
              <h3>{t.title}</h3>
              <div className="my-task-right">
                {t.status === 'In review' ? (
                  <span className="badge badge-review">Being reviewed</span>
                ) : (
                  <span className="badge badge-done">Done 🎉</span>
                )}
                <Link href={`/tasks/${t.id}`} className="btn btn-ghost">
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
