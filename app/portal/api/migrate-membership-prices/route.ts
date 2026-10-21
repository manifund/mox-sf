import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { requireStaff } from '@/app/lib/session'
import { stripe } from '@/app/lib/stripe'
import { sendEmail } from '@/app/lib/email'
import { MEMBERSHIP_TIERS, chargeCents } from '@/app/lib/membership-pricing'
import {
  MIGRATABLE_STATUSES,
  decideMigration,
  formatReport,
  snapshotSubscription,
  summarize,
  type MigrationRow,
  type TargetPrice,
} from '@/app/lib/membership-price-migration'

export const maxDuration = 300

const REPORT_TO = 'team@moxsf.com'

// Staff-only one-off: move existing month-to-month Core/Resident subscriptions
// onto the Nov 1, 2026 monthly prices. Dry run unless `apply=true`. See
// docs/workflows/price-migration.md.
//
// GET  — always a dry run (safe to open in a browser)
// POST — dry run unless ?apply=true (or {"apply": true} in the JSON body)

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return run({ apply: false })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  let apply = request.nextUrl.searchParams.get('apply') === 'true'
  if (!apply) {
    const body = await request.json().catch(() => null)
    apply = body?.apply === true
  }
  return run({ apply })
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

async function run({ apply }: { apply: boolean }) {
  const runAt = new Date()
  const tag = apply ? 'APPLY' : 'DRY RUN'
  try {
    const loaded = await loadTargetPrices()
    if (!loaded.ok) {
      console.error(`[price-migration] ${loaded.error}`)
      return NextResponse.json({ error: loaded.error }, { status: 500 })
    }
    const { targets } = loaded

    const rows: MigrationRow[] = (await listCandidateSubscriptions()).map(
      (stripeSub) => {
        const subscription = snapshotSubscription(stripeSub)
        return {
          subscription,
          decision: decideMigration(subscription, targets),
        }
      }
    )

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
      subject: `Membership price migration ${tag}: ${summary.migrate} to migrate, ${summary.manual} manual, ${summary.skip} skipped${apply && summary.failed ? `, ${summary.failed} FAILED` : ''}`,
      text: report,
    })

    return NextResponse.json({
      apply,
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
