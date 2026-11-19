# Subscription Pause/Resume Flow

This document describes the flow for pausing and resuming member subscriptions.

## Flowchart

```mermaid
flowchart TD
    subgraph Frontend["Frontend (SubscriptionInfo.tsx)"]
        A[User views Subscription card] --> B{Subscription paused?}
        B -->|No| C[Show 'Pause' button]
        B -->|Yes| D[Show pause banner with 'Resume' button]

        C --> E[User clicks 'Pause']
        E --> F[Open Pause Modal]
        F --> G[User enters:<br/>- Resume date optional<br/>- Reason required]
        G --> H[Click 'Confirm Pause']

        D --> I[User clicks 'Resume']
    end

    subgraph PauseAPI["POST /portal/api/pause-subscription"]
        H --> J{Session valid?}
        J -->|No| K[401 Unauthorized]
        J -->|Yes| L{Reason provided?}
        L -->|No| M[400 Bad Request]
        L -->|Yes| N{Resume date valid?}
        N -->|Invalid| O[400 Bad Request]
        N -->|Valid or empty| P[Get effective user ID]
        P --> Q{Admin viewing<br/>as another user?}
        Q -->|Yes| R[Use viewingAsUserId]
        Q -->|No| S[Use session.userId]
        R --> T[Fetch user from Airtable]
        S --> T
        T --> U{User has<br/>Stripe Customer ID?}
        U -->|No| V[404 Not Found]
        U -->|Yes| W[Get active subscription<br/>from Stripe]
        W --> X{Active subscription<br/>exists?}
        X -->|No| Y[404 Not Found]
        X -->|Yes| Z[Update Stripe subscription<br/>pause_collection: void]
    end

    subgraph PauseNotifications["Pause Notifications"]
        Z --> AA[Email staff team@moxsf.com]
        AA --> AB[Email user confirmation]
        AB --> AC{Admin acting<br/>for another user?}
        AC -->|Yes| AD[Email admin confirmation]
        AC -->|No| AE[Return success response]
        AD --> AE
    end

    subgraph ResumeAPI["DELETE /portal/api/pause-subscription"]
        I --> BA{Session valid?}
        BA -->|No| BB[401 Unauthorized]
        BA -->|Yes| BC[Get effective user ID]
        BC --> BD[Fetch user from Airtable]
        BD --> BE{User has<br/>Stripe Customer ID?}
        BE -->|No| BF[404 Not Found]
        BE -->|Yes| BG[Get subscription from Stripe]
        BG --> BH{Subscription<br/>is paused?}
        BH -->|No| BI[400 Bad Request]
        BH -->|Yes| BJ[Update Stripe subscription<br/>pause_collection: null<br/>plus trial to Jan 1, 2027 for Core/Friend<br/>while the 2026 promo runs]
    end

    subgraph ResumeNotifications["Resume Notifications"]
        BJ --> BK[Email staff team@moxsf.com]
        BK --> BL[Email user confirmation]
        BL --> BM{Admin acting<br/>for another user?}
        BM -->|Yes| BN[Email admin confirmation]
        BM -->|No| BO[Return success response]
        BN --> BO
    end

    subgraph UpdateUI["Update UI"]
        AE --> CA[Refresh subscription data]
        BO --> CA
        CA --> CB[Update SubscriptionInfo component]
    end
```

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Frontend UI | `app/portal/SubscriptionInfo.tsx` | Pause modal, resume button, status display |
| API Route | `app/portal/api/pause-subscription/route.ts` | POST (pause) and DELETE (resume) handlers |

## Pause Options

1. **With resume date**: Stripe auto-resumes billing on specified date
2. **Indefinite**: No `resumes_at` set; user must manually resume

## Email Notifications

| Event | Recipients |
|-------|------------|
| Pause | Staff (team@moxsf.com), User, Admin (if acting for another user) |
| Resume | Staff (team@moxsf.com), User, Admin (if acting for another user) |

## Stripe Integration

- Uses `pause_collection.behavior: 'void'` - doesn't collect payment, adjusts billing cycle
- Pause reason stored in subscription metadata
- Resume clears `pause_collection` to `null`

## Airtable

The pause route itself never writes to Airtable. Stripe sends
`customer.subscription.updated` after the pause or resume, and the Stripe
webhook sets the member's `Status` to `Paused` or back to `Joined`. This also
covers a pause that ends on its own at `resumes_at`. See
`docs/workflows/stripe-airtable-sync.md`.

## Admin "View As" Feature

When staff members use the "view as" feature to manage another user's subscription:
- The `viewingAsUserId` session field identifies the target user
- Both the target user AND the admin receive email notifications
- This provides an audit trail for admin actions
