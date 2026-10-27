import type Stripe from 'stripe'
import { findRecords, Tables } from '../lib/airtable'
import { stripe } from '../lib/stripe'

/**
 * Active-member roster, cross-referencing Airtable People with Stripe.
 *
 * A person counts as active when either:
 *   - they have a live (active / trialing / past_due) Stripe subscription
 *     that is not paused and not scheduled to cancel, or
 *   - their Airtable Tier is "Private Office" and they belong to an Org
 *     whose Status is "Joined" (an active office), regardless of Stripe, or
 *   - they're a Joined participant in a current fellowship (CURRENT_PROGRAMS).
 *
 * Tier comes from the Stripe product for personal payers (Stripe is the
 * source of truth for what someone is paying for), and from Airtable for
 * office members. Visit frequencies are what each plan entitles, not a
 * measurement — door data isn't reliable enough to count visits.
 */

export type MemberTier = 'Private Office' | 'Resident' | 'Core' | 'Friend' | 'Program'

// Fellowships currently in residence. Participants count in the Office +
// Resident group. Matched on the Airtable Programs name (like
// PINNED_PROGRAMS in people.ts), so update this when a cohort starts or
// wraps up — Programs has no reliable "current" flag (Sentient Futures
// Residency is still Confirmed with no end date).
export const CURRENT_PROGRAMS = ['Surplus', 'Frame Fellowship #2']

// Cohorts whose roster isn't linked in Airtable yet. Counted in the stats
// and shown as a headcount-only group; drop the entry once the People are
// linked to the program (linked Joined fellows take precedence).
export const PLACEHOLDER_PROGRAMS: { name: string; count: number; rooms?: string[] }[] = [
  { name: 'Frame Fellowship #2', count: 10 },
]

export type ActiveMember = {
  id: string
  name: string
  tier: MemberTier
  /** Names of active offices (Orgs with Status "Joined") this person belongs to */
  orgs: string[]
  /** Names of current fellowships (CURRENT_PROGRAMS) this person is in */
  programs: string[]
  /** Room numbers for those offices / programs */
  rooms: string[]
  website: string
  photoUrl: string | null
  /** Airtable "Show in directory" — false means count but don't list by name */
  listed: boolean
  /** Why they're here: paying personally, covered by an office, or a fellow */
  via: 'stripe' | 'office' | 'program'
}

export type TierGroup = {
  key: 'office' | 'core' | 'friend'
  title: string
  /** Plan entitlement, e.g. "20+ visits/mo" */
  entitlement: string
  members: ActiveMember[]
  /** Headcount-only cohorts (PLACEHOLDER_PROGRAMS) with no roster in Airtable */
  placeholders: { name: string; count: number; rooms: string[] }[]
  /** members.length plus placeholder headcounts */
  count: number
}

export type ActiveMembersData = {
  groups: TierGroup[]
  total: number
  activeOffices: number
  /** Current fellowships with at least one Joined participant */
  activePrograms: number
  /** Members counted in the stats but not named (opted out of the directory) */
  unlisted: number
  generatedAt: string
}

interface PersonFields {
  Name?: string
  Tier?: string
  Status?: string
  Org?: string[]
  Program?: string[]
  Website?: string
  Photo?: any[]
  'Show in directory'?: boolean
  'Stripe Customer ID'?: string
}

interface OrgFields {
  Name?: string
  Status?: string
  'Room #'?: string[]
}

interface ProgramFields {
  Name?: string
  'Room #'?: string[]
}

const LIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due']

type StripeState =
  | { kind: 'none' }
  | { kind: 'paused' }
  | { kind: 'ending' }
  | { kind: 'active'; tier: MemberTier | null }

// Map a Stripe product name like "Mox Membership - Core" to a tier.
function tierFromProductName(name: string): MemberTier | null {
  const n = name.toLowerCase()
  if (n.includes('office')) return 'Private Office'
  if (n.includes('resident')) return 'Resident'
  if (n.includes('core')) return 'Core'
  if (n.includes('friend')) return 'Friend'
  return null
}

function tierFromAirtable(tier?: string): MemberTier | null {
  switch (tier) {
    case 'Private Office':
    case 'Resident':
    case 'Core':
    case 'Friend':
      return tier
    default:
      return null
  }
}

/** Fetch every subscription once and index by customer — far cheaper than
 *  one Stripe call per person. */
async function loadStripeStates(): Promise<Map<string, StripeState>> {
  const byCustomer = new Map<string, Stripe.Subscription[]>()
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    const cid = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    byCustomer.set(cid, [...(byCustomer.get(cid) || []), sub])
  }

  // Resolve product names (a handful of products, cached across customers)
  const productNames = new Map<string, string>()
  async function productName(id: string): Promise<string> {
    if (!productNames.has(id)) {
      const product = await stripe.products.retrieve(id)
      productNames.set(id, product.name)
    }
    return productNames.get(id)!
  }

  const states = new Map<string, StripeState>()
  for (const [cid, subs] of byCustomer) {
    const live = subs.find((s) => LIVE_STATUSES.includes(s.status))
    if (!live) {
      states.set(cid, { kind: 'none' })
    } else if (live.pause_collection) {
      states.set(cid, { kind: 'paused' })
    } else if (live.cancel_at_period_end) {
      states.set(cid, { kind: 'ending' })
    } else {
      const product = live.items.data[0]?.price?.product
      const productId = typeof product === 'string' ? product : product?.id
      const tier = productId ? tierFromProductName(await productName(productId)) : null
      states.set(cid, { kind: 'active', tier })
    }
  }
  return states
}

export async function getActiveMembers(): Promise<ActiveMembersData> {
  const [people, orgs, programs, stripeStates] = await Promise.all([
    findRecords<PersonFields>(Tables.People, '', {
      fields: [
        'Name', 'Tier', 'Status', 'Org', 'Program', 'Website', 'Photo',
        'Show in directory', 'Stripe Customer ID',
      ],
    }),
    findRecords<OrgFields>(Tables.Orgs, '', { fields: ['Name', 'Status', 'Room #'] }),
    findRecords<ProgramFields>(Tables.Programs, '', { fields: ['Name', 'Room #'] }),
    loadStripeStates(),
  ])

  const activeOrgs = new Map(
    orgs
      .filter((o) => o.fields.Status === 'Joined')
      .map((o) => [o.id, { name: o.fields.Name || '', rooms: o.fields['Room #'] || [] }])
  )

  const currentPrograms = new Map(
    programs
      .filter((p) => CURRENT_PROGRAMS.includes(p.fields.Name || ''))
      .map((p) => [p.id, { name: p.fields.Name || '', rooms: p.fields['Room #'] || [] }])
  )

  const members: ActiveMember[] = []
  for (const record of people) {
    const f = record.fields
    const customerId = (f['Stripe Customer ID'] || '').trim()
    const stripeState: StripeState = customerId
      ? stripeStates.get(customerId) || { kind: 'none' }
      : { kind: 'none' }
    type Group = { name: string; rooms: string[] }
    const personOrgs = (f.Org || []).map((id) => activeOrgs.get(id)).filter(Boolean) as Group[]
    const personPrograms = (f.Program || [])
      .map((id) => currentPrograms.get(id))
      .filter(Boolean) as Group[]

    // Office and fellowship come first: someone covered by either is in the
    // building full-time even if they also carry a personal subscription.
    let tier: MemberTier | null = null
    let via: ActiveMember['via'] | null = null
    if (personOrgs.length > 0 && f.Tier === 'Private Office') {
      tier = 'Private Office'
      via = 'office'
    } else if (personPrograms.length > 0 && f.Status === 'Joined') {
      // Fellows don't pay through Stripe, so Status is the only signal that
      // they're still in the cohort (dropouts get marked Cancelled).
      tier = 'Program'
      via = 'program'
    } else if (stripeState.kind === 'active') {
      tier = stripeState.tier ?? tierFromAirtable(f.Tier)
      via = 'stripe'
    }
    if (!tier || !via) continue

    members.push({
      id: record.id,
      name: f.Name || '',
      tier,
      orgs: personOrgs.map((o) => o.name),
      programs: personPrograms.map((p) => p.name),
      rooms: [...personOrgs, ...personPrograms].flatMap((g) => g.rooms),
      website: f.Website || '',
      photoUrl: f.Photo?.[0]?.thumbnails?.large?.url || null,
      listed: !!f['Show in directory'],
      via,
    })
  }

  const byName = (a: ActiveMember, b: ActiveMember) => a.name.localeCompare(b.name)
  const office = members
    .filter((m) => ['Private Office', 'Resident', 'Program'].includes(m.tier))
    .sort((a, b) => {
      // Grouped by office / fellowship name, then residents, then independents
      const ao = a.orgs[0] || a.programs[0] || (a.tier === 'Resident' ? '~resident' : '~~')
      const bo = b.orgs[0] || b.programs[0] || (b.tier === 'Resident' ? '~resident' : '~~')
      return ao.localeCompare(bo) || byName(a, b)
    })
  const core = members.filter((m) => m.tier === 'Core').sort(byName)
  const friend = members.filter((m) => m.tier === 'Friend').sort(byName)

  // Placeholder cohorts only apply while nobody is linked to that program.
  const linkedPrograms = new Set(office.flatMap((m) => m.programs))
  const placeholders = PLACEHOLDER_PROGRAMS.filter((p) => !linkedPrograms.has(p.name)).map(
    (p) => ({ name: p.name, count: p.count, rooms: p.rooms || [] })
  )
  const placeholderCount = placeholders.reduce((n, p) => n + p.count, 0)

  const groups: TierGroup[] = [
    {
      key: 'office', title: 'Office + Resident + Fellow', entitlement: '20+ visits/mo',
      members: office, placeholders, count: office.length + placeholderCount,
    },
    { key: 'core', title: 'Core', entitlement: '10+ visits/mo', members: core, placeholders: [], count: core.length },
    { key: 'friend', title: 'Friend', entitlement: '2+ visits/mo', members: friend, placeholders: [], count: friend.length },
  ]

  return {
    groups,
    total: members.length + placeholderCount,
    activeOffices: new Set(office.flatMap((m) => m.orgs)).size,
    activePrograms: linkedPrograms.size + placeholders.length,
    unlisted: members.filter((m) => !m.listed).length,
    generatedAt: new Date().toISOString(),
  }
}
