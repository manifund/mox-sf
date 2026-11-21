# Stripe → Airtable Membership Sync

Keeps a member's Airtable `Tier` and `Status` in step with their Stripe
subscription, however the change was made: the portal's pause button, Stripe's
customer portal ("update payment method / invoices"), staff in the Stripe
Dashboard, or Stripe itself after failed payments.

## How it works

Stripe sends two events to `/api/webhooks/stripe`:

**`customer.subscription.updated`** (plan switch, pause, resume, payment state)

1. Re-reads the subscription from Stripe, so a late or out-of-order event still
   syncs to the current state.
2. Stops if the subscription's product isn't Core, Resident or the retired
   Friend product.
3. Finds the People record whose `Stripe Customer ID` matches the customer.
4. Asks `decideMembershipSync` what to write, writes it, and posts the change
   to the Discord notifications channel.

Because this event also fires on every renewal, drift left over from before
this existed corrects itself at the member's next renewal.

**`customer.subscription.deleted`** (the subscription has ended)

1. Stops if it isn't a membership product.
2. Finds the People record by `Stripe Customer ID`.
3. Lists the customer's other subscriptions. If one of them is still a live
   membership (for example a new subscription that replaced this one), nothing
   changes.
4. Otherwise asks `decideCancellation`, writes `Status = Cancelled`, and posts
   to Discord.

A cancellation scheduled for the end of the period changes nothing until the
period actually ends and Stripe deletes the subscription.

The rules are in `app/lib/stripe-membership-sync.ts` (pure and unit tested).

## Rules

| Stripe | Airtable before | Airtable after |
| ------ | --------------- | -------------- |
| Product is Core / Resident / Friend | `Tier` is blank, Friend, Core or Resident and differs | `Tier` = the product's tier |
| `pause_collection` is set | `Status` = Joined | `Status` = Paused |
| `pause_collection` is empty, subscription `active` or `trialing` | `Status` = Paused or Payment Issue | `Status` = Joined |
| Subscription is `past_due` (Stripe is still retrying the charge) | any | unchanged; Discord alert on the first failure |
| Subscription is `unpaid` (Stripe has stopped retrying) | `Status` = Joined or Paused | `Status` = Payment Issue |
| Subscription deleted, no other live membership subscription | `Status` = Joined, Paused or Payment Issue | `Status` = Cancelled (`Tier` is kept) |

Whether exhausted retries end in `unpaid` or in a cancellation is a Stripe
billing setting (how failed subscription payments are managed). Both outcomes
are handled.

Everything else is left alone:

- Other tiers (Staff, Courtesy, Private Office, Program, Volunteer…) are never
  overwritten, even if the person also has a subscription.
- `Status` only ever moves between Joined, Paused, Payment Issue and Cancelled,
  and never *out of* Cancelled. People who are Invited, Guest Program, Applied
  and so on are not touched.
- A `past_due` subscription that is unpaused does not become Joined.
- Subscriptions that are `incomplete`, `incomplete_expired` or Stripe-`paused`
  (a trial that ended with no payment method) are skipped.

## What it does not do

- **New signups and rejoining.** Those happen on `checkout.session.completed`
  for a membership checkout (`handleMembershipCheckout` in the Stripe webhook):
  it sets `Status = Joined`, `Tier` and `Stripe Customer ID`, sends the
  "Thanks for joining Mox!" email and posts to #welcomes. This replaced the
  Zapier "on new Mox subscription" Zap. Subscription updates here never move
  a Cancelled member back to Joined.
- **Forkable.** A tier change or cancellation does not change the member's
  Forkable clubs; the Discord message says so.
- **Unmatched customers.** If no People record has the customer's id, nothing
  is written. Discord gets a warning when the event was a pause, plan change,
  unpaid subscription or cancellation.

Discord roles and portal access follow from Airtable as usual (role sync cron
runs every five minutes).

## Failure handling

An error returns HTTP 500 so Stripe retries the event. Both handlers are
idempotent: they write the state Stripe shows now, so a retry or duplicate is
harmless.

## Stripe setup

The webhook endpoint for `/api/webhooks/stripe` in the Stripe Dashboard
(Developers → Webhooks) must be subscribed to both
`customer.subscription.updated` and `customer.subscription.deleted`. Without
them Stripe never sends the events and nothing here runs.

`customer.subscription.paused` and `.resumed` are not needed: they are about
Stripe's `status=paused`, not paused payment collection, which arrives as
`updated`.

## Files

- `app/api/webhooks/stripe/route.ts` — `handleSubscriptionUpdated`,
  `handleSubscriptionDeleted`
- `app/lib/stripe-membership-sync.ts` — the rules
- `app/lib/stripe-membership-sync.test.ts`, `app/api/webhooks/stripe/route.test.ts` — tests
