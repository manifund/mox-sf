import { findRecords, Tables } from './airtable'

/**
 * Careers data: self-reported job-seeking/hiring signals and the Roles board.
 *
 * PRIVACY: Job status, Hiring, LinkedIn, and Career notes on People are
 * STAFF-ONLY. They must never be rendered in the directory, on public pages,
 * or to other members — staff use them to make intros by hand.
 */

export const JOB_STATUSES = [
  'Looking now',
  'Open to offers',
  'Not looking',
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export interface CareerPersonFields {
  Name?: string
  Email?: string
  Tier?: string
  Org?: string[]
  'Job status'?: string
  Hiring?: boolean
  LinkedIn?: string
  'Career notes'?: string
  'Work thing'?: string
  Website?: string
}

export interface CareerPerson {
  id: string
  name: string
  email: string | null
  tier: string | null
  orgIds: string[]
  jobStatus: string | null
  hiring: boolean
  linkedin: string | null
  careerNotes: string | null
  workThing: string | null
  website: string | null
}

function toCareerPerson(record: {
  id: string
  fields: CareerPersonFields
}): CareerPerson {
  return {
    id: record.id,
    name: record.fields.Name || '(no name)',
    email: record.fields.Email || null,
    tier: record.fields.Tier || null,
    orgIds: record.fields.Org || [],
    jobStatus: record.fields['Job status'] || null,
    hiring: record.fields.Hiring || false,
    linkedin: record.fields.LinkedIn || null,
    careerNotes: record.fields['Career notes'] || null,
    workThing: record.fields['Work thing'] || null,
    website: record.fields.Website || null,
  }
}

const CAREER_PERSON_FIELDS = [
  'Name',
  'Email',
  'Tier',
  'Org',
  'Job status',
  'Hiring',
  'LinkedIn',
  'Career notes',
  'Work thing',
  'Website',
]

/** People who marked themselves Looking now or Open to offers. Staff-only data. */
export async function getJobSeekers(): Promise<CareerPerson[]> {
  const records = await findRecords<CareerPersonFields>(
    Tables.People,
    `OR({Job status}="Looking now", {Job status}="Open to offers")`,
    { fields: CAREER_PERSON_FIELDS }
  )
  return records
    .map(toCareerPerson)
    .sort((a, b) =>
      a.jobStatus === b.jobStatus
        ? a.name.localeCompare(b.name)
        : a.jobStatus === 'Looking now'
          ? -1
          : 1
    )
}

/** People who checked "I'm hiring". Staff-only data. */
export async function getHiringPeople(): Promise<CareerPerson[]> {
  const records = await findRecords<CareerPersonFields>(
    Tables.People,
    `{Hiring}=TRUE()`,
    { fields: CAREER_PERSON_FIELDS }
  )
  return records
    .map(toCareerPerson)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface HiringOrgFields {
  Name?: string
  Hiring?: boolean
  'Careers URL'?: string
  Stealth?: boolean
}

export interface HiringOrg {
  id: string
  name: string
  hiring: boolean
  careersUrl: string | null
  stealth: boolean
}

/** Orgs flagged as hiring or with a careers page configured. */
export async function getHiringOrgs(): Promise<HiringOrg[]> {
  const records = await findRecords<HiringOrgFields>(
    Tables.Orgs,
    `OR({Hiring}=TRUE(), {Careers URL}!="")`,
    { fields: ['Name', 'Hiring', 'Careers URL', 'Stealth'] }
  )
  return records
    .map((record) => ({
      id: record.id,
      name: record.fields.Name || '(no name)',
      hiring: record.fields.Hiring || false,
      careersUrl: record.fields['Careers URL'] || null,
      stealth: record.fields.Stealth || false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface RoleFields {
  Title?: string
  Org?: string[]
  Company?: string
  URL?: string
  Location?: string
  Tags?: string[]
  Status?: string
  Source?: string
  Posted?: string
  'Last verified'?: string
  Notes?: string
  Description?: string
  Salary?: string
  Deadline?: string
}

export interface OpenRole {
  id: string
  title: string
  orgId: string | null
  company: string | null
  url: string | null
  location: string | null
  tags: string[]
  posted: string | null
  description: string | null
  salary: string | null
  deadline: string | null
}

/** Roles with Status = Open, for the /jobs board. Public data. */
export async function getOpenRoles(
  options: { revalidate?: number } = {}
): Promise<OpenRole[]> {
  const records = await findRecords<RoleFields>(
    Tables.Roles,
    `{Status}="Open"`,
    {
      fields: [
        'Title',
        'Org',
        'Company',
        'URL',
        'Location',
        'Tags',
        'Posted',
        'Description',
        'Salary',
        'Deadline',
      ],
      ...(options.revalidate ? { revalidate: options.revalidate } : {}),
    }
  )
  return records.map((record) => ({
    id: record.id,
    title: record.fields.Title || '(untitled role)',
    orgId: record.fields.Org?.[0] || null,
    company: record.fields.Company || null,
    url: record.fields.URL || null,
    location: record.fields.Location || null,
    tags: record.fields.Tags || [],
    posted: record.fields.Posted || null,
    description: record.fields.Description || null,
    salary: record.fields.Salary || null,
    deadline: record.fields.Deadline || null,
  }))
}

export interface JobsOrgInfo {
  name: string
  stealth: boolean
  about: string | null
}

/** Org names + public blurbs for the /jobs board. */
export async function getJobsOrgInfo(): Promise<Map<string, JobsOrgInfo>> {
  const records = await findRecords<HiringOrgFields & { About?: string }>(
    Tables.Orgs,
    '',
    { fields: ['Name', 'Stealth', 'About'], revalidate: 300 }
  )
  const map = new Map<string, JobsOrgInfo>()
  for (const record of records) {
    map.set(record.id, {
      name: record.fields.Name || '(no name)',
      stealth: record.fields.Stealth || false,
      about: record.fields.About || null,
    })
  }
  return map
}
