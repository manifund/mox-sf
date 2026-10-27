'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Person, Staff, formatUrl } from './people'

function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h % 360
}

type DirectoryClientProps = {
  sections: {
    type: 'person-section' | 'grouped-section' | 'staff-section'
    title: string
    people?: Person[]
    groups?: {
      id: string
      name: string
      rooms?: string[]
      people: Person[]
    }[]
    staff?: Staff[]
    affiliationType?: 'org' | 'both'
  }[]
  orgsLookup: Record<string, { name: string }>
  programsLookup: Record<string, { name: string }>
  memberCount: number
  filter?: string
  isHomepage?: boolean
}

export default function DirectoryClient({
  sections,
  orgsLookup,
  programsLookup,
  memberCount,
  filter,
  isHomepage,
}: DirectoryClientProps) {
  const [collapsed, setCollapsed] = useState(false)

  const getAffiliation = (
    person: Person,
    affiliationType?: 'org' | 'both'
  ): string | undefined => {
    if (!affiliationType) return undefined

    const orgNames = person.org
      .map((id) => orgsLookup[id]?.name)
      .filter(Boolean)

    if (affiliationType === 'org') {
      return orgNames.length > 0 ? orgNames.join(' · ') : undefined
    }

    // 'both' - include programs too
    const programNames = person.program
      .map((id) => programsLookup[id]?.name)
      .filter(Boolean)
    const all = [...orgNames, ...programNames]
    return all.length > 0 ? all.join(' · ') : undefined
  }

  const toggleButton = (
    <button onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? 'show details' : 'collapse details'}
    </button>
  )

  return (
    <>
      {/* Title row with toggle */}
      <div className="directory-title-row">
        <h1>Humans of Mox</h1>
        <div className="directory-toggle">
          {toggleButton}
        </div>
      </div>
        <p className="muted">
          {memberCount} members
          {filter && ` matching "${filter}"`}
        </p>

      {sections.map((section, idx) => {
        if (section.type === 'staff-section' && section.staff) {
          if (section.staff.length === 0) return null
          return (
            <div key={idx} className="directory-section">
              <h2 className="section-title">{section.title}</h2>
              {collapsed ? (
                <CollapsedList
                  people={section.staff.map((s) => s.person!).filter(Boolean)}
                />
              ) : (
                <div className="directory-list staff-list">
                  {section.staff.map((s) => (
                    <StaffEntry key={s.id} entry={s} />
                  ))}
                </div>
              )}
            </div>
          )
        }

        if (section.type === 'person-section' && section.people) {
          if (section.people.length === 0) return null
          return (
            <div key={idx} className="directory-section">
              <h2 className="section-title">{section.title}</h2>
              {collapsed ? (
                <CollapsedList people={section.people} />
              ) : (
                <div className="directory-list">
                  {section.people.map((person) => (
                    <PersonEntry
                      key={person.id}
                      person={person}
                      affiliation={getAffiliation(person, section.affiliationType)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }

        if (section.type === 'grouped-section' && section.groups) {
          if (section.groups.length === 0) return null
          return (
            <div key={idx} className="directory-section">
              <h2 className="section-title">{section.title}</h2>
              {section.groups.map((group) => {
                if (group.people.length === 0) return null
                const roomText =
                  group.rooms && group.rooms.length > 0
                    ? group.rooms.join(', ')
                    : null

                return (
                  <div
                    key={group.id}
                    className="directory-section program-section"
                  >
                    <div className="program-header">
                      <h3 className="program-title">{group.name}</h3>
                      {roomText && (
                        <span className="program-room">
                          {group.rooms && group.rooms.length > 1 ? 'Rooms' : 'Room'} {roomText}
                        </span>
                      )}
                    </div>
                    {collapsed ? (
                      <CollapsedList people={group.people} />
                    ) : (
                      <div className="directory-list">
                        {group.people.map((person) => (
                          <PersonEntry key={person.id} person={person} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        }

        return null
      })}
    </>
  )
}

function CollapsedList({ people }: { people: Person[] }) {
  return (
    <div className="collapsed-list">
      {people.map((person) => {
        // Source from the large thumbnail: Airtable's "small" is only 36px
        // tall, which next/image downscales into a visibly soft avatar on
        // retina. Names without a photo just render on their own, no
        // placeholder.
        const thumbs = person.photo?.[0]?.thumbnails
        const photoUrl =
          thumbs?.large?.url ?? thumbs?.full?.url ?? thumbs?.small?.url ?? null

        const content = (
          <>
            {photoUrl && (
              <Image
                src={photoUrl}
                alt=""
                width={56}
                height={56}
                sizes="28px"
                className="collapsed-photo"
              />
            )}
            {person.name}
          </>
        )

        if (person.website) {
          return (
            <Link
              key={person.id}
              href={formatUrl(person.website)}
              target="_blank"
              className="collapsed-name"
            >
              {content}
            </Link>
          )
        }
        return (
          <span key={person.id} className="collapsed-name">
            {content}
          </span>
        )
      })}
    </div>
  )
}

function StaffEntry({ entry }: { entry: Staff }) {
  const person = entry.person
  if (!person) return null
  const { url } = person.photo?.[0]?.thumbnails?.full ?? person.photo?.[0]?.thumbnails?.large ?? { url: null }
  const initials = person.name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')

  return (
    <div className="person-entry staff-entry">
      <div className="person-photo">
        {url ? (
          <Image
            src={url}
            alt={person.name}
            width={180}
            height={180}
            sizes="180px"
            className="photo-img"
          />
        ) : (
          <div className="photo-placeholder">{initials}</div>
        )}
      </div>
      <div className="person-info">
        {entry.title && <div className="staff-title">{entry.title}</div>}
        <div className="person-main">
          <span className="person-name">
            {person.website ? (
              <Link href={formatUrl(person.website)} target="_blank">
                {person.name}
              </Link>
            ) : (
              person.name
            )}
          </span>

          {(person.workThing || person.funThing) && (
            <>
              <span className="into-text"> is into </span>
              {person.workThing && (
                <>
                  {person.workThingUrl ? (
                    <Link
                      href={formatUrl(person.workThingUrl)}
                      target="_blank"
                      className="interest work"
                    >
                      {person.workThing}
                    </Link>
                  ) : (
                    <span className="interest work">{person.workThing}</span>
                  )}
                </>
              )}
              {person.workThing && person.funThing && (
                <span className="and-text"> and </span>
              )}
              {person.funThing && (
                <>
                  {person.funThingUrl ? (
                    <Link
                      href={formatUrl(person.funThingUrl)}
                      target="_blank"
                      className="interest fun"
                    >
                      {person.funThing}
                    </Link>
                  ) : (
                    <span className="interest fun">{person.funThing}</span>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {entry.contactFor.length > 0 && (
          <div className="staff-contact-for">
            <span className="staff-contact-label">contact for:</span>
            {entry.contactFor.map((tag) => {
              const hue = hashHue(tag)
              return (
                <span
                  key={tag}
                  className="staff-contact-tag"
                  style={{
                    background: `hsl(${hue} 70% 92%)`,
                    color: `hsl(${hue} 60% 28%)`,
                    borderColor: `hsl(${hue} 60% 75%)`,
                  }}
                >
                  {tag}
                </span>
              )
            })}
          </div>
        )}
        {entry.email && (
          <div className="staff-email-row">
            <a href={`mailto:${entry.email}`} className="staff-email">
              <Mail className="staff-email-icon" size={16} aria-hidden="true" />
              {entry.email}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function PersonEntry({
  person,
  affiliation,
}: {
  person: Person
  affiliation?: string
}) {
  const { url } = person.photo?.[0]?.thumbnails?.full ?? person.photo?.[0]?.thumbnails?.large ?? { url: null }
  const hasContent = url || person.workThing || person.funThing

  // Get initials from name
  const initials = person.name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')

  return (
    <div className={`person-entry ${!hasContent ? 'person-entry-compact' : ''}`}>
      <div className="person-photo">
        {url ? (
          <Image
            src={url}
            alt={person.name}
            width={180}
            height={180}
            sizes="180px"
            className="photo-img"
          />
        ) : (
          <div className="photo-placeholder">{initials}</div>
        )}
      </div>
      <div className="person-info">
        {affiliation && (
          <div className="person-affiliation">{affiliation}</div>
        )}
        <div className="person-main">
          <span className="person-name">
            {person.website ? (
              <Link href={formatUrl(person.website)} target="_blank">
                {person.name}
              </Link>
            ) : (
              person.name
            )}
          </span>
          {(person.workThing || person.funThing) && (
            <>
              <span className="into-text"> is into </span>
              {person.workThing && (
                <>
                  {person.workThingUrl ? (
                    <Link
                      href={formatUrl(person.workThingUrl)}
                      target="_blank"
                      className="interest work"
                    >
                      {person.workThing}
                    </Link>
                  ) : (
                    <span className="interest work">{person.workThing}</span>
                  )}
                </>
              )}
              {person.workThing && person.funThing && (
                <span className="and-text"> and </span>
              )}
              {person.funThing && (
                <>
                  {person.funThingUrl ? (
                    <Link
                      href={formatUrl(person.funThingUrl)}
                      target="_blank"
                      className="interest fun"
                    >
                      {person.funThing}
                    </Link>
                  ) : (
                    <span className="interest fun">{person.funThing}</span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
