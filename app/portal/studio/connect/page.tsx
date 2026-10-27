import Link from 'next/link'
import { redirect } from 'next/navigation'
import { studioOwner } from '@/app/lib/studio-oauth'
import { env } from '@/app/lib/env'

export const dynamic = 'force-dynamic'

export default async function ConnectStudio() {
  if (!(await studioOwner())) redirect('/portal/login')
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1>Studio calendar</h1>
      {env.STUDIO_CALENDAR_CONNECTION ? (
        <p>
          Google connection configured.{' '}
          <Link href="/portal/studio">Book the studio</Link>
        </p>
      ) : (
        <>
          <p>
            Connect carolina@moxsf.com to create member bookings through your
            account. Google requests Calendar event access; Mox uses it only for
            the studio calendar.
          </p>
          <p>
            After approval, a private connection file downloads for installation
            in Vercel.
          </p>
          <form action="/portal/api/studio-connect" method="post">
            <button type="submit">Connect Google Calendar</button>
          </form>
        </>
      )}
    </main>
  )
}
