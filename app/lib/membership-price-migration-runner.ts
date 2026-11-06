import type Stripe from 'stripe'
import { stripe } from './stripe'
import { sendEmail } from './email'
import { findRecords, updateRecord, Tables } from './airtable'
import { addMemberToForkable, FORKABLE_CLUBS, parseFullName } from './forkable'
import { MEMBERSHIP_TIERS, chargeCents } from './membership-pricing'
import {
  MIGRATABLE_STATUSES,
  decideMigration,
  formatReport,
  snapshotSubscription,
  summarize,
  type AirtablePerson,
  type MigrationRow,
  type MigrationSummary,
  type TargetPrice,
} from './membership-price-migration'

// The fetch-and-apply half of the Nov 1, 2026 price migration, shared by the
// staff route (/portal/api/migrate-membership-prices) and the command line
// (scripts/migrate-membership-prices.ts). Decisions live in
// membership-price-migration.ts; this file only talks to Stripe, Airtable,
// Forkable and email. See docs/workflows/price-migration.md.

export const REPORT_TO = 'team@moxsf.com'

export interface MigrationRunOptions {
  /** Change Stripe (and, for Friend → Core, Airtable and Forkable). */
  apply: boolean
  /** Include the Friend → Core pass; otherwise Friend rows are skipped. */
  friends: boolean
  /** Called after each row is decided (and, in apply mode, applied). */
  onRow?: (row: MigrationRow, index: number, total: number) => void
}

export interface MigrationRunResult {
  apply: boolean
  friends: boolean
  runAt: string
  summary: MigrationSummary
  emailed: boolean
  targets: Record<string, TargetPrice>
  rows: MigrationRow[]
  report: string
}

/** Thrown before anything is touched when the target prices don't check out. */
export class MigrationSetupError extends Error {}

/** Resolve the new monthly price for every tier by lookup_key, refusing to
 *  proceed if any is missing or charges something other than
 *  membership-pricing.ts says. A mass migration onto a wrong price is far
 *  worse than a checkout showing a stale number, so this is an error here
 *  where membership-checkout only warns. */
async function loadTargetPrices(): Promise<Map<string, TargetPrice>> {
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
      throw new MigrationSetupError(
        `No active Stripe price with lookup_key ${key}`
      )
    }
    const expected = chargeCents(tier, 'monthly')
    if (target.unitAmount !== expected || target.currency !== 'usd') {
      throw new MigrationSetupError(
        `Price ${target.id} (${key}) charges ${target.unitAmount} ${target.currency} but membership-pricing.ts expects ${expected} usd`
      )
    }
  }
  return targets
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

/**
 * Decide every live subscription and, in apply mode, update the ones marked
 * migrate. Emails the report to team@ either way. Throws MigrationSetupError
 * (before touching anything) if a target price is missing or wrong; any
 * other error from the setup calls propagates. Per-row apply failures are
 * recorded on the row, not thrown.
 */
export async function runMigration({
  apply,
  friends,
  onRow,
}: MigrationRunOptions): Promise<MigrationRunResult> {
  const runAt = new Date()
  const tag = `${apply ? 'APPLY' : 'DRY RUN'}${friends ? ' + Friends' : ''}`

  const targets = await loadTargetPrices()
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

  for (const [index, row] of rows.entries()) {
    if (apply && row.decision.action === 'migrate') {
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
    onRow?.(row, index, rows.length)
  }

  const summary = summarize(rows)
  const report = formatReport(rows, { apply, runAt })
  console.log(`[price-migration] ${tag}\n${report}`)

  const emailed = await sendEmail({
    to: REPORT_TO,
    subject: `Membership price migration ${tag}: ${summary.migrate} to migrate (${summary.tierChanges} Friend → Core), ${summary.manual} manual, ${summary.skip} skipped${apply && summary.failed ? `, ${summary.failed} FAILED` : ''}`,
    text: report,
  })

  return {
    apply,
    friends,
    runAt: runAt.toISOString(),
    summary,
    emailed,
    targets: Object.fromEntries(targets),
    rows,
    report,
  }
}
