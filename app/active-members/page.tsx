import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { formatUrl } from '../people/people'
import { getActiveMembers, ActiveMember, TierGroup } from './active-members'
import '../people/people.css'
import './active-members.css'

export const metadata: Metadata = {
  title: 'Active members | Mox',
  robots: { index: false, follow: false },
}

// Cross-references all of Stripe on each render; cache for 10 minutes.
export const revalidate = 600

export default async function ActiveMembersPage() {
  let data: Awaited<ReturnType<typeof getActiveMembers>> | null = null
  try {
    data = await getActiveMembers()
  } catch (e) {
    console.error('Failed to fetch active members:', e)
  }

  if (!data) {
    return (
      <div className="directory-wrapper">
        <div className="directory">
          <Link href="/" className="back-link">&larr; back to home</Link>
          <h1>Active members of Mox</h1>
          <p className="muted">Couldn&apos;t load member data right now. Try again in a minute.</p>
        </div>
      </div>
    )
  }

  const generated = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })

  return (
    <div className="directory-wrapper">
      <div className="directory active-members">
        <Link href="/" className="back-link">&larr; back to home</Link>
        <h1>Active members of Mox</h1>
        <p className="muted">
          {data.total} active members as of {generated}, across {data.activeOffices} private
          offices and {data.activePrograms} {data.activePrograms === 1 ? 'fellowship' : 'fellowships'}.
          See also the full <Link href="/people">directory</Link>.
        </p>

        <table className="tier-stats">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Entitlement</th>
              <th className="num">Members</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={g.key}>
                <td><a href={`#${g.key}`}>{g.title}</a></td>
                <td>{g.entitlement}</td>
                <td className="num">{g.count}</td>
                <td className="num">{Math.round((100 * g.count) / data.total)}%</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td></td>
              <td className="num">{data.total}</td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>

        {data.groups.map((g) => (
          <TierSection key={g.key} group={g} />
        ))}

        {data.unlisted > 0 && (
          <p className="muted">
            {data.unlisted} {data.unlisted === 1 ? 'member has' : 'members have'} opted
            out of the public directory: counted above, not named.
          </p>
        )}
      </div>
    </div>
  )
}

function TierSection({ group }: { group: TierGroup }) {
  const listed = group.members.filter((m) => m.listed)
  const hidden = group.members.length - listed.length

  // Office tier: sub-group by org / fellowship so a reader can see who sits together.
  if (group.key === 'office') {
    const byOrg = new Map<string, { rooms: string[]; members: ActiveMember[] }>()
    const residents: ActiveMember[] = []
    const independents: ActiveMember[] = []
    for (const m of listed) {
      if (m.orgs.length > 0 || m.programs.length > 0) {
        const key = m.orgs.length > 0
          ? m.orgs.join(' · ')
          : `${m.programs.join(' · ')} (fellowship)`
        if (!byOrg.has(key)) byOrg.set(key, { rooms: m.rooms, members: [] })
        byOrg.get(key)!.members.push(m)
      } else if (m.tier === 'Resident') {
        residents.push(m)
      } else {
        independents.push(m)
      }
    }
    const orgEntries = [...byOrg.entries()].sort(
      ([a, ga], [b, gb]) => gb.members.length - ga.members.length || a.localeCompare(b)
    )
    return (
      <div className="directory-section" id={group.key}>
        <SectionTitle group={group} hidden={hidden} />
        {group.placeholders.map((p) => (
          <div key={p.name} className="program-section">
            <div className="program-header">
              <h3 className="program-title">{p.name} (fellowship)</h3>
              <span className="program-room">
                {p.rooms.length > 0 && <span>room {p.rooms.join(', ')} · </span>}
                {p.count}
              </span>
            </div>
            <p className="muted placeholder-note">
              {p.count} fellows in residence; roster not yet in the directory.
            </p>
          </div>
        ))}
        {orgEntries.map(([name, g]) => (
          <div key={name} className="program-section">
            <div className="program-header">
              <h3 className="program-title">{name}</h3>
              <span className="program-room">
                {g.rooms.length > 0 && <span>room {g.rooms.join(', ')} · </span>}
                {g.members.length}
              </span>
            </div>
            <Pills members={g.members} />
          </div>
        ))}
        {residents.length > 0 && (
          <div className="program-section">
            <div className="program-header">
              <h3 className="program-title">Residents</h3>
              <span className="program-room">{residents.length}</span>
            </div>
            <Pills members={residents} />
          </div>
        )}
        {independents.length > 0 && (
          <div className="program-section">
            <div className="program-header">
              <h3 className="program-title">Independent offices</h3>
              <span className="program-room">{independents.length}</span>
            </div>
            <Pills members={independents} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="directory-section" id={group.key}>
      <SectionTitle group={group} hidden={hidden} />
      <Pills members={listed} />
    </div>
  )
}

function SectionTitle({ group, hidden }: { group: TierGroup; hidden: number }) {
  return (
    <h2 className="section-title">
      {group.title}
      <span className="section-count">
        {' '}{group.count} · {group.entitlement}
        {hidden > 0 && ` · ${hidden} unlisted`}
      </span>
    </h2>
  )
}

function Pills({ members }: { members: ActiveMember[] }) {
  return (
    <div className="collapsed-list">
      {members.map((m) => {
        const content = (
          <>
            {m.photoUrl && (
              <Image
                src={m.photoUrl}
                alt=""
                width={56}
                height={56}
                sizes="28px"
                className="collapsed-photo"
              />
            )}
            {m.name}
          </>
        )
        return m.website ? (
          <Link
            key={m.id}
            href={formatUrl(m.website)}
            target="_blank"
            className="collapsed-name"
          >
            {content}
          </Link>
        ) : (
          <span key={m.id} className="collapsed-name">
            {content}
          </span>
        )
      })}
    </div>
  )
}
