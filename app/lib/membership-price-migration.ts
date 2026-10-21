// Pure decision logic for moving existing Stripe membership subscriptions onto
// the Nov 1, 2026 prices. The route in
// app/portal/api/migrate-membership-prices/route.ts fetches from Stripe and
// applies the result; everything here is side-effect free so it can be tested
// without a Stripe key.
//
// Only the narrow, boring case is migrated automatically: a single-item,
// quantity-1 subscription on the Core or Resident product, billed every 1
// month at the legacy list price. Everything else is surfaced for a human.

import type Stripe from 'stripe'
import {
  MEMBERSHIP_TIERS,
  type MembershipTier,
  type MembershipTierId,
} from './membership-pricing'

/** Month-to-month list prices before Nov 1, 2026, in cents. */
export const LEGACY_MONTHLY_CENTS: Record<MembershipTierId, number> = {
  core: 38000,
  resident: 78000,
}

/** Subscription statuses the migration considers. Anything else is ignored. */
export const MIGRATABLE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'paused',
] as const satisfies readonly Stripe.Subscription.Status[]

export interface SubscriptionItemSnapshot {
  id: string
  priceId: string
  productId: string
  lookupKey: string | null
  unitAmount: number | null
  currency: string
  interval: string | null
  intervalCount: number | null
  quantity: number
}

export interface SubscriptionSnapshot {
  id: string
  status: string
  customerId: string
  customerEmail: string | null
  items: SubscriptionItemSnapshot[]
}

export interface TargetPrice {
  id: string
  lookupKey: string
  unitAmount: number | null
  currency: string
}

export type MigrationDecision =
  | {
      action: 'migrate'
      tier: MembershipTierId
      itemId: string
      fromPriceId: string
      targetPriceId: string
      targetLookupKey: string
    }
  | { action: 'skip'; tier: MembershipTierId; reason: string }
  | { action: 'manual'; tier: MembershipTierId | null; reason: string }

export interface MigrationRow {
  subscription: SubscriptionSnapshot
  decision: MigrationDecision
  /** Set in apply mode: whether the Stripe update went through. */
  applied?: boolean
  error?: string
}

export function tierForProduct(productId: string): MembershipTier | null {
  for (const tier of Object.values(MEMBERSHIP_TIERS)) {
    if (tier.stripeProductId === productId) return tier
  }
  return null
}

/** Lookup keys that `/api/membership-checkout` sells today, across all tiers. */
export function currentLookupKeys(): Set<string> {
  const keys = new Set<string>()
  for (const tier of Object.values(MEMBERSHIP_TIERS)) {
    for (const key of Object.values(tier.stripeLookupKeys)) keys.add(key)
  }
  return keys
}

function dollars(cents: number | null, currency: string): string {
  if (cents == null) return '(no amount)'
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}

/**
 * Decide what to do with one subscription. `targets` is keyed by lookup_key
 * and must contain the monthly key for every tier the caller wants migrated.
 */
export function decideMigration(
  sub: SubscriptionSnapshot,
  targets: ReadonlyMap<string, TargetPrice>
): MigrationDecision {
  if (sub.items.length !== 1) {
    return {
      action: 'manual',
      tier: null,
      reason: `subscription has ${sub.items.length} items`,
    }
  }
  const item = sub.items[0]
  const tier = tierForProduct(item.productId)
  if (!tier) {
    return {
      action: 'manual',
      tier: null,
      reason: `product ${item.productId} is not the Core or Resident membership product`,
    }
  }
  if (item.quantity !== 1) {
    return {
      action: 'manual',
      tier: tier.id,
      reason: `quantity is ${item.quantity}`,
    }
  }

  const tierKeys = Object.values(tier.stripeLookupKeys)
  if (item.lookupKey && tierKeys.includes(item.lookupKey)) {
    return {
      action: 'skip',
      tier: tier.id,
      reason: `already on ${item.lookupKey}`,
    }
  }
  if (item.lookupKey) {
    return {
      action: 'manual',
      tier: tier.id,
      reason: `price has unexpected lookup_key ${item.lookupKey}`,
    }
  }

  const targetKey = tier.stripeLookupKeys.monthly
  const target = targets.get(targetKey)
  if (!target) {
    return {
      action: 'manual',
      tier: tier.id,
      reason: `no active Stripe price with lookup_key ${targetKey}`,
    }
  }
  if (item.priceId === target.id) {
    return { action: 'skip', tier: tier.id, reason: `already on ${target.id}` }
  }

  if (item.interval !== 'month' || item.intervalCount !== 1) {
    const every = item.interval
      ? `every ${item.intervalCount ?? '?'} ${item.interval}`
      : 'not recurring'
    return {
      action: 'manual',
      tier: tier.id,
      reason: `billed ${every}, not monthly`,
    }
  }

  const legacy = LEGACY_MONTHLY_CENTS[tier.id]
  if (item.currency !== 'usd' || item.unitAmount !== legacy) {
    return {
      action: 'manual',
      tier: tier.id,
      reason: `custom amount ${dollars(item.unitAmount, item.currency)} (legacy ${tier.name} monthly is ${dollars(legacy, 'usd')})`,
    }
  }

  return {
    action: 'migrate',
    tier: tier.id,
    itemId: item.id,
    fromPriceId: item.priceId,
    targetPriceId: target.id,
    targetLookupKey: targetKey,
  }
}

/**
 * Flatten a Stripe subscription (with `customer` expanded) into the shape
 * `decideMigration` reads. Keeps the route thin and the decision testable.
 */
export function snapshotSubscription(
  sub: Stripe.Subscription
): SubscriptionSnapshot {
  const customer = sub.customer
  const customerId = typeof customer === 'string' ? customer : customer.id
  const customerEmail =
    typeof customer === 'object' && !customer.deleted
      ? (customer.email ?? null)
      : null
  return {
    id: sub.id,
    status: sub.status,
    customerId,
    customerEmail,
    items: sub.items.data.map((item) => {
      const price = item.price
      const product = price.product
      return {
        id: item.id,
        priceId: price.id,
        productId: typeof product === 'string' ? product : product.id,
        lookupKey: price.lookup_key ?? null,
        unitAmount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? null,
        quantity: item.quantity ?? 1,
      }
    }),
  }
}

export interface MigrationSummary {
  migrate: number
  skip: number
  manual: number
  applied: number
  failed: number
}

export function summarize(rows: MigrationRow[]): MigrationSummary {
  const summary: MigrationSummary = {
    migrate: 0,
    skip: 0,
    manual: 0,
    applied: 0,
    failed: 0,
  }
  for (const row of rows) {
    summary[row.decision.action]++
    if (row.applied) summary.applied++
    if (row.error) summary.failed++
  }
  return summary
}

function describeItem(item: SubscriptionItemSnapshot): string {
  const every =
    item.interval && item.intervalCount
      ? item.intervalCount === 1
        ? `/${item.interval}`
        : ` every ${item.intervalCount} ${item.interval}s`
      : ''
  return `${item.priceId} ${dollars(item.unitAmount, item.currency)}${every}`
}

/** Plain-text report for the log and the team@ email. */
export function formatReport(
  rows: MigrationRow[],
  opts: { apply: boolean; runAt: Date }
): string {
  const summary = summarize(rows)
  const lines: string[] = []
  lines.push(
    opts.apply
      ? `Membership price migration — APPLIED ${opts.runAt.toISOString()}`
      : `Membership price migration — DRY RUN ${opts.runAt.toISOString()}`
  )
  lines.push('')
  lines.push(
    `${rows.length} subscriptions considered: ${summary.migrate} to migrate` +
      (opts.apply
        ? ` (${summary.applied} applied, ${summary.failed} failed)`
        : '') +
      `, ${summary.skip} already on new prices, ${summary.manual} need manual review`
  )

  const section = (title: string, action: MigrationDecision['action']) => {
    const subset = rows.filter((r) => r.decision.action === action)
    if (subset.length === 0) return
    lines.push('')
    lines.push(`## ${title} (${subset.length})`)
    for (const row of subset) {
      const sub = row.subscription
      const who = sub.customerEmail ?? sub.customerId
      const current = sub.items.map(describeItem).join(' + ')
      let tail: string
      if (row.decision.action === 'migrate') {
        tail = `-> ${row.decision.targetLookupKey} (${row.decision.targetPriceId})`
        if (opts.apply) {
          tail += row.error ? ` FAILED: ${row.error}` : ' OK'
        }
      } else {
        tail = `— ${row.decision.reason}`
      }
      lines.push(`- ${who} [${sub.id}, ${sub.status}] ${current} ${tail}`)
    }
  }

  section(opts.apply ? 'Migrated' : 'Would migrate', 'migrate')
  section('Needs manual review', 'manual')
  section('Skipped (already on new price)', 'skip')
  return lines.join('\n')
}
