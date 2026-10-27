import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession, isCurrentlyStaff } from '@/app/lib/session'
import {
  getHiringOrgs,
  getHiringPeople,
  getJobSeekers,
  getOpenRoles,
  type CareerPerson,
} from '@/app/lib/careers'
import { getOrgs } from '@/app/people/people'

export const metadata = {
  title: 'Careers | Admin | Mox',
}

export const dynamic = 'force-dynamic'

function PersonRow({
  person,
  orgName,
}: {
  person: CareerPerson
  orgName: string | null
}) {
  return (
    <tr style={{ borderBottom: '1px solid #f1f3f5', verticalAlign: 'top' }}>
      <td style={{ padding: '8px 12px 8px 0', fontWeight: 600 }}>
        {person.name}
        {orgName && (
          <span className="muted" style={{ fontWeight: 400 }}>
            {' '}
            · {orgName}
          </span>
        )}
      </td>
      <td style={{ padding: '8px 12px 8px 0' }}>{person.jobStatus || '—'}</td>
      <td style={{ padding: '8px 12px 8px 0' }}>
        {person.email && <a href={`mailto:${person.email}`}>email</a>}
        {person.email && person.linkedin && ' · '}
        {person.linkedin && (
          <a href={person.linkedin} target="_blank" rel="noopener noreferrer">
            linkedin
          </a>
        )}
        {person.website && (person.email || person.linkedin) && ' · '}
        {person.website && (
          <a href={person.website} target="_blank" rel="noopener noreferrer">
            site
          </a>
        )}
      </td>
      <td style={{ padding: '8px 0', maxWidth: 360 }}>
        {[person.workThing, person.careerNotes].filter(Boolean).join(' — ') ||
          ''}
      </td>
    </tr>
  )
}

export default async function CareersAdminPage() {
  const session = await getSession()

  if (!session.isLoggedIn) {
    redirect('/portal/login')
  }
  if (!(await isCurrentlyStaff(session.userId))) {
    redirect('/portal')
  }

  const [seekers, hiringPeople, hiringOrgs, openRoles, orgsMap] =
    await Promise.all([
      getJobSeekers(),
      getHiringPeople(),
      getHiringOrgs(),
      getOpenRoles(),
      getOrgs(),
    ])

  const orgName = (person: CareerPerson) =>
    person.orgIds[0] ? orgsMap.get(person.orgIds[0])?.name || null : null

  return (
    <div>
      <Link href="/portal" className="back-link">
        &larr; back to portal
      </Link>

      <h1>careers</h1>

      <p className="muted" style={{ marginBottom: 20 }}>
        <b>confidential.</b> members shared this on the promise that only staff
        see it — use it for warm intros, never publish it. the open-roles board
        is at <Link href="/jobs">/jobs</Link> ({openRoles.length} open role
        {openRoles.length === 1 ? '' : 's'}).
      </p>

      <h2>looking for work ({seekers.length})</h2>
      {seekers.length === 0 ? (
        <p className="muted">
          Nobody yet. Members set this in their portal profile under
          &ldquo;career&rdquo;.
        </p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr
              style={{ textAlign: 'left', borderBottom: '1px solid #dee2e6' }}
            >
              <th style={{ padding: '6px 12px 6px 0' }}>Member</th>
              <th style={{ padding: '6px 12px 6px 0' }}>Status</th>
              <th style={{ padding: '6px 12px 6px 0' }}>Links</th>
              <th style={{ padding: '6px 0' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {seekers.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                orgName={orgName(person)}
              />
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 32 }}>
        hiring — members ({hiringPeople.length})
      </h2>
      {hiringPeople.length === 0 ? (
        <p className="muted">Nobody yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {hiringPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                orgName={orgName(person)}
              />
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 32 }}>hiring — orgs ({hiringOrgs.length})</h2>
      {hiringOrgs.length === 0 ? (
        <p className="muted">
          None yet. Set the <code>Hiring</code> checkbox or a{' '}
          <code>Careers URL</code> on an org in Airtable — orgs with a careers
          URL get scraped weekly into the <Link href="/jobs">jobs board</Link>.
        </p>
      ) : (
        <ul>
          {hiringOrgs.map((org) => (
            <li key={org.id} style={{ marginBottom: 4 }}>
              <strong>{org.name}</strong>
              {org.stealth && <span className="muted"> (stealth)</span>}
              {org.careersUrl ? (
                <>
                  {' '}
                  ·{' '}
                  <a
                    href={org.careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    careers page
                  </a>{' '}
                  <span className="muted">(scraped weekly)</span>
                </>
              ) : (
                <span className="muted"> · no careers URL yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
