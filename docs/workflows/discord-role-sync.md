# Discord Role Sync

The backend reconciles Airtable membership tiers **and linked programs** with
Discord every five minutes. It also syncs after portal profile updates, Discord
linking, and staff/manual sync requests.

1. Read People.Name, Discord Username, Tier, Status, and Program from Airtable.
2. Keep Joined members with supported active membership tiers; staff are manual.
3. Fetch every Discord guild-member page and index current usernames.
4. Skip missing/ambiguous identities and duplicate active Airtable usernames,
   returning actionable per-record reasons. Never guess a similar account.
5. Add the tier role and each explicit `PROGRAM_TO_ROLE` mapping. For example,
   `Iliad Intensive` maps to `Iliad`, in addition to `Program Member`.
6. Remove obsolete membership tier roles only after additions succeed. Preserve
   program, staff, and unrelated roles.
7. Report failures, skipped records, pending records, and unmapped program IDs.
   Repeat on the next scheduled run; already-assigned roles require no writes.

The single-member endpoint loads the authorized Airtable record itself instead of
accepting the browser's tier/status/program claims. The batch and scheduled routes
share `app/lib/discord-role-sync.ts` to avoid divergent behavior.

- Cron: `/api/cron/sync-discord-roles`, bearer CRON_SECRET, every five minutes.
- Staff batch: `/portal/api/bulk-sync-discord-roles`.
- Both support `?dry=1` for zero-write diagnostics.
- Cron registration: `vercel.json`; regenerate the automation dashboard with
  `bun run scan-automations` after adding routes.
- Detailed configuration, mappings, response behavior, and troubleshooting:
  [Discord integration](../discord-integration.md).
