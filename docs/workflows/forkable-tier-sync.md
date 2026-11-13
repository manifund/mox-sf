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

Removal lives in the code, not in an Airtable automation. A daily cron (`/api/cron/forkable-offboard`, 23:00 UTC, mid-afternoon Pacific) reads Airtable and does the rest; nothing in Airtable needs to be set up for it.

**What it reads:** People records where `In Forkable` is checked and `Status` is Cancelled.

**What it does for each person:**

1. Looks up every People record with that email. If any of them is still `Joined` or `Paused` (or is Staff), the person is kept.
2. Otherwise removes them from the Mox Members and Mox Residents clubs in Forkable. A club run by their own program (FLF, Iliad, ...) is left alone.
3. Unchecks `In Forkable`, so they drop out of the next run.
4. Posts one summary to the Discord notifications channel if anyone was removed or a removal failed.

So to take someone out of Forkable, set their `Status` to Cancelled. If they are in Forkable but `In Forkable` is not checked (the checkbox only roughly tracks Forkable), check it and the next run picks them up.

Only Cancelled counts as ended. Invited, Applied, Payment Issue, Guest Program and other statuses are left alone.

### If Forkable refuses the request

Forkable has no API docs, and the removal request in `app/lib/forkable.ts` (`REMOVE_MEMBER_MUTATION`) was written by symmetry with the add request rather than copied from the Forkable admin UI. If Forkable does not accept it, nothing is removed, the run stops at the first person, and the Discord message lists the club and member operations Forkable does offer, with their arguments. Update `REMOVE_MEMBER_MUTATION`, `REMOVE_MEMBER_RESULT_FIELD` and `removeMemberVariables` to match and the next run goes through.

The run also stops after three failures in a row (for example when the Forkable session cookie has expired; see `.claude/skills/browser-cookie-refresh`). A person Forkable refuses individually, such as someone who is not in the club, does not count toward that and does not hold up the people after them.

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
- Removal cron: [app/api/cron/forkable-offboard/route.ts](../../app/api/cron/forkable-offboard/route.ts)
- Removal rule and orchestration: [app/lib/forkable-offboard.ts](../../app/lib/forkable-offboard.ts), `hasEndedMembership` and `keepsForkableAccess` in [app/lib/membership.ts](../../app/lib/membership.ts)
- Forkable client: [app/lib/forkable.ts](../../app/lib/forkable.ts)
- Environment config: [app/lib/env.ts](../../app/lib/env.ts)
