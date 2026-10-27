# Discord Integration

This document describes the Discord bot integration for member role management and notifications.

## Overview

The Discord integration:
- Syncs membership tiers and configured program participant roles from Airtable to Discord
- Reconciles every five minutes, including direct Airtable edits and members who join Discord after onboarding
- Updates channel names to display door codes
- Posts notifications about code rotations

## Environment Variables

All Discord variables are **optional**. If not configured, Discord features are silently disabled.

```
DISCORD_BOT_TOKEN              # Bot authentication token
DISCORD_GUILD_ID               # Server ID
DISCORD_ROLE_FRIEND            # Role ID for Friend tier
DISCORD_ROLE_CORE              # Role ID for Core tier
DISCORD_ROLE_RESIDENT          # Role ID for Resident tier
DISCORD_ROLE_PRIVATE_OFFICE    # Role ID for Private Office tier
DISCORD_ROLE_PROGRAM           # Role ID for Program tier
DISCORD_DOOR_CODE_CHANNEL_ID   # Channel for door code display
DISCORD_PACKAGES_CHANNEL_ID    # Channel for notifications
```

## Role Mapping

| Airtable Tier | Discord Role | Auto-Synced |
|---------------|--------------|-------------|
| Friend | Friend | Yes |
| Core | Core | Yes |
| Resident | Resident | Yes |
| Private Office | Private Office | Yes |
| Program | Program | Yes |
| Staff | (manual) | No |

**Notes:**
- Only members with `Status = "Joined"` get roles
- Staff roles are managed manually to avoid permission issues
- Changing tiers removes old role and adds new one

## Core Functions

Located in [discord.ts](../app/lib/discord.ts):

### `syncDiscordRole(discordUsername, tier, status, programIds, options)`
Finds an exact username match and assigns the membership tier plus every configured
program role linked through People.Program. Adds new roles before removing obsolete
tier roles. Existing program roles, staff roles, and unrelated roles are preserved.
Returns assignment/removal failures instead of silently reporting success.

Program mappings are explicit Airtable record IDs to Discord role IDs in
`PROGRAM_TO_ROLE` in `app/lib/discord-constants.ts`. This prevents a program name
from accidentally granting a similarly named staff role. Current mappings include
Iliad Intensive, Surplus, Frame Fellowships 1/2, Sentient Futures Residency, and
Seldon Batches 1/2. Add a mapping when setting up a new program participant role.
Unmapped program IDs are included in reconciliation results; no roles are created.

Eligibility remains `Status = Joined` and a supported active membership tier.
Program end dates do not revoke roles; membership status remains authoritative.
Staff and inactive records are skipped, not stripped of roles.

### `findDiscordMember(username)`
Searches guild for member by username. Returns Discord user ID if found.

### `assignRole(discordUserId, roleId)` / `removeRole(...)`
Low-level role management via Discord API.

### `renameDiscordChannel(channelId, newName)`
Updates channel name (used for door code display).

### `sendChannelMessage(channelId, content)`
Posts message to a channel.

### `isDiscordConfigured()`
Returns true if bot token and guild ID are set.

## API Endpoints

### POST `/portal/api/sync-discord-role`
Sync role for a single user.

- **Auth:** User (own role) or Staff
- **Body:** `{ userId }` (defaults to the signed-in member)
- Reads username, tier, status, and linked programs from Airtable; ignores client-supplied role data.

### POST `/portal/api/bulk-sync-discord-roles`
Sync roles for all members with Discord usernames.

- **Auth:** Staff only
- Shares the scheduled reconciliation implementation and returns per-record results.
- Supports `?dry=1` to inspect planned changes without writes.
- Fetches one paginated member snapshot and writes only changed roles; Discord rate limits are respected.

### GET `/api/cron/sync-discord-roles`

- **Schedule:** every five minutes, configured in `vercel.json`
- **Auth:** `Authorization: Bearer {CRON_SECRET}`; rejects an unset secret
- **Dry run:** `?dry=1`
- **Timeout:** 300 seconds, stops processing after 240 seconds and reports pending records
- **Results:** synced/changed/failed/skipped/pending counts, per-record details, unmapped program IDs
- **Failures:** non-2xx for failed or incomplete execution; per-record mismatches are reported as skipped
- **Identity:** exact current usernames only (case/whitespace/@ normalized); no fuzzy or display-name grants
- **Duplicates:** multiple active Airtable records with the same username are skipped for review

The scheduled run retries all eligible records, so correcting a username or joining
Discord is picked up automatically. A successful run can include skipped accounts;
inspect `results.skipped` for identity corrections. Authentication and API errors are
logged. Program/profile syncs also run after profile updates and Discord linking.

### POST `/portal/api/update-discord`
Bulk update Discord usernames in Airtable.

- **Auth:** Staff only
- **Body:** `{ mappings: [{ personId, discordUsername }] }`

## Admin Tools

Located at `/portal/admin/discord-mapping`:

### Discord Mapping Tool
Matches Discord members to Airtable records using fuzzy matching:
- Parses various Discord export formats
- Uses Levenshtein distance for name matching
- Prioritizes server nicknames (often real names)
- 70% confidence threshold for auto-match

### Bulk Role Sync
One-click sync for all linked Discord members.

## Door Code Integration

The weekly cron job (`/api/cron/rotate-door-code`) updates Discord:

1. Renames door code channel: `🚪 Code: 1234#`
2. Posts to packages channel with rotation notice

## Notification Types

The bot posts notifications to `DISCORD_PACKAGES_CHANNEL_ID` (aka #notifications):

| Event | Message Format |
|-------|----------------|
| Door code rotation | Weekly code change announcement |
| Package arrival | Package notification for member |
| EAG day pass registration | Name, email, and website of registrant |

### EAG Day Pass Notifications

When someone registers for an EAG day pass at `/eag26`, a notification is posted:

```
🎫 **EAG Day Pass Registration**
**Name:** John Doe
**Email:** john@example.com
**Website:** https://linkedin.com/in/johndoe
```

This is triggered by `POST /eag26/api/register`.

## Rate Limiting

Built into `discordFetch()`:
- Automatic retry on rate limit
- Respects `retry-after` header
- Max 3 retry attempts

## Bot Permissions Required

The Discord bot needs:
- Manage Roles (to assign/remove tier roles)
- Manage Channels (to rename door code channel)
- Send Messages (for notifications)
- View Channel (to access channels)

Bot role must be **higher** than the tier roles it manages.

## Troubleshooting

**Role sync fails with 403:**
- Bot role may be below the target role in hierarchy
- Check bot has "Manage Roles" permission

**Member not found:**
- User may have left the server
- Username may have changed (Discord allows this)

**Rate limited:**
- Discord API calls respect rate-limit responses
- Wait for retry-after period

**Discord not configured:**
- Check environment variables are set
- `isDiscordConfigured()` returns false if missing
