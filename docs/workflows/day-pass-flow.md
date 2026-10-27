# Day Pass Purchase & Activation Flow

This document describes the flow for purchasing and activating day passes.

> **Note:** For the free EAG SF 2026 day pass flow, see [eag-day-pass-flow.md](./eag-day-pass-flow.md).

## Flowchart

```mermaid
flowchart TD
    subgraph Purchase["Purchase Flow"]
        A[Customer visits /day-pass] --> B[Selects pass type]
        B --> C[Redirected to Stripe checkout]
        C --> D[Completes payment]
        D --> E[Stripe sends webhook]
    end

    subgraph Webhook["Stripe Webhook (app/api/webhooks/stripe/route.ts)"]
        E --> F{Event type?}
        F -->|checkout.session.completed| G[Get line items]
        G --> H{Is day pass product?}
        H -->|No| I[Ignore event]
        H -->|Yes| J[Extract customer info]
        J --> K[Create Airtable record]
        K --> L[Send activation email]
    end

    subgraph Activation["Activation Flow"]
        L --> M[Customer clicks email link]
        M --> N["Visits /day-pass/activate"]
        N --> O[Frontend calls activation API]
        O --> P{Record exists in Airtable?}
        P -->|No| Q["Show 'not found' error"]
        P -->|Yes| R{Status?}
        R -->|Expired| S["Show 'expired' error"]
        R -->|Unused| T["Update status to Activated"]
        R -->|Activated| U[Continue to show code]
        T --> U
        U --> V[Fetch door code from Verkada]
        V --> W[Display door code to customer]
    end

    subgraph DoorAccess["Door Access"]
        W --> X[Customer can click 'Unlock Door Now']
        X --> Y[API calls Verkada to unlock]
        Y --> Z[Door unlocks remotely]
    end
```

## Products

| Product | Price |
|---------|-------|
| Day Pass | $70 |
| Happy Hour Pass | $40 |
| Week Pass | TBD |

Product IDs are configured in the Stripe webhook handler.

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Purchase Page | `app/day-pass/page.tsx` | Display pass options with Stripe payment links |
| Stripe Webhook | `app/api/webhooks/stripe/route.ts` | Handle payment completion, create Airtable record, send email |
| Activation Page | `app/day-pass/activate/page.tsx` | Display door code after activation |
| Activation API | `app/day-pass/activate/api/route.ts` | Validate pass, fetch Verkada door code |
| Door Unlock API | `app/day-pass/activate/unlock-api/route.ts` | Remote door unlock via Verkada |

## Airtable Schema (Day Passes table)

| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Stripe payment intent ID (used as unique identifier) |
| Username | Text | Customer name from Stripe |
| Email | Email | Customer email |
| Pass Type | Single Select | Day Pass, Happy Hour Pass, or Week Pass |
| Status | Single Select | Unused, Activated, or Expired |
| Date Purchased | Date | When payment was made |
| Date Activated | Date | When customer first accessed the code |

## Environment Variables Required

See [deployment.md](../deployment.md) for the full list. Key variables for this flow:

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` - Stripe API
- `AIRTABLE_BASE_ID` / `AIRTABLE_API_KEY` - Airtable access
- `VERKADA_*` - Door access control
- `RESEND_API_KEY` - Email delivery

## Stripe Webhook Setup

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter endpoint URL: `https://moxsf.com/api/webhooks/stripe`
4. Select events to listen to: `checkout.session.completed`
5. Copy the signing secret and add it as `STRIPE_WEBHOOK_SECRET` env var

### Testing Locally

Use Stripe CLI to forward webhooks to localhost:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This will output a webhook signing secret for local testing.

## Email Notifications

When a day pass is purchased, the customer receives an email with:
- Pass type and description
- Activation link
- Address and entry instructions

## Error Handling

- **Invalid signature**: Webhook rejected (Stripe will retry)
- **Missing customer email**: Logged but not retried
- **Airtable creation fails**: Logged, email not sent
- **Email send fails**: Logged but record still created

## Fulfillment failures and recovery

The paid-pass webhook returns HTTP 500 on Airtable or activation-email errors so
Stripe can retry. New passes use the existing Notes field to track delivery:
`day-pass-activation:pending` until the email provider accepts the message, then
`day-pass-activation:sent`. Do not edit these markers while fulfillment is pending.
Retries resume pending email delivery without creating another pass. Existing
passes without a pending marker are left alone, including manually restored
passes identified by a Stripe payment intent ID. If the delivery-status write
fails after email acceptance, a retry may send another email; it does not issue
another pass. Concurrent webhook deliveries still depend on the existing
lookup-before-create deduplication (Airtable does not enforce uniqueness).

The production Airtable token requires `data.records:read` and
`data.records:write`, access to the Mox base, and a token owner who can edit it.
A successful read does not verify write access. Permission failures also break
login-token persistence, event creation, room bookings, and pass activation.
After restoring the credential, reconcile Stripe purchases against Day Passes
before replaying historical events: earlier code acknowledged failed purchases
with HTTP 200, so Stripe will not automatically redeliver those failures.
