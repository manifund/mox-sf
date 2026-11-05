import { findRecords, Tables } from '../lib/airtable'

export type Person = {
  id: string
  name: string
  tier: string | null
  org: string[]
  program: string[]
  website: string
  photo: any[] | null
  workThing: string | null
  workThingUrl: string | null
  funThing: string | null
  funThingUrl: string | null
}

export type Org = {
  id: string
  name: string
  stealth: boolean
  rooms: string[]
  // Org Status is "Joined" — i.e. a current tenant, not a reachout/left org
  active: boolean
}

export type Program = {
  id: string
  name: string
  rooms: string[]
}

export type Staff = {
  id: string
  title: string
  email: string
  contactFor: string[]
  rank: number
  person: Person | null
}

interface PersonFields {
  Name?: string
  Tier?: string
  Org?: string[]
  Program?: string[]
  Website?: string
  Photo?: any[]
  'Work thing'?: string
  'Work thing URL'?: string
  'Fun thing'?: string
  'Fun thing URL'?: string
}

export async function getPeople(): Promise<Person[]> {
  const records = await findRecords<PersonFields>(
    Tables.People,
    'AND({Show in directory}=TRUE(), {Status}="Joined")',
    { revalidate: 300 }
  )

  return records.map((record) => ({
    id: record.id,
    name: record.fields.Name || '',
    tier: record.fields.Tier || null,
    org: record.fields.Org || [],
    program: record.fields.Program || [],
    website: record.fields.Website || '',
    photo: record.fields.Photo || [],
    workThing: record.fields['Work thing'] || null,
    workThingUrl: record.fields['Work thing URL'] || null,
    funThing: record.fields['Fun thing'] || null,
    funThingUrl: record.fields['Fun thing URL'] || null,
  }))
}

export function formatUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

// Helper functions for filtering and sorting people

export function hasPhoto(person: Person): boolean {
  return !!person.photo?.[0]?.thumbnails?.large
}

export function hasText(person: Person): boolean {
  return !!(person.workThing || person.funThing)
}

export function filterPeople(
  people: Person[],
  filter?: string
): Person[] {
  if (filter === 'with-info') {
    return people.filter(hasText)
  } else if (filter === 'with-photo') {
    return people.filter(hasPhoto)
  } else if (filter === 'complete') {
    return people.filter((p) => hasText(p) && hasPhoto(p))
  }
  return people
}

export function sortPeopleByCompleteness(people: Person[]): Person[] {
  return [...people].sort((a, b) => {
    const aHasPhoto = hasPhoto(a)
    const bHasPhoto = hasPhoto(b)
    const aHasText = hasText(a)
    const bHasText = hasText(b)
    const aHasOrg = a.org && a.org.length > 0
    const bHasOrg = b.org && b.org.length > 0

    // Score: 3 = both photo+text, 2 = photo or text, 1 = org only, 0 = nothing
    const aScore =
      aHasPhoto && aHasText ? 3 : aHasPhoto || aHasText ? 2 : aHasOrg ? 1 : 0
    const bScore =
      bHasPhoto && bHasText ? 3 : bHasPhoto || bHasText ? 2 : bHasOrg ? 1 : 0

    if (aScore !== bScore) return bScore - aScore // Higher score first
    return a.name.localeCompare(b.name) // Then alphabetically
  })
}

// Fetch all orgs with their room numbers
interface OrgFields {
  Name?: string
  Stealth?: boolean
  'Room #'?: string[]
  Status?: string
}

export async function getOrgs(): Promise<Map<string, Org>> {
  const records = await findRecords<OrgFields>(Tables.Orgs, '', {
    fields: ['Name', 'Stealth', 'Room #', 'Status'],
    revalidate: 300,
  })

  const orgsMap = new Map<string, Org>()
  for (const record of records) {
    orgsMap.set(record.id, {
      id: record.id,
      name: record.fields.Name || '',
      stealth: record.fields.Stealth || false,
      rooms: record.fields['Room #'] || [],
      active: record.fields.Status === 'Joined',
    })
  }
  return orgsMap
}

interface StaffFields {
  Title?: string
  'Main Record'?: string[]
  'Staff Email'?: string
  'Contact for'?: string[]
  Rank?: number
}

export async function getStaff(people: Person[]): Promise<Staff[]> {
  const records = await findRecords<StaffFields>(Tables.Staff, '', {
    revalidate: 300,
  })
  const peopleById = new Map(people.map((p) => [p.id, p]))

  return records.map((record) => {
    const personId = record.fields['Main Record']?.[0]
    return {
      id: record.id,
      title: record.fields.Title || '',
      email: record.fields['Staff Email'] || '',
      contactFor: record.fields['Contact for'] || [],
      rank: record.fields.Rank ?? 999,
      person: personId ? peopleById.get(personId) || null : null,
    }
  })
}

// Fetch all programs with their room numbers
interface ProgramFields {
  Name?: string
  'Room #'?: string[]
}

export async function getPrograms(): Promise<Map<string, Program>> {
  const records = await findRecords<ProgramFields>(Tables.Programs, '', {
    fields: ['Name', 'Room #'],
    revalidate: 300,
  })

  const programsMap = new Map<string, Program>()
  for (const record of records) {
    programsMap.set(record.id, {
      id: record.id,
      name: record.fields.Name || '',
      rooms: record.fields['Room #'] || [],
    })
  }
  return programsMap
}

// Programs pinned to the top of the directory's Programs section, in this
// order. Anything not listed keeps the default size-then-alphabetical sort.
// Matched on the Airtable program name, so renaming a program here means
// renaming it in Airtable too.
const PINNED_PROGRAMS = ['Surplus']

// Finished programs we no longer surface in the directory. Their Airtable
// rows and participant rosters are left untouched — members of a hidden
// program simply fall through into the regular Members section.
const HIDDEN_PROGRAMS = ['FLF Fellowship', 'Seldon Batch 2']

// Build sections data from people, orgs, and programs for DirectoryClient
export function buildDirectoryData(
  people: Person[],
  orgsMap: Map<string, Org>,
  programsMap: Map<string, Program>,
  staffEntries: Staff[] = []
) {
  const staffByPersonId = new Map(
    staffEntries.filter((s) => s.person).map((s) => [s.person!.id, s])
  )

  const staff = [...staffEntries]
    .filter((s) => s.person)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return (a.person?.name || '').localeCompare(b.person?.name || '')
    })

  // Orgs that currently rent an office at Mox. Anyone linked to one of these
  // belongs in the Offices section, whatever their Tier says — tiers drift
  // (e.g. an office employee left on "Core"), and that shouldn't split a
  // company's team across sections. Stealth orgs are excluded so their
  // members keep falling through to the regular sections, same as before.
  const officeOrgIds = new Set(
    Array.from(orgsMap.values())
      .filter((org) => org.active && !org.stealth && org.rooms.length > 0)
      .map((org) => org.id)
  )
  const inOffice = (p: Person) =>
    p.tier === 'Private Office' ||
    (!!p.org?.[0] && officeOrgIds.has(p.org[0]))

  const privateOffices = sortPeopleByCompleteness(
    people.filter(
      (p) =>
        p.tier !== 'Staff' && !staffByPersonId.has(p.id) && inOffice(p)
    )
  )
  const members = sortPeopleByCompleteness(
    people.filter(
      (p) =>
        p.tier !== 'Staff' &&
        !staffByPersonId.has(p.id) &&
        !inOffice(p)
    )
  )

  // Group private offices by org (excluding stealth)
  const officesByOrg = new Map<string, { name: string; rooms: string[]; people: Person[] }>()
  privateOffices.forEach((person) => {
    const orgId = person.org?.[0] || 'independent'
    const org = orgsMap.get(orgId)
    if (org?.stealth) return
    if (!officesByOrg.has(orgId)) {
      officesByOrg.set(orgId, { name: org?.name || 'Independent', rooms: org?.rooms || [], people: [] })
    }
    officesByOrg.get(orgId)!.people.push(person)
  })

  // Group members by program
  const programGroups = new Map<string, { name: string; rooms: string[]; people: Person[] }>()
  const membersWithoutProgram: Person[] = []
  members.forEach((person) => {
    const programId = person.program?.[0]
    const program = programId ? programsMap.get(programId) : undefined
    if (programId && !(program && HIDDEN_PROGRAMS.includes(program.name))) {
      if (!programGroups.has(programId)) {
        programGroups.set(programId, { name: program?.name || 'Program', rooms: program?.rooms || [], people: [] })
      }
      programGroups.get(programId)!.people.push(person)
    } else {
      membersWithoutProgram.push(person)
    }
  })

  // Sort by size then alphabetically
  const sortGroups = (a: { name: string; people: Person[] }, b: { name: string; people: Person[] }) =>
    b.people.length !== a.people.length ? b.people.length - a.people.length : a.name.localeCompare(b.name)

  // Pinned programs lead, in PINNED_PROGRAMS order; the rest fall back to the
  // shared size-then-alphabetical sort.
  const pinnedRank = (name: string) => {
    const i = PINNED_PROGRAMS.indexOf(name)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }

  const sortedOrgs = Array.from(officesByOrg.entries()).sort(([, a], [, b]) => sortGroups(a, b))
  const sortedPrograms = Array.from(programGroups.entries()).sort(([, a], [, b]) => {
    const rankA = pinnedRank(a.name)
    const rankB = pinnedRank(b.name)
    if (rankA !== rankB) return rankA - rankB
    return sortGroups(a, b)
  })

  // Convert maps to plain objects for client component
  const orgsLookup: Record<string, { name: string }> = {}
  orgsMap.forEach((org, id) => { orgsLookup[id] = { name: org.name } })

  const programsLookup: Record<string, { name: string }> = {}
  programsMap.forEach((program, id) => { programsLookup[id] = { name: program.name } })

  const sections = [
    { type: 'staff-section' as const, title: 'Staff', staff },
    { type: 'grouped-section' as const, title: 'Programs', groups: sortedPrograms.map(([id, g]) => ({ id, ...g })) },
    { type: 'grouped-section' as const, title: 'Offices', groups: sortedOrgs.map(([id, g]) => ({ id, ...g })) },
    { type: 'person-section' as const, title: 'Members', people: membersWithoutProgram, affiliationType: 'both' as const },
  ]

  return { sections, orgsLookup, programsLookup }
}
