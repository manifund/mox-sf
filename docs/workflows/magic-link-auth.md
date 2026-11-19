# Magic Link Authentication

Email-based passwordless login flow.

## Flow Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant L as Login Page
    participant API as /api/send-magic-link
    participant AT as Airtable
    participant R as Resend
    participant E as Email
    participant V as /portal/verify

    U->>L: Enter email
    L->>API: POST {email}

    API->>API: Validate email format
    API->>API: Check rate limit (3/15min)

    alt Rate limited
        API-->>L: 429 Too Many Requests
    else OK
        API->>AT: Find user by email (case-insensitive)

        alt User not found
            API-->>L: 200 OK (silent fail)
            Note right of API: Security: don't reveal if email exists
        else User found
            API->>API: Generate 32-byte token
            API->>API: Set 24hr expiry
            API->>AT: Update token + expiry
            API->>R: Send magic link email
            R->>E: Deliver email
            API-->>L: 200 OK
        end
    end

    U->>E: Click magic link
    E->>V: GET ?token={token}

    V->>V: Validate token format
    V->>AT: Find user by token

    alt Token invalid/expired
        V-->>U: Redirect to /portal/login?error=invalid
    else Token valid
        V->>V: Check if Staff tier
        V->>V: Create session (iron-session)
        V->>AT: Clear token (one-time use)
        V-->>U: Redirect to /portal
    end
```

## Rate Limiting

```mermaid
flowchart LR
    A[Request] --> B{Same email in last 15min?}
    B -->|< 3 requests| C[Allow]
    B -->|>= 3 requests| D[429 Rate Limited]
```

## Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Generated: User requests login
    Generated --> Stored: Saved to Airtable
    Stored --> Sent: Email delivered
    Sent --> Clicked: User clicks link
    Clicked --> Verified: Token valid
    Clicked --> Expired: Token > 24hrs old
    Verified --> Cleared: Token removed
    Cleared --> [*]
    Expired --> [*]
```

## Security Features

- 32-byte cryptographically random token (64 hex chars)
- 24-hour expiration
- One-time use (cleared after verification)
- Silent failure for unknown emails
- Rate limiting per email address

## Key Files

- Login page: [app/portal/login/page.tsx](../../app/portal/login/page.tsx)
- Send link: [app/portal/api/send-magic-link/route.ts](../../app/portal/api/send-magic-link/route.ts)
- Verify: [app/portal/verify/route.ts](../../app/portal/verify/route.ts)
