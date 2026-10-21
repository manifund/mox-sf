# Membership Price Migration (Nov 1, 2026)

One-off staff automation that moves existing month-to-month Core and Resident
Stripe subscriptions onto the new monthly prices. New signups already get the
new prices via `/api/membership-checkout`; this handles the members who signed
up before the change, whose subscriptions Stripe leaves on the old Price.

| Tier     | Old monthly | New monthly | New quarterly (by hand) |
| -------- | ----------- | ----------- | ----------------------- |
| Core     | $380        | $595        | $450/mo, $1,350 per qtr |
| Resident | $780        | $995        | $850/mo, $2,550 per qtr |

Members who reply asking for quarterly are switched by hand in the Stripe
Dashboard. This automation only does monthly → new monthly.

## When to run it

**On Nov 1, 2026. Not before.**

The update uses `proration_behavior: 'none'` and leaves `billing_cycle_anchor`
alone, so the new rate first appears on each member's next regular renewal
invoice after the run. That is what makes it safe (no mid-cycle charge, no
proration credit) — but it also means anyone whose renewal falls between the
run date and Nov 1 would be billed the new rate early. Run it on the day.

Running it twice is harmless: anything already on a lookup-keyed new price is
skipped.

## How to run it

Route: `/portal/api/migrate-membership-prices` (staff login required; listed in
`/portal/admin/automations`).

1. **Dry run** — open the route in a browser while logged in as staff, or
   `POST` it without `apply`. Nothing in Stripe changes. The response (and the
   email to team@moxsf.com) lists every subscription in one of three buckets:
   - **Would migrate** — will be moved to `membership_<tier>_monthly`
   - **Needs manual review** — not touched; a human decides
   - **Skipped** — already on a new lookup-keyed price
2. Read the manual-review list. Anything there that should move gets changed by
   hand in the Stripe Dashboard.
3. **Apply** — `POST` with `apply=true`. From the browser console on any portal
   page, logged in as staff:

   ```js
   fetch('/portal/api/migrate-membership-prices?apply=true', { method: 'POST' })
     .then((r) => r.json())
     .then(console.log)
   ```

   `GET` is always a dry run, so a stray browser visit can't apply anything.

The run logs the full report to the server console and emails it to
team@moxsf.com (subject marks `DRY RUN` vs `APPLY`). The JSON response carries
the same report plus every row and decision.

## What gets migrated

`decideMigration` in `app/lib/membership-price-migration.ts` (pure, unit
tested) looks at every subscription with status `active`, `trialing`,
`past_due` or `paused` and migrates only when **all** of these hold:

- exactly one subscription item, quantity 1
- the item's product is the Core (`prod_RpkYg9EMJoi5oi`) or Resident
  (`prod_RpkufjD9E3esG5`) product (from `stripeProductId` in
  `app/lib/membership-pricing.ts`)
- the item's price has no `lookup_key`
- billed every 1 month, in USD, at the legacy list price ($380 / $780)

Everything else lands in **needs manual review** with a reason: Friend or any
other product, multiple items, quantity ≠ 1, legacy quarterly or yearly
billing, custom/discounted amounts, a price that already charges the new
amount but isn't the lookup-keyed Price, non-USD, or a price whose
`lookup_key` belongs to another tier.

**Skipped** means the item's price already carries one of this tier's lookup
keys (`membership_<tier>_monthly` / `_quarterly`), or is the target Price id.

## What the update does and doesn't touch

```ts
stripe.subscriptions.update(sub.id, {
  items: [{ id: item.id, price: targetPriceId }],
  proration_behavior: 'none',
})
```

- Target Price is resolved by `lookup_key` exactly as
  `/api/membership-checkout` does. The run refuses to start (HTTP 500) if a
  monthly lookup key has no active Price or its amount differs from
  `membership-pricing.ts`, rather than mass-migrating onto a wrong Price.
- `billing_cycle_anchor`, `trial_end`, discounts/coupons, `pause_collection`
  and metadata are not in the request, so Stripe leaves them as they are.
- Prices stay on the existing Products, so the Stripe webhook's product → tier
  mapping keeps working.
- Updating a subscription in place fires `customer.subscription.updated`,
  which `/api/webhooks/stripe` ignores. No onboarding re-runs.
- Each subscription is updated independently; one Stripe error is recorded on
  that row (`FAILED: …` in the report) and the rest continue.

## Files

- `app/portal/api/migrate-membership-prices/route.ts` — the route
- `app/lib/membership-price-migration.ts` — decision logic, snapshotting,
  report formatting
- `app/lib/membership-price-migration.test.ts` — tests (`bun run test`)
- `app/lib/membership-pricing.ts` — tiers, lookup keys, product ids
