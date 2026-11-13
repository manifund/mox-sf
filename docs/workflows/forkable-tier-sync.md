# Forkable Tier Sync (Airtable Automation)

This documents how to sync Private Office and Program members to Forkable via Airtable automation, and how members are removed from Forkable when their membership ends.

## Overview

Members with specific Airtable tiers are automatically added to Forkable meal clubs:

| Airtable Tier | Forkable Club |
|---------------|---------------|
| Private Office | MOX_RESIDENTS (7097) |
| Program | MOX_MEMBERS (6314) |

This is separate from the Stripe flow (which handles Core/Resident tiers via subscription purchase).

## Airtable Automation Setup

### 1. Create New Automation

In Airtable, go to **Automations** → **Create automation**

### 2. Configure Trigger

**Trigger type:** When a record matches conditions

**Table:** People

**Conditions:**
- `Tier` is one of: "Private Office", "Program"
- `Status` is "Joined"
- `In Forkable` is unchecked (empty)

### 3. Add Action

**Action type:** Run a script

```javascript
const config = input.config();
const recordId = config.recordId;
const secret = input.config().secret;
const apiUrl = 'https://moxsf.com/api/forkable-sync';

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    recordId: recordId,
    secret: secret,
  }),
});

const result = await response.json();
output.set('result', result);
```

**Input variables:**
- `recordId`: Record ID (from trigger)
- `secret`: Your FORKABLE_SYNC_SECRET value

### 4. Environment Setup

Add to your `.env`:
```
FORKABLE_SYNC_SECRET=your-secret-here
```

Generate a secure secret:
```bash
openssl rand -hex 32
```

## Removing Members When Their Membership Ends

Rule: someone stays in the Mox Forkable clubs while they are `Joined` or `Paused`, and is removed once they are neither.

> ⚠️ The Forkable "remove" request in `app/lib/forkable.ts` (`REMOVE_MEMBER_MUTATION`) has not been verified against Forkable yet. Forkable has no API docs, so it has to be copied from the admin UI the same way the "add" request was. Until then every removal fails safely with a Discord alert. Steps are in the comment above that constant.

There are two ways a removal starts. Both go through `offboardFromForkable` (`app/lib/forkable-offboard.ts`), which looks up every People record with that email and **skips** the person if any of them is still `Joined` or `Paused`.

| Trigger | Covers |
|---------|--------|
| Airtable automation (below) | Anyone who is `In Forkable` and no longer `Joined`/`Paused` |
| Manual call with a list of emails | One-off cleanups, e.g. a program that has finished |

Airtable `Status` is the only thing that decides this; Stripe is not consulted. Removal only touches the Mox Members and Mox Residents clubs. A person who is also in their own program's Forkable club (FLF, Iliad, ...) stays in that one.

### Airtable automation

**Trigger type:** When a record matches conditions

**Table:** People

**Conditions:**
- `In Forkable` is checked
- `Status` is none of: "Joined", "Paused"

**Action:** Run a script, same as the add automation above but with `action: 'remove'` in the body:

```javascript
const config = input.config();

const response = await fetch('https://moxsf.com/api/forkable-sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'remove',
    recordId: config.recordId,
    secret: config.secret,
  }),
});

output.set('result', await response.json());
```

On success the endpoint unchecks `In Forkable`. That does not re-trigger the add automation, because that one also requires `Status` = "Joined".

### One-off cleanup by email

`In Forkable` only roughly tracks Forkable, so people can be in a club without the checkbox. For those, send a list (max 100 per request):

```bash
curl -X POST https://moxsf.com/api/forkable-sync \
  -H "Content-Type: application/json" \
  -d '{"action": "remove", "emails": ["someone@example.com"], "secret": "your-secret"}'
```

The response lists each email as `removed`, `skipped` (still active or paused, with the reason) or `failed`, and one summary is posted to Discord. Removal requires `FORKABLE_SYNC_SECRET` to be set; without it the endpoint answers 503.

## What the API Does

1. Fetches the person record from Airtable
2. Validates they're eligible (Status = "Joined", not already in Forkable)
3. Maps their Tier to the appropriate Forkable club
4. Calls Forkable API to add them to the meal club
5. Updates the "In Forkable" checkbox in Airtable
6. Sends Discord notification (if `DISCORD_NOTIFICATIONS_CHANNEL_ID` is configured)

## Manual Testing

```bash
curl -X POST https://moxsf.com/api/forkable-sync \
  -H "Content-Type: application/json" \
  -d '{"recordId": "recXXXXXXXXXXXXXX", "secret": "your-secret"}'
```

## Key Files

- API endpoint: [app/api/forkable-sync/route.ts](../../app/api/forkable-sync/route.ts)
- Removal rule and orchestration: [app/lib/forkable-offboard.ts](../../app/lib/forkable-offboard.ts), `keepsForkableAccess` in [app/lib/membership.ts](../../app/lib/membership.ts)
- Forkable client: [app/lib/forkable.ts](../../app/lib/forkable.ts)
- Environment config: [app/lib/env.ts](../../app/lib/env.ts)
