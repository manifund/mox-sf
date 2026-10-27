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

### POST `/guest/api/validate`
What the guest unlock page should show for a token.

- **Auth:** None (12-char token; throttled per IP)
- **Body:** `{ "token": "k7Qp2mX9bT4w" }`
- **Response:** `{ "status": "active" | "upcoming" | "expired" | "revoked" | "not-found", "guestName", "hostFirstName", "validDate" }`

### POST `/guest/api/unlock`
Open the front door for a valid guest pass.

- **Auth:** None (token; throttled per token)
- **Body:** `{ "token": "k7Qp2mX9bT4w" }`
- **Response:** `{ "success": true }` or `{ "success": false, "reason": "expired" | "not-yet" | "revoked" | "limit" | "throttled" | "not-found" | "verkada-error" }`
- **Details:** Checks the pass window (8am–11pm Pacific on Valid Date), the unlock cap, and that the host still has an allowance; then calls Verkada `admin_unlock`, bumps Unlock Count, stamps First Used, and posts to Discord #notifications.

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
      "rate": "$99/month",
      "renewalDate": "2025-02-20",
      "status": "active",
      "isPaused": false
    }
  }
  ```

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
- **Response:** `{ "allowance": 4 | null, "remaining": 2 | null, "weekStart", "weekEnd", "today", "maxDaysAhead": 7, "passes": [{ id, token, guestName, validDate, state, unlockCount, firstUsedAt, link }] }`
- **Details:** Allowance comes from `weeklyGuestPassAllowance()` (`app/lib/guest-passes.ts`); `null` means unlimited (Staff). See `docs/workflows/member-guest-passes.md`.

#### POST `/portal/api/guest-passes`
Issue a free guest pass (an unlock link) for a named guest.

- **Auth:** User
- **Body:** `{ "guestName": "Priya Natarajan", "guestEmail": "priya@example.com", "validDate"?: "2026-10-14" }` (date defaults to today, Pacific; up to 7 days out)
- **Response:** `{ "pass": { ...summary, "link": "https://moxsf.com/guest/<token>" }, "remaining": 1 }`
- **Errors:** 400 missing name, invalid email, host's own email, or bad date; 403 tier has no allowance; 409 `{ "code": "quota" }` when the week's allowance is used.

#### POST `/portal/api/guest-passes/revoke`
Revoke a guest pass. Host or staff only. Only unused passes can be revoked; a pass the guest has already used returns 409.

- **Auth:** User (own pass) or Staff
- **Body:** `{ "passId": "rec123" }`

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
