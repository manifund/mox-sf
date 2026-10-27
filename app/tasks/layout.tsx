import type { Metadata } from 'next'
import Link from 'next/link'
import { getClaimer, isOrganizer } from '@/app/lib/tasks-auth'
import { AddTaskButton } from './TaskForm'
import './tasks.css'

export const metadata: Metadata = {
  title: 'Mox ᴛᴀꜱᴋꜱ',
  description:
    'Small, well-scoped tasks that make Mox better. Claim one, do it today, and it’s yours.',
}

export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [claimer, organizer] = await Promise.all([getClaimer(), isOrganizer()])

  return (
    <div className="tasksui">
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/tasks" className="wordmark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/mox_logo_text.svg"
              alt="Mox"
              className="wordmark-logo"
            />
            <span>ᴛᴀꜱᴋꜱ</span>
          </Link>
          <nav>
            {organizer && <AddTaskButton />}
            {claimer ? (
              <>
                <Link href="/tasks/my" className="nav-link">
                  My tasks
                </Link>
                <form
                  action="/tasks/auth/signout"
                  method="post"
                  className="inline-form"
                >
                  <button type="submit" className="btn btn-ghost">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/tasks/auth/google?redirect=/tasks"
                className="btn btn-ghost"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container">
          <span>
            A community board by <a href="https://moxsf.com">Mox</a> · San
            Francisco
          </span>
          <span>Claim a task, do it today, make the space better.</span>
        </div>
      </footer>
    </div>
  )
}
