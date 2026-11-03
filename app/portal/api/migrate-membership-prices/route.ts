import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { requireStaff } from '@/app/lib/session'
import { stripe } from '@/app/lib/stripe'
import { sendEmail } from '@/app/lib/email'
import { findRecords, updateRecord, Tables } from '@/app/lib/airtable'
import {
  addMemberToForkable,
  FORKABLE_CLUBS,
  parseFullName,
} from '@/app/lib/forkable'
import { MEMBERSHIP_TIERS, chargeCents } from '@/app/lib/membership-pricing'
import {
  MIGRATABLE_STATUSES,
  decideMigration,
  formatReport,
  snapshotSubscription,
  summarize,
  type AirtablePerson,
  type MigrationRow,
  type TargetPrice,
} from '@/app/lib/membership-price-migration'

export const maxDuration = 300

const REPORT_TO = 'team@moxsf.com'

// Staff-only one-off: move existing month-to-month Core/Resident subscriptions
// onto the Nov 1, 2026 monthly prices. With `friends=true` it also moves
// retired Friend subscriptions onto Core monthly (which sets Airtable Tier =
// Core and adds the member to Forkable); without it Friend rows are skipped,
// so the price increase and the Friend → Core move can run on different days.
// Dry run unless `apply=true`. See docs/workflows/price-migration.md.
//
// GET  — always a dry run (safe to open in a browser); ?friends=true previews
//        the Friend pass too
// POST — dry run unless ?apply=true (or {"apply": true} in the JSON body);
//        ?friends=true / {"friends": true} includes Friend → Core

export async function GET(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return run({
    apply: false,
    friends: request.nextUrl.searchParams.get('friends') === 'true',
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const params = request.nextUrl.searchParams
  const body = await request.json().catch(() => null)
  const apply = params.get('apply') === 'true' || body?.apply === true
  const friends = params.get('friends') === 'true' || body?.friends === true
  return run({ apply, friends })
}

/** Resolve the new monthly price for every tier by lookup_key, refusing to
 *  proceed if any is missing or charges something other than
 *  membership-pricing.ts says. A mass migration onto a wrong price is far
 *  worse than a checkout showing a stale number, so this is an error here
 *  where membership-checkout only warns. */
async function loadTargetPrices(): Promise<
  { ok: true; targets: Map<string, TargetPrice> } | { ok: false; error: string }
> {
  const tiers = Object.values(MEMBERSHIP_TIERS)
  const prices = await stripe.prices.list({
    lookup_keys: tiers.map((t) => t.stripeLookupKeys.monthly),
    active: true,
    limit: 100,
  })
  const targets = new Map<string, TargetPrice>()
  for (const price of prices.data) {
    if (!price.lookup_key) continue
    targets.set(price.lookup_key, {
      id: price.id,
      lookupKey: price.lookup_key,
      unitAmount: price.unit_amount,
      currency: price.currency,
    })
  }
  for (const tier of tiers) {
    const key = tier.stripeLookupKeys.monthly
    const target = targets.get(key)
    if (!target) {
      return {
        ok: false,
        error: `No active Stripe price with lookup_key ${key}`,
      }
    }
    const expected = chargeCents(tier, 'monthly')
    if (target.unitAmount !== expected || target.currency !== 'usd') {
      return {
        ok: false,
        error: `Price ${target.id} (${key}) charges ${target.unitAmount} ${target.currency} but membership-pricing.ts expects ${expected} usd`,
      }
    }
  }
  return { ok: true, targets }
}

interface PersonFields {
  Name?: string
  Email?: string
  Tier?: string
  Status?: string
  'Stripe Customer ID'?: string
}

/** Every People record with a Stripe customer id, keyed by that id. Friend
 *  rows are only migrated when Airtable agrees they are a live Friend. */
async function loadAirtablePeople(): Promise<Map<string, AirtablePerson>> {
  const records = await findRecords<PersonFields>(
    Tables.People,
    "{Stripe Customer ID} != ''",
    { fields: ['Name', 'Email', 'Tier', 'Status', 'Stripe Customer ID'] }
  )
  const people = new Map<string, AirtablePerson>()
  for (const record of records) {
    const customerId = record.fields['Stripe Customer ID']?.trim()
    if (!customerId) continue
    people.set(customerId, {
      recordId: record.id,
      name: record.fields.Name ?? null,
      email: record.fields.Email ?? null,
      tier: record.fields.Tier ?? null,
      status: record.fields.Status ?? null,
    })
  }
  return people
}

/** The non-Stripe half of a Friend → Core move. Each step records its own
 *  outcome on the row so a Forkable hiccup never hides a successful Tier write. */
async function applyTierChange(
  row: MigrationRow,
  person: AirtablePerson | undefined
): Promise<void> {
  if (row.decision.action !== 'migrate' || !row.decision.tierChange) return
  const { airtableRecordId, to } = row.decision.tierChange
  const notes: string[] = []
  try {
    await updateRecord(Tables.People, airtableRecordId, { Tier: to })
    notes.push(`Airtable Tier → ${to}`)
  } catch (error) {
    notes.push(
      `Airtable Tier write FAILED: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const email = person?.email || row.subscription.customerEmail
  if (!email) {
    notes.push('Forkable skipped: no email')
  } else {
    const { firstName, lastName } = parseFullName(
      person?.name || row.subscription.customerName || ''
    )
    const forkable = await addMemberToForkable({
      email,
      firstName: firstName || email.split('@')[0],
      lastName,
      clubIds: [FORKABLE_CLUBS.MOX_MEMBERS],
    })
    notes.push(
      forkable.success
        ? 'Forkable members club added'
        : `Forkable FAILED: ${forkable.errors?.join(', ') || 'unknown error'}`
    )
  }
  row.notes = notes
}

async function listCandidateSubscriptions(): Promise<Stripe.Subscription[]> {
  const seen = new Set<string>()
  const subs: Stripe.Subscription[] = []
  for (const status of MIGRATABLE_STATUSES) {
    for await (const sub of stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ['data.customer'],
    })) {
      if (seen.has(sub.id)) continue
      seen.add(sub.id)
      subs.push(sub)
    }
  }
  return subs
}

async function run({ apply, friends }: { apply: boolean; friends: boolean }) {
  const runAt = new Date()
  const tag = `${apply ? 'APPLY' : 'DRY RUN'}${friends ? ' + Friends' : ''}`
  try {
    const loaded = await loadTargetPrices()
    if (!loaded.ok) {
      console.error(`[price-migration] ${loaded.error}`)
      return NextResponse.json({ error: loaded.error }, { status: 500 })
    }
    const { targets } = loaded

    const [candidates, people] = await Promise.all([
      listCandidateSubscriptions(),
      loadAirtablePeople(),
    ])
    const rows: MigrationRow[] = candidates.map((stripeSub) => {
      const subscription = snapshotSubscription(stripeSub)
      return {
        subscription,
        decision: decideMigration(
          subscription,
          targets,
          people.get(subscription.customerId) ?? null,
          { friends }
        ),
      }
    })

    if (apply) {
      for (const row of rows) {
        if (row.decision.action !== 'migrate') continue
        try {
          // Only the item's price changes. Leaving billing_cycle_anchor alone
          // and proration off means the new rate first appears on the next
          // regular renewal invoice; discounts, pause_collection and
          // trial_end are untouched because they aren't in the request.
          await stripe.subscriptions.update(row.subscription.id, {
            items: [
              { id: row.decision.itemId, price: row.decision.targetPriceId },
            ],
            proration_behavior: 'none',
          })
          row.applied = true
          // Only once Stripe has the new price: a member whose Tier says Core
          // but who is still billed as a Friend is the confusing case.
          await applyTierChange(row, people.get(row.subscription.customerId))
        } catch (error) {
          row.error = error instanceof Error ? error.message : String(error)
          console.error(
            `[price-migration] Failed to update ${row.subscription.id}:`,
            error
          )
        }
      }
    }

    const summary = summarize(rows)
    const report = formatReport(rows, { apply, runAt })
    console.log(`[price-migration] ${tag}\n${report}`)

    const emailed = await sendEmail({
      to: REPORT_TO,
      subject: `Membership price migration ${tag}: ${summary.migrate} to migrate (${summary.tierChanges} Friend → Core), ${summary.manual} manual, ${summary.skip} skipped${apply && summary.failed ? `, ${summary.failed} FAILED` : ''}`,
      text: report,
    })

    return NextResponse.json({
      apply,
      friends,
      runAt: runAt.toISOString(),
      summary,
      emailed,
      targets: Object.fromEntries(targets),
      rows,
      report,
    })
  } catch (error) {
    console.error(`[price-migration] ${tag} failed:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
