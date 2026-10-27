This project uses Bun as its package manager. Use `bun install`

## Documentation

- **`docs/airtable-schema.md`** - Airtable table schemas and field definitions
- **`docs/api-endpoints.md`** - API route documentation
- **`docs/discord-integration.md`** - Discord bot setup and integration
- **`docs/deployment.md`** - Deployment process
- **`support-bot/README.md`** - The Discord building-support bot (#report-an-issue). A separate Node service with its own npm tooling, not part of the Next.js app
- **`docs/workflows/`** - Detailed workflow docs

Please help keep these up to date.

## Automations

Automations are auto-discovered by `bun scan-automations` which generates `app/lib/automations-manifest.ts`. The staff dashboard at `/portal/admin/automations` shows all automations. After adding a new automation route, run `bun scan-automations` to regenerate the manifest. See `docs/workflows/automation-dashboard.md` for details.

## Key Configuration Files

- **`app/lib/env.ts`** - All environment variables (Airtable, Stripe, Discord, Verkada, etc.)
- **`app/lib/airtable.ts`** - Airtable client + table names
- **`app/lib/discord-constants.ts`** - Discord guild ID, role IDs (Friend/Core/Resident/Private Office/Program), channel IDs, tier-to-role mappings
- **`app/lib/stripe.ts`** - Stripe client initialization
- **`app/people/people.ts`** - People table field definitions and queries

## Testing

Use `bun run test` (not `bun test`) to run tests. This project uses vitest, and `bun test` invokes Bun's native test runner which has incompatible APIs.

## Dev Server

Often, I am already running the server via `bun dev`, such that the dev server logs are piped to `/tmp/dev-server.log` for you to access. Before spinning up a dev server, check first to see if that's running and the logs are accessible.

**To check logs:** `tail -100 /tmp/dev-server.log` (or `tail -f` to watch live) Use this proactively.

The user sees logs in their terminal in real-time; you can read the same logs from the file.

**Chrome dev tools**
In general, you should be checking your own work, especially for UI work, through the browser.

At any time, if you are reaching an mcp-tool-use error with chrome devtools, you have authority to `pkill` the previous devtools process.


## Git Workflow
When you start a new feature or task:

1. Check the current branch with `git branch --show-current`
2. If on `main` or `master`, use judgment about whether to branch:
   - **Small or routine changes** (copy edits, find-and-replace, config tweaks, single-file fixes) — just commit on `main`. A branch is overhead here.
   - **Big or risky changes** (large refactors, new features, schema/migration work, anything worth reviewing as a PR) — create a feature branch first. If it's a close call, say so and ask rather than branching silently.
3. If on a branch that has a nondescript name, or doesn't seem related to the current task (e.g., working on "discord-bot" branch but asked to build a payments feature), ask the user to confirm whether to:
   - Continue on the current branch
   - Create a new branch from main
   - Switch to an existing branch

Committing is not the same as pushing — only push when asked.
