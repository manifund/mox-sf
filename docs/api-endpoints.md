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
Get user's Verkada entry PIN.

- **Auth:** User
- **Response:** `{ "pin": "123456", "hasAccess": true }`

#### POST `/portal/api/verkada-pin`
Regenerate Verkada PIN.

- **Auth:** User
- **Response:** `{ "pin": "654321", "hasAccess": true }`

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

#### POST `/portal/api/create-day-pass-checkout`
Create day pass checkout.

- **Auth:** User
- **Body:** `{ "stripeCustomerId": "cus_xxx", "userName": "...", "userEmail": "..." }`
- **Response:** `{ "url": "https://checkout.stripe.com/..." }`

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
