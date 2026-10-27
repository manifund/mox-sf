# Careers: Job Signals, Roles Board, and AI Matching

Tracks who in the community is looking for work or hiring, maintains a public
board of open roles at member orgs, and uses Claude to suggest matches and
event picks.

## Privacy model (read this first)

- **Job status, Hiring, LinkedIn, and Career notes on People are
  staff-only.** The profile form says so explicitly. They are never rendered
  in the directory, on public pages, or to other members — no badges. Staff
  see them at `/portal/admin/careers` and make intros by hand.
- **Job-match suggestions go to staff, not to members.** The
  `career-matching` cron emails carolina@moxsf.com; nothing career-related is
  ever emailed to the member.
- **The roles board is public** (`/jobs`) — job postings are public
  information. Roles linked to stealth orgs are excluded.
- **Event suggestions are opt-in** via the `Event digest` checkbox, with an
  unsubscribe pointer in every email.

## Components

### 1. Profile "career" section — `/portal/profile/edit`

Members self-report: job status (Looking now / Open to offers / Not looking),
"I'm hiring", LinkedIn, and free-text notes for staff — plus the separate
weekly event digest opt-in. Saved via `/portal/api/update-profile` (which now
derives the target record from the session instead of trusting a posted
userId).

### 2. Staff careers admin — `/portal/admin/careers`

Staff-only: everyone looking for work (with links + notes), members who are
hiring, orgs that are hiring or have a `Careers URL`, and a link to the
public board.

### 3. Roles board — `/jobs` + `scrape-roles` cron (Mondays, 11:00 UTC)

The cron fetches each org's `Careers URL`, has Claude
(`claude-opus-4-8`, structured outputs) extract the open roles, and diffs
them against the Roles table by normalized title:

- new roles → created with Status **Open**, Source **Careers page**
- still-listed roles → `Last verified` bumped (Stale ones reopen)
- vanished roles → Status **Stale** (only the scraper's own Open roles;
  Manual/Member entries are never auto-touched)

`/jobs` lists Open roles grouped by org, Mox's own openings pinned first.
Each role is an expandable card: description bullets, salary, application
deadline, an "About the organization" blurb, and an open-listing/apply
button. All of that detail is **inferred, not hand-entered**: for each new
role with its own posting page the scraper fetches it and extracts
description/salary/deadline (capped at 8 per org per run), and each org's
`About` blurb is generated once from its public `Website` (never
overwriting a hand-edited value).

Manual options: `?org=recXXX` (single org), `?dry=1` (no writes). Diff logic
lives in `app/lib/roles.ts` (unit tested).

### 4. Job matching — `career-matching` cron (Tuesdays, 17:00 UTC)

Claude matches current job seekers against Open roles (max 3 per seeker,
none is fine) and emails the suggestions **to staff** for warm intros.
Skips silently when there are no seekers, no roles, or no `ANTHROPIC_API_KEY`.
`?to=<x>@moxsf.com` overrides the recipient.

### 5. Event suggestions — `event-suggestions` cron (Wednesdays, 17:00 UTC)

For each opted-in member: Claude picks their top 3 events in the next 14 days
(Confirmed/Recurring, Public/Members) from their Work thing / Fun thing, and
emails them with a one-line why. `?dry=1` previews picks without sending;
`?to=<x>@moxsf.com` reroutes all emails for testing.

## Configuration

- `ANTHROPIC_API_KEY` (in `app/lib/env.ts`, optional) — all three LLM crons
  no-op with a log line when unset.
- Model + JSON helper: `app/lib/claude.ts`. Careers queries:
  `app/lib/careers.ts`.

## Deliberately not built (yet)

- 1:1 member matching — parked; when it happens, delivery is email
  suggestions, not auto-created Discord chats.
- Day-pass guest career question, member "post a role" form, 80,000 Hours
  feed.
