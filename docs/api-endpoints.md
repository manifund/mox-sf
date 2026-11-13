# API Endpoints

This document describes all API endpoints in the Mox SF application.

## Authentication Levels

| Level | Description |
|-------|-------------|
| None | Public endpoint |
| User | Requires logged-in session |
| Staff | Requires `isStaff === true` in session |
| Cron | Requires `Authorization: Bearer {CRON_SECRET}` header |
| Stripe | Requires valid Stripe webhook signature |

---

## Public APIs (`/api/`)

### GET `/api/events-cal`
Generate iCalendar feed for calendar subscriptions.

- **Auth:** None
- **Response:** `text/calendar` iCal format
- **Details:** Filters out events with status "idea", "maybe", or "cancelled"

### GET `/api/cron/rotate-door-code`
Weekly cron job to rotate Verkada door codes.

- **Auth:** Cron (`CRON_SECRET`)
- **Response:**
  ```json
  {
    "success": true,
    "newCode": "1234",
    "oldCode": "5678",
    "discordUpdated": true,
    "messageSent": true
  }
  ```
- **Details:** Updates Verkada weekly access code, renames Discord channel, posts notification

### GET `/api/cron/expire-guest-passes`
Nightly (08:00 UTC, after every pass has ended at 11pm Pacific): closes out guest passes whose day is over.

- **Auth:** Cron secret (Bearer token)
- **Response:** `{ "success", "today", "closed", "failed", "results": [{ id, guestName, validDate, ok, used?, error? }] }`
- **Details:** For each Guest Pass record that still has a `Verkada User ID` and a `Valid Date` before today: reads the guest's door events from Verkada (sets `Unlock Count` and `First Used`), deletes the guest's Verkada user so the code is gone, clears `Verkada User ID`, and sets `Status` to Activated (used) or Expired (not used). Verkada already refuses the code after the user's end date; this is the cleanup. Safe to re-run.

### POST `/guest/api/validate`
What the guest pass page should show for a token.

- **Auth:** None (12-char token; throttled per IP)
- **Body:** `{ "token": "k7Qp2mX9bT4w" }`
- **Response:** `{ "status": "active" | "upcoming" | "expired" | "revoked" | "not-found", "guestName", "hostFirstName", "validDate", "code" }`
- **Details:** `code` is the guest's own keypad code and is only returned while the pass is `active` (8am–11pm Pacific on Valid Date, host still has an allowance, pass not revoked); otherwise `null`. There is no unlock endpoint: the guest types the code at the door.

### POST `/api/membership-checkout`
Start a Stripe Checkout subscription for a membership tier. Used by the pricing table on `/join` and `/portal/renew`.

- **Auth:** None (reached by invite link before the person has a portal login)
- **Body:** `{ "tier": "core" | "resident", "interval": "quarterly" | "monthly", "clientReferenceId"?: "rec123", "email"?: "..." }`
- **Response:** `{ "url": "https://checkout.stripe.com/..." }`
- **Details:** Looks up the Stripe Price by `lookup_key` (see `app/lib/membership-pricing.ts`), applies the 7-day trial, passes `clientReferenceId` as `client_reference_id`, and warns in logs if the Stripe amount differs from the configured price. Success redirects to `/portal/login?joined=1`.

### POST `/api/webhooks/stripe`
Handle Stripe webhook events.

- **Auth:** Stripe signature
- **Handles:**
  - `checkout.session.completed` - Day pass purchases
  - `customer.subscription.created` - New subscriptions (triggers Forkable onboarding)
  - `customer.subscription.deleted` - A membership subscription has ended (triggers Forkable removal, unless the customer still has another active, trialing, past-due or paused subscription, or Airtable has them `Joined`/`Paused` on a staff-managed tier). Pausing does not fire this event.

### POST `/api/forkable-sync`
Add or remove a member in the Mox Forkable meal clubs. Called by Airtable automations; see [forkable-tier-sync.md](./workflows/forkable-tier-sync.md).

- **Auth:** `secret` in the body must match `FORKABLE_SYNC_SECRET`. Removal refuses to run (503) when the secret is not configured.
- **Add (default):** `{ "recordId": "rec123", "secret": "..." }`
- **Remove one:** `{ "action": "remove", "recordId": "rec123", "secret": "..." }`
- **Remove a list (max 100):** `{ "action": "remove", "emails": ["a@example.com"], "secret": "..." }`
- **Remove response:** `{ "success": true, "removed": 1, "skipped": 0, "failed": 0, "results": [...] }` (500 if any removal failed)
- **Details:** Removal skips anyone who still has a `Joined` or `Paused` People record, takes the rest out of the Mox Members and Mox Residents clubs only, clears `In Forkable`, and posts the outcome to Discord.

---

## Portal APIs (`/portal/api/`)

### Session & Authentication

#### GET `/portal/api/session`
Get current session info.

- **Auth:** None
- **Response:**
  ```json
  {
    "isLoggedIn": true,
    "userId": "rec123",
    "email": "user@example.com",
    "isStaff": false,
    "viewingAsUserId": null
  }
  ```

#### POST `/portal/api/send-magic-link`
Send login link via email.

- **Auth:** None
- **Body:** `{ "email": "user@example.com" }`
- **Rate Limit:** 3 requests per 15 minutes per email
- **Details:** 24-hour token expiry

#### POST `/portal/api/logout`
Destroy session.

- **Auth:** None
- **Response:** `{ "success": true }`

---

### Profile Management

#### POST `/portal/api/update-profile`
Update user profile.

- **Auth:** User (own profile only)
- **Body:** FormData with:
  - `userId` (required)
  - `name` (required, max 200 chars)
  - `website` (optional, valid URL)
  - `discordUsername` (optional, 2-32 chars)
  - `directoryVisible` ("true"/"false")
  - `photo` (file, max 10MB, JPEG/PNG/WebP/GIF/HEIC)
- **Details:** Auto-syncs Discord role if username provided

#### GET `/portal/api/verkada-pin`
Get the member's personal Verkada door code. This is the code members use on
the front door keypad (the shared weekly code is being deprecated).

- **Auth:** User (respects staff "view as")
- **Response:** `{ "pin": "123456", "hasAccess": true }`
- **Details:** Looks up the Verkada access user by the member's email. If that
  user has no entry code yet, generates a random 6-digit one and saves it. If
  there is no Verkada user for the email, returns `{ "pin": null, "hasAccess": false }`
  and the portal shows a "generate my door code" button (which calls `POST`).

#### POST `/portal/api/verkada-pin`
Generate or regenerate the member's personal door code.

- **Auth:** User (403 while viewing as another user)
- **Response:** `{ "pin": "654321", "hasAccess": true }`

#### GET `/portal/api/weekly-door-code`
Get the shared weekly door code. **Deprecated**: no longer shown in the member
portal; only the homepage nav chip (`app/components/PortalNav.tsx`) still reads
it. See [door-code-rotation.md](./workflows/door-code-rotation.md).

- **Auth:** Active member (403 otherwise)
- **Response:** `{ "code": "1234" }` or `{ "code": null }` if unconfigured

---

### Subscription Management

#### GET `/portal/api/subscription`
Get subscription details.

- **Auth:** User
- **Query:** `?customerId=cus_xxx`
- **Response:**
  ```json
  {
    "subscription": {
      "tier": "Core",
      "rate": "$595/month",
      "renewalDate": "2025-02-20",
      "status": "active",
      "isPaused": false,
      "plan": {
        "tierId": "core",
        "interval": "monthly",
        "rate": "$595/month",
        "canSwitchTo": "quarterly",
        "switchRate": "$1,350 every 3 months",
        "switchNote": null,
        "pendingSwitch": null
      }
    }
  }
  ```
- **Details:** `plan` is built by `app/lib/membership-plan.ts`. `canSwitchTo` is the interval the member can move to from the portal (null when blocked; `switchNote` then carries the member-facing reason, or null when there is nothing to show). `pendingSwitch` (`{ interval, effectiveDate, rate }`) is set while a switch is scheduled. See `docs/workflows/billing-interval-switch.md`.

#### POST `/portal/api/switch-billing-interval`
Schedule a move between month-to-month and quarterly billing for the member's current tier.

- **Auth:** User (staff "view as" acts on the viewed member)
- **Body:** `{ "interval": "quarterly" | "monthly" }`
- **Response:** `{ "success": true, "interval": "quarterly", "rate": "$1,350 every 3 months", "effectiveDate": "2025-03-01T00:00:00.000Z" }`
- **Details:** Takes effect at the end of the current paid period via a Stripe Subscription Schedule, never mid-cycle. Returns 400 with a member-facing message when the subscription can't switch (paused, cancelling, discounted, past due, non-membership product, legacy interval), 409 if a switch is already scheduled. Notifies staff on Discord and emails the member (and the acting admin).

#### DELETE `/portal/api/switch-billing-interval`
Cancel a scheduled billing plan change that hasn't taken effect yet.

- **Auth:** User
- **Details:** Releases the Subscription Schedule, leaving the subscription on its current price. Notifies staff and emails the member.

#### POST `/portal/api/pause-subscription`
Pause subscription.

- **Auth:** User
- **Body:** `{ "reason": "traveling", "resumeDate": "2025-03-01" }`
- **Details:** Sends email notifications to user and staff

#### DELETE `/portal/api/pause-subscription`
Resume paused subscription.

- **Auth:** User
- **Details:** Sends email notifications

#### POST `/portal/api/create-billing-session`
Create Stripe billing portal session.

- **Auth:** User
- **Body:** `{ "stripeCustomerId": "cus_xxx" }`
- **Response:** `{ "url": "https://billing.stripe.com/..." }`

#### GET `/portal/api/guest-passes`
Weekly guest-pass allowance and the member's passes for this week onward.

- **Auth:** User
- **Response:** `{ "allowance": 4 | null, "remaining": 2 | null, "weekStart", "weekEnd", "today", "maxDaysAhead": 7, "passes": [{ id, token, guestName, guestEmail, validDate, state, code, unlockCount, firstUsedAt, link }] }`
- **Details:** `code` is the guest's keypad code while the pass is upcoming or active, else `null`. `unlockCount` and `firstUsedAt` are filled in by the nightly `expire-guest-passes` cron, not live.
- **Details:** Allowance comes from `weeklyGuestPassAllowance()` (`app/lib/guest-passes.ts`); `null` means unlimited (Staff). See `docs/workflows/member-guest-passes.md`.

#### POST `/portal/api/guest-passes`
Issue a free guest pass for a named guest: a Verkada access user with its own door code, valid 8am–11pm Pacific on the pass date, plus a link the guest opens to see the code.

- **Auth:** User
- **Body:** `{ "guestName": "Priya Natarajan", "guestEmail": "priya@example.com", "validDate"?: "2026-10-14" }` (date defaults to today, Pacific; up to 7 days out)
- **Response:** `{ "pass": { ...summary, "link": "https://moxsf.com/guest/<token>" }, "remaining": 1 }`
- **Errors:** 400 missing name, invalid email, host's own email, or bad date; 403 tier has no allowance; 409 `{ "code": "quota" }` when the week's allowance is used; 502 when Verkada would not create the guest's user or code (no record is written).
- **Details:** Posts to Discord #notifications when the pass is issued (host, guest name, guest email, date). The Verkada user copies the access groups of the shared day-pass user (`VERKADA_UUID`), so guests get exactly the doors a paid day pass gets.

#### POST `/portal/api/guest-passes/revoke`
Revoke a guest pass: deletes the guest's Verkada user (so the code stops working at once) and marks the record Revoked. Host or staff only. Only upcoming or active passes can be revoked; a pass whose day is over returns 409.

- **Auth:** User (own pass) or Staff
- **Body:** `{ "passId": "rec123" }`

#### POST `/portal/api/unlock-door`
Open the front door remotely from the portal's door-access box. The only unlock button on the site.

- **Auth:** User (active member; throttled to 10 per 30s per user)
- **Response:** `{ "success": true }` or `{ "success": false, "error": "..." }`
- **Details:** Calls Verkada `POST /access/v1/door/admin_unlock` for `MOX_FRONT_DOOR_ID`. On refusal, logs Verkada's status and message plus the doors visible to the API key (`[portal-unlock]` lines), and staff see the Verkada reason inline; members see a plain "use your code on the keypad" message.

#### POST `/portal/api/create-day-pass-checkout`
Create day pass checkout.

- **Auth:** User
- **Body:** `{ "stripeCustomerId": "cus_xxx", "userName": "...", "userEmail": "..." }`
- **Response:** `{ "url": "https://checkout.stripe.com/..." }`

#### GET / POST `/portal/api/migrate-membership-prices`
One-off migration of legacy month-to-month Core/Resident subscriptions to the Nov 1, 2026 monthly prices, and (as a separate opt-in pass) retired Friend subscriptions to Core. See [docs/workflows/price-migration.md](workflows/price-migration.md). The Core/Resident pass was applied on Nov 2, 2026.

- **Auth:** Staff
- **Query:** `?apply=true` on `POST` performs the Stripe updates; `GET` and a bare `POST` are dry runs. `?friends=true` (or `{"friends": true}`) includes Friend → Core; without it Friend rows are skipped
- **Response:** `{ "apply", "friends", "runAt", "summary": { "migrate", "tierChanges", "skip", "manual", "applied", "failed" }, "emailed", "targets", "rows", "report" }`
- **Details:** Resolves target Prices by `lookup_key` (`membership_<tier>_monthly`), updates with `proration_behavior: 'none'` so the new rate starts at each member's next renewal, leaves discounts/pause/trial untouched, and emails the report to team@moxsf.com. A Friend → Core row also sets Airtable `Tier` to Core and adds the member to the Forkable members club

---

### Discord Integration

#### POST `/portal/api/sync-discord-role`
Sync Discord role for user.

- **Auth:** User (own role) or Staff
- **Body:** `{ "discordUsername": "user", "tier": "Core", "userId": "rec123" }`

#### POST `/portal/api/bulk-sync-discord-roles`
Bulk sync all member Discord roles.

- **Auth:** Staff
- **Details:** 1.5s delay between requests for rate limiting

#### POST `/portal/api/update-discord`
Bulk update Discord usernames.

- **Auth:** Staff
- **Body:** `{ "mappings": [{ "personId": "rec123", "discordUsername": "user" }] }`

---

### Staff Tools

#### GET `/portal/api/all-people`
List all people with emails.

- **Auth:** Staff
- **Response:** `{ "people": [{ "id", "name", "email", "discordUsername" }] }`

#### GET `/portal/api/members-search`
Search members by name/email.

- **Auth:** Staff
- **Query:** `?q=search_term` (min 2 chars)
- **Details:** Returns max 20 results, ranked by relevance

#### POST `/portal/api/view-as`
View portal as another user.

- **Auth:** Staff
- **Body:** `{ "userId": "rec123", "userName": "John" }` or `{ "userId": "" }` to clear
- **Restriction:** Cannot view as other staff members

#### GET `/portal/api/org-details`
Get organization name.

- **Auth:** User
- **Query:** `?orgId=rec123`

---

### EAG Day Pass Registration

#### POST `/eag26/api/register`
Register for a free EAG SF 2026 day pass.

- **Auth:** None
- **Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "website": "https://linkedin.com/in/johndoe",
    "isEAGAttendee": true
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "doorCode": "1234"
  }
  ```
- **Details:**
  - Creates or updates record in Airtable People table with "EAG 2026" tag
  - Sends welcome email with door code via Resend
  - Posts notification to Discord #notifications channel
  - Door code valid 9 AM – 8 PM through Feb 17, 2026

---

### Events

#### GET `/portal/api/hosted-events`
Get events hosted by user.

- **Auth:** None
- **Query:** `?userName=John`
- **Returns:** Future events where user is in "Hosted by" field

#### PATCH `/portal/api/update-event`
Update event details.

- **Auth:** None (should be staff-managed)
- **Body:** `{ "id": "rec123", "name": "...", "startDate": "...", ... }`

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message"
}
```

Common status codes:
- `400` - Bad request / validation error
- `401` - Not authenticated
- `403` - Not authorized
- `404` - Resource not found
- `429` - Rate limited
- `500` - Internal server error
