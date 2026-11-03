# Membership Price Migration (Nov 1, 2026)

One-off staff automation that moves existing Stripe subscriptions onto the
Nov 1, 2026 prices. New signups already get the new prices via
`/api/membership-checkout`; this handles the members who signed up before the
change, whose subscriptions Stripe leaves on the old Price.

It makes two kinds of move, run as two separate passes:

| Pass                     | From                       | To               | Also                                        |
| ------------------------ | -------------------------- | ---------------- | ------------------------------------------- |
| Prices (default)         | Core $380/mo (legacy)      | Core $595/mo     | —                                           |
| Prices (default)         | Resident $780/mo (legacy)  | Resident $995/mo | —                                           |
| Friends (`friends=true`) | Friend $160/mo (retired)   | Core $595/mo     | Airtable Tier → Core, Forkable members club |

Without `friends=true` every Friend subscription is listed under **Skipped**
with the reason `Friend → Core is a separate pass`, and nothing about it
changes. That lets the price increase go out as soon as it is ready while the
Friend move waits for its own member email.

Members who reply asking for quarterly ($1,350 / $2,550 every 3 months) can
switch themselves from the member portal once that ships, or staff switch them
in the Stripe Dashboard. This automation only lands people on monthly.

## When to run it

It was meant for Nov 1, 2026. Run late, it is still safe: the update uses
`proration_behavior: 'none'` and leaves `billing_cycle_anchor` alone, so the
new rate first appears on each member's next regular renewal after the run.
Anyone who renewed between Nov 1 and the run simply paid the old rate one more
time.

Before applying the **Friends** pass, settle the Friend replies with Leilani:
anyone who chose to leave should be cancelled in Stripe first, so the sweep
never lands them on Core. Anyone who chose quarterly can be moved after. The
Prices pass does not need this and can run first.

Running it twice is harmless: anything already on a lookup-keyed new price is
skipped, and a Friend whose Airtable Tier is already Core is no longer a Friend
in Stripe either.

## How to run it

Route: `/portal/api/migrate-membership-prices` (staff login required; listed in
`/portal/admin/automations`).

1. **Dry run** — open the route in a browser while logged in as staff, or
   `POST` it without `apply`. Add `?friends=true` to preview the Friend pass
   as well. Nothing in Stripe or Airtable changes. The response (and the email
   to team@moxsf.com) lists every subscription in one of three buckets:
   - **Would migrate** — will be moved to `membership_<tier>_monthly`; Friend
     rows also say `+ Airtable Tier Friend → Core, Forkable members club`
   - **Needs manual review** — not touched; a human decides
   - **Skipped** — already on a new lookup-keyed price, or a Friend when
     `friends` is off
2. Read the manual-review list. Anything there that should move gets changed by
   hand in the Stripe Dashboard (and Airtable, for a tier change).
3. **Apply** — `POST` with `apply=true`, plus `friends=true` for the Friend
   pass. From the browser console on any portal page, logged in as staff:

   ```js
   // Prices pass (Core and Resident only)
   fetch('/portal/api/migrate-membership-prices?apply=true', { method: 'POST' })
     .then((r) => r.json())
     .then(console.log)

   // Friends pass, once the Friend email has gone out
   fetch('/portal/api/migrate-membership-prices?apply=true&friends=true', { method: 'POST' })
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
`past_due` or `paused`. Paused members are migrated too: they resume at the
new rate, which is what the pricing email told them.

A **Core or Resident** subscription is migrated only when **all** of these hold:

- exactly one subscription item, quantity 1
- no subscription schedule attached (Stripe refuses direct price edits on
  schedule-managed subscriptions; the portal's quarterly switcher creates one)
- the item's product is the Core (`prod_RpkYg9EMJoi5oi`) or Resident
  (`prod_RpkufjD9E3esG5`) product (from `stripeProductId` in
  `app/lib/membership-pricing.ts`)
- the item's price has no `lookup_key`
- billed every 1 month, in USD, at the legacy list price ($380 / $780)

A **Friend** subscription (`prod_Rq9VzfM9QoJwPD`) is migrated to Core monthly
only when `friends=true` was passed and, additionally:

- it is billed every 1 month, in USD, at $160
- the Stripe customer id matches an Airtable People record whose Tier is
  `Friend` and Status is `Joined` or `Paused`

The Airtable check is what keeps a cancelled, mis-filed or duplicate record
from being promoted to Core by accident. Friend rows that fail it land in
manual review with what Airtable says about them.

Everything else lands in **needs manual review** with a reason: other
products, multiple items, quantity ≠ 1, a schedule, legacy quarterly or yearly
billing, custom/discounted amounts, a price that already charges the new amount
but isn't the lookup-keyed Price, non-USD, or a price whose `lookup_key`
belongs to another tier.

**Skipped** means the item's price already carries one of this tier's lookup
keys (`membership_<tier>_monthly` / `_quarterly`), or is the target Price id,
or it is a Friend subscription and `friends` was not set.

## What apply does and doesn't touch

For every row, the Stripe change is the same:

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

For a **Friend → Core** row, and only after the Stripe update succeeded, two
more steps run and each records its own outcome in the row's notes:

1. `Tier` is set to `Core` on the matched Airtable People record. The Discord
   role sync cron picks this up within five minutes and swaps the Friend role
   for Core; guest-pass limits and the portal follow immediately.
2. The member is added to the Forkable members club (the same club new Core
   members get from the Stripe webhook). Friends had no Forkable access, so
   there is nothing to remove.

A failed Airtable or Forkable step does not undo the Stripe change; it shows
up in the report as `Airtable Tier write FAILED: …` or `Forkable FAILED: …`
for staff to finish by hand.

## Files

- `app/portal/api/migrate-membership-prices/route.ts` — the route
- `app/lib/membership-price-migration.ts` — decision logic, snapshotting,
  report formatting
- `app/lib/membership-price-migration.test.ts` — tests (`bun run test`)
- `app/lib/membership-pricing.ts` — tiers, lookup keys, product ids
- `app/lib/forkable.ts` — `addMemberToForkable`, club ids
