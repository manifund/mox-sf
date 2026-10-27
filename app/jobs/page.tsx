import Link from 'next/link'
import {
  getJobsOrgInfo,
  getOpenRoles,
  type JobsOrgInfo,
  type OpenRole,
} from '@/app/lib/careers'

export const metadata = {
  title: 'Jobs | Mox',
  description: 'Open roles at organizations in the Mox community.',
}

export const revalidate = 300

interface RoleGroup {
  name: string
  about: string | null
  roles: OpenRole[]
}

function groupRoles(
  roles: OpenRole[],
  orgs: Map<string, JobsOrgInfo>
): RoleGroup[] {
  const groups = new Map<string, RoleGroup>()
  for (const role of roles) {
    const org = role.orgId ? orgs.get(role.orgId) : null
    const name = org?.name || role.company || 'Other'
    if (!groups.has(name)) {
      groups.set(name, { name, about: org?.about || null, roles: [] })
    }
    groups.get(name)!.roles.push(role)
  }

  return [...groups.values()].sort((a, b) => {
    // Mox's own openings first, then by number of roles, then alphabetically.
    if (a.name === 'Mox') return -1
    if (b.name === 'Mox') return 1
    if (a.roles.length !== b.roles.length)
      return b.roles.length - a.roles.length
    return a.name.localeCompare(b.name)
  })
}

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Keep expanded cards short: at most an intro line plus this many bullets.
const MAX_DESCRIPTION_LINES = 5

/** Render the stored description: "- " lines become bullets, others paragraphs. */
function Description({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, MAX_DESCRIPTION_LINES)
  const blocks: { type: 'p' | 'ul'; items: string[] }[] = []
  for (const line of lines) {
    const isBullet = line.trim().startsWith('- ')
    const content = isBullet ? line.trim().slice(2) : line.trim()
    const last = blocks[blocks.length - 1]
    if (isBullet) {
      if (last?.type === 'ul') last.items.push(content)
      else blocks.push({ type: 'ul', items: [content] })
    } else {
      blocks.push({ type: 'p', items: [content] })
    }
  }
  return (
    <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300 leading-snug">
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="list-disc pl-4 space-y-0.5">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.items[0]}</p>
        )
      )}
    </div>
  )
}

function RoleCard({ role, group }: { role: OpenRole; group: RoleGroup }) {
  const hasDetails = !!(
    role.description ||
    role.salary ||
    role.deadline ||
    group.about
  )
  const meta = [role.location, ...role.tags].filter(Boolean).join(' · ')

  const header = (
    <div className="flex items-start justify-between gap-4 min-h-[6rem]">
      <div className="min-w-0">
        <span className="block font-semibold text-lg leading-snug text-gray-900 dark:text-gray-100 line-clamp-2">
          {role.title}
        </span>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {meta}
        </div>
      </div>
      {hasDetails && (
        <span
          aria-hidden
          className="shrink-0 text-gray-400 dark:text-gray-500 mt-1 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      )}
    </div>
  )

  if (!hasDetails) {
    return (
      <div className="border border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-gray-800">
        {role.url ? (
          <a
            href={role.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block hover:text-amber-900 dark:hover:text-amber-400"
          >
            {header}
          </a>
        ) : (
          header
        )}
      </div>
    )
  }

  return (
    <details className="group border border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-gray-800">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:opacity-80 transition-opacity">
        {header}
      </summary>

      <div className="mt-3 space-y-2">
        {role.description && <Description text={role.description} />}

        {(role.deadline || role.salary) && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {role.salary && (
              <>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Salary:
                </span>{' '}
                {role.salary}
              </>
            )}
            {role.salary && role.deadline && ' · '}
            {role.deadline && (
              <>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Deadline:
                </span>{' '}
                {formatDate(role.deadline)}
              </>
            )}
          </p>
        )}

        {group.about && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
            {group.about}
          </p>
        )}

        {role.url && (
          <a
            href={role.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-amber-900 hover:bg-amber-950 dark:bg-amber-700 dark:hover:bg-amber-600 text-white text-sm font-medium px-3 py-1.5"
          >
            {role.url.startsWith('mailto:')
              ? 'Apply by email'
              : 'Open listing ↗'}
          </a>
        )}
      </div>
    </details>
  )
}

export default async function JobsPage() {
  let groups: RoleGroup[] = []
  let loadError = false
  try {
    const [roles, orgs] = await Promise.all([
      getOpenRoles({ revalidate: 300 }),
      getJobsOrgInfo(),
    ])
    groups = groupRoles(
      // Roles at stealth orgs stay off the public board entirely.
      roles.filter(
        (role) => !role.orgId || orgs.get(role.orgId)?.stealth !== true
      ),
      orgs
    )
  } catch (error) {
    console.error('[Jobs] Failed to load roles:', error)
    loadError = true
  }

  const totalRoles = groups.reduce((sum, group) => sum + group.roles.length, 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/"
          className="text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
        >
          &larr; moxsf.com
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold font-display text-gray-900 dark:text-white mt-6 mb-2">
          Jobs around Mox
        </h1>
        <p className="text-gray-700 dark:text-gray-300 mb-10">
          Open roles at organizations in the Mox community.
          {totalRoles > 0 &&
            ` ${totalRoles} open role${totalRoles === 1 ? '' : 's'}.`}
        </p>

        {loadError ? (
          <p className="text-gray-600 dark:text-gray-400">
            Couldn&apos;t load roles right now — try again in a minute.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            No open roles listed yet — check back soon.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.name} className="mb-10">
              <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-white mb-3">
                {group.name}
              </h2>
              <div className="grid gap-4 items-start md:grid-cols-2 xl:grid-cols-3">
                {group.roles.map((role) => (
                  <RoleCard key={role.id} role={role} group={group} />
                ))}
              </div>
            </section>
          ))
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-12">
          Hiring at a Mox org and missing from this list? Ping{' '}
          <a
            href="mailto:team@moxsf.com"
            className="text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
          >
            team@moxsf.com
          </a>
          .
        </p>
      </main>
    </div>
  )
}
