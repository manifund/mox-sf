import { describe, expect, it } from 'vitest'
import {
  FRIEND_PRODUCT_ID,
  LEGACY_FRIEND_MONTHLY_CENTS,
  LEGACY_MONTHLY_CENTS,
  decideMigration,
  formatReport,
  snapshotSubscription,
  summarize,
  tierForProduct,
  type AirtablePerson,
  type MigrationRow,
  type SubscriptionItemSnapshot,
  type SubscriptionSnapshot,
  type TargetPrice,
} from './membership-price-migration'
import { MEMBERSHIP_TIERS } from './membership-pricing'

const CORE = MEMBERSHIP_TIERS.core
const RESIDENT = MEMBERSHIP_TIERS.resident

const targets = new Map<string, TargetPrice>([
  [
    CORE.stripeLookupKeys.monthly,
    {
      id: 'price_core_monthly_new',
      lookupKey: CORE.stripeLookupKeys.monthly,
      unitAmount: 59500,
      currency: 'usd',
    },
  ],
  [
    RESIDENT.stripeLookupKeys.monthly,
    {
      id: 'price_resident_monthly_new',
      lookupKey: RESIDENT.stripeLookupKeys.monthly,
      unitAmount: 99500,
      currency: 'usd',
    },
  ],
])

function item(
  overrides: Partial<SubscriptionItemSnapshot> = {}
): SubscriptionItemSnapshot {
  return {
    id: 'si_1',
    priceId: 'price_core_legacy',
    productId: CORE.stripeProductId,
    lookupKey: null,
    unitAmount: LEGACY_MONTHLY_CENTS.core,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    quantity: 1,
    ...overrides,
  }
}

function sub(
  items: SubscriptionItemSnapshot[] = [item()],
  overrides: Partial<SubscriptionSnapshot> = {}
): SubscriptionSnapshot {
  return {
    id: 'sub_1',
    status: 'active',
    customerId: 'cus_1',
    customerEmail: 'member@example.com',
    customerName: null,
    scheduleId: null,
    items,
    ...overrides,
  }
}

function friendItem(
  overrides: Partial<SubscriptionItemSnapshot> = {}
): SubscriptionItemSnapshot {
  return item({
    priceId: 'price_friend_legacy',
    productId: FRIEND_PRODUCT_ID,
    unitAmount: LEGACY_FRIEND_MONTHLY_CENTS,
    ...overrides,
  })
}

const friendPerson: AirtablePerson = {
  recordId: 'recFriend1',
  name: 'Fran Friend',
  email: 'fran@example.com',
  tier: 'Friend',
  status: 'Joined',
}

describe('tierForProduct', () => {
  it('maps the Core and Resident products and nothing else', () => {
    expect(tierForProduct('prod_RpkYg9EMJoi5oi')?.id).toBe('core')
    expect(tierForProduct('prod_RpkufjD9E3esG5')?.id).toBe('resident')
    expect(tierForProduct('prod_Rq9VzfM9QoJwPD')).toBeNull() // Friend
  })
})

describe('decideMigration', () => {
  it('migrates a legacy Core month-to-month subscription to the new monthly price', () => {
    expect(decideMigration(sub(), targets)).toEqual({
      action: 'migrate',
      tier: 'core',
      itemId: 'si_1',
      fromPriceId: 'price_core_legacy',
      targetPriceId: 'price_core_monthly_new',
      targetLookupKey: 'membership_core_monthly',
      tierChange: null,
    })
  })

  it('flags a subscription managed by a schedule, whatever its price', () => {
    const decision = decideMigration(
      sub(undefined, { scheduleId: 'sub_sched_1' }),
      targets
    )
    expect(decision).toMatchObject({ action: 'manual', tier: 'core' })
    expect(decision.action === 'manual' && decision.reason).toContain(
      'subscription schedule sub_sched_1'
    )
  })

  it('migrates a legacy Resident month-to-month subscription', () => {
    const decision = decideMigration(
      sub([
        item({
          productId: RESIDENT.stripeProductId,
          unitAmount: LEGACY_MONTHLY_CENTS.resident,
          priceId: 'price_resident_legacy',
        }),
      ]),
      targets
    )
    expect(decision).toMatchObject({
      action: 'migrate',
      tier: 'resident',
      targetPriceId: 'price_resident_monthly_new',
    })
  })

  it('migrates regardless of status (trialing, past_due, paused)', () => {
    for (const status of ['trialing', 'past_due', 'paused']) {
      expect(decideMigration(sub(undefined, { status }), targets).action).toBe(
        'migrate'
      )
    }
  })

  it('skips subscriptions already on a lookup-keyed new price', () => {
    const monthly = decideMigration(
      sub([item({ lookupKey: 'membership_core_monthly', unitAmount: 59500 })]),
      targets
    )
    expect(monthly).toEqual({
      action: 'skip',
      tier: 'core',
      reason: 'already on membership_core_monthly',
    })

    const quarterly = decideMigration(
      sub([
        item({
          lookupKey: 'membership_core_quarterly',
          unitAmount: 135000,
          intervalCount: 3,
        }),
      ]),
      targets
    )
    expect(quarterly.action).toBe('skip')
  })

  it('skips when the price id is already the target even without a lookup key', () => {
    const decision = decideMigration(
      sub([item({ priceId: 'price_core_monthly_new', unitAmount: 59500 })]),
      targets
    )
    expect(decision.action).toBe('skip')
  })

  it('flags products other than Core, Resident and Friend for manual review', () => {
    const decision = decideMigration(
      sub([item({ productId: 'prod_ScRhXMt6G7rljh' })]),
      targets
    )
    expect(decision).toMatchObject({ action: 'manual', tier: null })
    expect(decision.action === 'manual' && decision.reason).toMatch(
      /not the Core, Resident or Friend/
    )
  })

  describe('Friend → Core', () => {
    const friends = { friends: true }

    it('skips every Friend unless the friends option is set', () => {
      const decision = decideMigration(sub([friendItem()]), targets, friendPerson)
      expect(decision).toEqual({
        action: 'skip',
        tier: 'core',
        reason: 'Friend → Core is a separate pass (run with friends=true)',
      })
      expect(
        decideMigration(sub([friendItem()]), targets, null, { friends: false }).action
      ).toBe('skip')
    })

    it('moves a $160 Friend to Core monthly with a tier change when Airtable agrees', () => {
      expect(decideMigration(sub([friendItem()]), targets, friendPerson, friends)).toEqual({
        action: 'migrate',
        tier: 'core',
        itemId: 'si_1',
        fromPriceId: 'price_friend_legacy',
        targetPriceId: 'price_core_monthly_new',
        targetLookupKey: 'membership_core_monthly',
        tierChange: { from: 'Friend', to: 'Core', airtableRecordId: 'recFriend1' },
      })
    })

    it('also moves a Paused Friend (they resume as Core)', () => {
      const decision = decideMigration(
        sub([friendItem()]),
        targets,
        { ...friendPerson, status: 'Paused' },
        friends
      )
      expect(decision.action).toBe('migrate')
    })

    it('leaves a Friend alone when there is no Airtable record', () => {
      const decision = decideMigration(sub([friendItem()]), targets, null, friends)
      expect(decision).toMatchObject({ action: 'manual', tier: null })
      expect(decision.action === 'manual' && decision.reason).toContain(
        'no Airtable People record for Stripe customer cus_1'
      )
    })

    it('leaves a Friend alone when Airtable disagrees about status or tier', () => {
      const cancelled = decideMigration(
        sub([friendItem()]),
        targets,
        { ...friendPerson, status: 'Cancelled' },
        friends
      )
      expect(cancelled).toMatchObject({ action: 'manual' })
      expect(cancelled.action === 'manual' && cancelled.reason).toContain(
        'Airtable says Cancelled / Friend (Fran Friend)'
      )

      const office = decideMigration(
        sub([friendItem()]),
        targets,
        { ...friendPerson, tier: 'Private Office' },
        friends
      )
      expect(office.action).toBe('manual')
    })

    it('leaves a Friend at a custom amount or interval alone', () => {
      expect(
        decideMigration(sub([friendItem({ unitAmount: 10000 })]), targets, friendPerson, friends)
      ).toMatchObject({ action: 'manual', reason: expect.stringContaining('$100.00 USD') })
      expect(
        decideMigration(
          sub([friendItem({ intervalCount: 3, unitAmount: 48000 })]),
          targets,
          friendPerson,
          friends
        ).action
      ).toBe('manual')
    })

    it('never migrates a Friend when the Core monthly price is missing', () => {
      const decision = decideMigration(sub([friendItem()]), new Map(), friendPerson, friends)
      expect(decision).toMatchObject({
        action: 'manual',
        reason: 'no active Stripe price with lookup_key membership_core_monthly',
      })
    })
  })

  it('flags subscriptions with multiple items', () => {
    const decision = decideMigration(
      sub([item(), item({ id: 'si_2', priceId: 'price_addon' })]),
      targets
    )
    expect(decision).toEqual({
      action: 'manual',
      tier: null,
      reason: 'subscription has 2 items',
    })
  })

  it('flags quantity other than 1', () => {
    const decision = decideMigration(sub([item({ quantity: 2 })]), targets)
    expect(decision).toMatchObject({
      action: 'manual',
      reason: 'quantity is 2',
    })
  })

  it('flags custom or one-off monthly amounts', () => {
    const discounted = decideMigration(
      sub([item({ unitAmount: 30000 })]),
      targets
    )
    expect(discounted).toMatchObject({ action: 'manual', tier: 'core' })
    expect(discounted.action === 'manual' && discounted.reason).toContain(
      'custom amount $300.00 USD'
    )

    // Already paying the new amount on a non-keyed price: still a human call.
    const alreadyNew = decideMigration(
      sub([item({ unitAmount: 59500 })]),
      targets
    )
    expect(alreadyNew.action).toBe('manual')
  })

  it('flags non-monthly billing (legacy quarterly, yearly, non-recurring)', () => {
    const quarterly = decideMigration(
      sub([item({ intervalCount: 3, unitAmount: 114000 })]),
      targets
    )
    expect(quarterly).toMatchObject({
      action: 'manual',
      reason: 'billed every 3 month, not monthly',
    })

    const yearly = decideMigration(
      sub([item({ interval: 'year', unitAmount: 456000 })]),
      targets
    )
    expect(yearly.action).toBe('manual')

    const oneOff = decideMigration(
      sub([item({ interval: null, intervalCount: null })]),
      targets
    )
    expect(oneOff).toMatchObject({
      action: 'manual',
      reason: 'billed not recurring, not monthly',
    })
  })

  it('flags non-USD prices', () => {
    const decision = decideMigration(sub([item({ currency: 'eur' })]), targets)
    expect(decision.action).toBe('manual')
  })

  it('flags a price whose lookup_key belongs to a different tier', () => {
    const decision = decideMigration(
      sub([item({ lookupKey: 'membership_resident_monthly' })]),
      targets
    )
    expect(decision).toMatchObject({
      action: 'manual',
      reason: 'price has unexpected lookup_key membership_resident_monthly',
    })
  })

  it('never migrates when the target price is missing from Stripe', () => {
    const decision = decideMigration(sub(), new Map())
    expect(decision).toMatchObject({
      action: 'manual',
      reason: 'no active Stripe price with lookup_key membership_core_monthly',
    })
  })
})

describe('snapshotSubscription', () => {
  it('flattens a Stripe subscription with an expanded customer', () => {
    const stripeSub = {
      id: 'sub_42',
      status: 'active',
      customer: { id: 'cus_42', email: 'a@b.co', deleted: undefined },
      items: {
        data: [
          {
            id: 'si_42',
            quantity: 1,
            price: {
              id: 'price_x',
              product: CORE.stripeProductId,
              lookup_key: null,
              unit_amount: 38000,
              currency: 'usd',
              recurring: { interval: 'month', interval_count: 1 },
            },
          },
        ],
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(snapshotSubscription(stripeSub as any)).toEqual(
      sub([item({ id: 'si_42', priceId: 'price_x' })], {
        id: 'sub_42',
        customerId: 'cus_42',
        customerEmail: 'a@b.co',
      })
    )
  })

  it('handles unexpanded and deleted customers and expanded products', () => {
    const stripeSub = {
      id: 'sub_43',
      status: 'past_due',
      customer: 'cus_43',
      items: {
        data: [
          {
            id: 'si_43',
            quantity: undefined,
            price: {
              id: 'price_y',
              product: { id: RESIDENT.stripeProductId },
              lookup_key: undefined,
              unit_amount: null,
              currency: 'usd',
              recurring: null,
            },
          },
        ],
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = snapshotSubscription(stripeSub as any)
    expect(snap.customerId).toBe('cus_43')
    expect(snap.customerEmail).toBeNull()
    expect(snap.items[0]).toMatchObject({
      productId: RESIDENT.stripeProductId,
      lookupKey: null,
      unitAmount: null,
      interval: null,
      intervalCount: null,
      quantity: 1,
    })

    const deleted = snapshotSubscription({
      ...stripeSub,
      customer: { id: 'cus_44', deleted: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(deleted.customerEmail).toBeNull()
  })
})

describe('summarize + formatReport', () => {
  const rows: MigrationRow[] = [
    { subscription: sub(), decision: decideMigration(sub(), targets) },
    {
      subscription: sub([item({ lookupKey: 'membership_core_monthly' })], {
        id: 'sub_2',
        customerEmail: null,
      }),
      decision: decideMigration(
        sub([item({ lookupKey: 'membership_core_monthly' })]),
        targets
      ),
    },
    {
      subscription: sub([item({ quantity: 2 })], { id: 'sub_3' }),
      decision: decideMigration(sub([item({ quantity: 2 })]), targets),
    },
  ]

  it('counts by action', () => {
    expect(summarize(rows)).toEqual({
      migrate: 1,
      tierChanges: 0,
      skip: 1,
      manual: 1,
      applied: 0,
      failed: 0,
    })
    const friendRow: MigrationRow = {
      subscription: sub([friendItem()]),
      decision: decideMigration(sub([friendItem()]), targets, friendPerson, {
        friends: true,
      }),
    }
    expect(summarize([...rows, friendRow])).toMatchObject({
      migrate: 2,
      tierChanges: 1,
    })
    const friendReport = formatReport([friendRow], {
      apply: false,
      runAt: new Date('2026-11-02T17:00:00Z'),
    })
    expect(friendReport).toContain('1 to migrate (1 of them Friend → Core)')
    expect(friendReport).toContain(
      '+ Airtable Tier Friend → Core, Forkable members club'
    )
    expect(
      formatReport([{ ...friendRow, applied: true, notes: ['Airtable Tier → Core', 'Forkable members club added'] }], {
        apply: true,
        runAt: new Date('2026-11-02T17:00:00Z'),
      })
    ).toContain('OK [Airtable Tier → Core; Forkable members club added]')
    expect(
      summarize([
        { ...rows[0], applied: true },
        { ...rows[0], error: 'boom' },
      ])
    ).toMatchObject({ migrate: 2, applied: 1, failed: 1 })
  })

  it('renders a dry-run report with every section', () => {
    const report = formatReport(rows, {
      apply: false,
      runAt: new Date('2026-11-01T17:00:00Z'),
    })
    expect(report).toContain('DRY RUN 2026-11-01T17:00:00.000Z')
    expect(report).toContain(
      '3 subscriptions considered: 1 to migrate, 1 skipped, 1 need manual review'
    )
    expect(report).toContain('## Would migrate (1)')
    expect(report).toContain(
      '- member@example.com [sub_1, active] price_core_legacy $380.00 USD/month -> membership_core_monthly (price_core_monthly_new)'
    )
    expect(report).toContain('## Needs manual review (1)')
    expect(report).toContain('[sub_3, active]')
    expect(report).toContain('— quantity is 2')
    expect(report).toContain('## Skipped (already on new price, or Friend without friends=true) (1)')
    // Falls back to the customer id when there is no email.
    expect(report).toContain('- cus_1 [sub_2, active]')
  })

  it('marks per-row outcomes in apply mode', () => {
    const report = formatReport(
      [
        { ...rows[0], applied: true },
        {
          ...rows[0],
          subscription: { ...rows[0].subscription, id: 'sub_9' },
          error: 'card declined',
        },
      ],
      { apply: true, runAt: new Date('2026-11-01T17:00:00Z') }
    )
    expect(report).toContain('APPLIED')
    expect(report).toContain('2 to migrate (1 applied, 1 failed)')
    expect(report).toContain('## Migrated (2)')
    expect(report).toContain('(price_core_monthly_new) OK')
    expect(report).toContain('[sub_9, active]')
    expect(report).toContain('FAILED: card declined')
  })
})
