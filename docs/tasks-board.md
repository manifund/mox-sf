# Task board (`app/tasks`, served at tasks.moxsf.com)

A public board of small, well-scoped tasks. Anyone can browse; **claiming
requires Google sign-in**. A claim means "I'm doing this today": a nudge email
after `TASKS_NUDGE_HOURS` (8h) and auto-release after `TASKS_RELEASE_HOURS`
(24h). Every completion waits for organizer review — approve by reacting ✅ on
the Discord message. A proof photo can be attached but never auto-closes.

## Auth (deliberately isolated)

Google sign-in is scoped to `/tasks` **only** and never touches member auth:

- **Claimers** (outside volunteers/contractors) sign in with Google. The flow
  (`app/tasks/auth/google/*`) mints a separate `mox-tasks` iron-session cookie
  via `app/lib/tasks-auth.ts`. It does not read or write `mox-session`.
- **Organizers** (add/approve) are recognized via the existing **email-based**
  member session (`requireStaff`) or the `TASKS_ORGANIZER_EMAILS` allowlist —
  never Google alone. See `isOrganizer()` in `tasks-auth.ts`.
- The member portal's email/magic-link auth is unchanged.

## Data (`app/lib/tasks.ts`)

Two tables in the **dedicated task-board base** (`TASKS_AIRTABLE_BASE_ID`, the
"Mox ᴛᴀꜱᴋꜱ" base — _not_ the main Mox base), read/written through the shared
`app/lib/airtable.ts` (which routes these tables to that base):

- **Tasks** — one row per task; `Status = Open` shows publicly. Fields: Title,
  Summary, Brief, Done criteria, Context links, Skills, Effort, Status, Floor,
  Map point, Task type (Volunteer/Contractor — drives the board tabs; empty
  counts as Volunteer), Priority, Repeat, Created by name/email, Claimant
  name/email, Claimed/Nudged/Completed at, Completion note, Proof photo,
  Reference photos, Discord message ID.
- **Claims** — append-only activity log (Claimed / Completed / Released /
  Auto-released / Approved / Reopened). Fields: Event, Task, Name, Email,
  Type, At, Note.
- **Task Comments** — conversation threads on task pages. Fields: Name,
  Task, Author name, Author email, Comment, At, Task rec id (plain record
  id of the linked task, used to filter a task's thread by formula).

## Design

The board's visual identity lives in `app/tasks/tasks.css` — a hand-crafted
stylesheet (recovered from the original July 2026 standalone mox-tasks app):
neutral gray surfaces, Playfair Display headings, Fira Sans UI, rounded cards
with soft shadows, and amber reserved for links/accents (gold in dark mode).
Every selector is scoped under the `.tasksui` wrapper (applied in
`app/tasks/layout.tsx` and re-applied on the portal-rendered modal) so nothing
leaks into the rest of moxsf.com. The header wordmark is
`/images/mox_logo_text.svg` + small-caps ᴛᴀꜱᴋꜱ, inverted in dark mode.

## Volunteer / Contractor tabs

The board has two tabs — **Volunteer tasks** (default, `/`) and **Contractor
tasks** (`/?type=contractor`) — split by the Task type field. Tag links, card
links back from the task page, and the add/edit form all carry the tab
through; the form's "Who's it for?" picker sets the field.

Attachments follow the repo convention: upload to ImgBB (`IMGBB_API_KEY`), store
the URL (`uploadTaskImage`).

## Map

`app/lib/tasks-floorplans.ts` is a bundled snapshot of the 1680 Mission room
plans (real room polygons, floor-frame inches) used to render the pin picker
(`app/tasks/FloorMap.tsx`). The repo's own `Floors` table only has static SVG
images with no room coordinates, so it can't drive clickable pins — hence the
dedicated snapshot. `Floor` (1st–4th) maps to a plan story via `storyForFloor`;
Rooftop has no plan.

## Creators, editing, periodic tasks (mox-sf#100)

- Every task records its creator (`Created by name/email`, set from the acting
  session when posted on the site). Creators are **emailed** when their task is
  claimed, completed (needs review), released, or auto-released.
- **Edit / Archive**: organizers and the task's creator see "Edit task" and
  "Archive" on the task page (PATCH/DELETE `/api/tasks/[id]`). Archive is a
  soft delete (Status = Archived); hard-delete happens in Airtable.
- **Periodic tasks**: a task with `Repeat` = Weekly/Monthly automatically goes
  back to Open that long after completion (sweep pass), with a 🔁 marker on the
  board and a Discord ping.

## Floors & priority

The board groups open tasks by floor (1st → Rooftop, then "Anywhere"), and
within each group sorts by urgency. Each card shows a glowing priority dot on
the right: blue = Low, yellow = Medium, red = High (pulses). Unset priority
counts as Medium. Set it in the task form or the `Priority` field in Airtable.

## Comments

Every task page has a Conversation section. Any signed-in visitor (Google
claimer or staff member) can comment (POST `/api/tasks/[id]/comments`, max
2000 chars). Each comment posts to the tasks Discord channel and emails
everyone already in the thread — the creator, the claimant, and earlier
commenters — minus the poster.

## Discord + email + crons

- Completions post to `DISCORD_CHANNELS.TASKS` via `sendChannelMessage`. **The
  Mox bot must have View Channel + Read Message History there** for approvals.
- Nudge/auto-release/digest emails go out via `sendEmail` (Resend).
- `app/api/cron/tasks-sweep` (every 15m) — nudges, auto-releases, and closes
  "In review" tasks that got a ✅ reaction. `app/api/cron/tasks-digest`
  (daily 16:00 UTC) — organizer summary. Both guarded by `CRON_SECRET`.

## Routing

`tasks.moxsf.com` is served by a host rewrite in `next.config.js` (only the
bare `/` → `/tasks`, so `_next`/`api`/assets are untouched). Deep links stay
under `/tasks/*`.

## Env vars

| Var                                                     | Purpose                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `TASKS_AIRTABLE_BASE_ID`                                | The dedicated task-board base (defaults to the "Mox ᴛᴀꜱᴋꜱ" base, `appkShwDFk3Z3Yruc`)                                        |
| `TASKS_AIRTABLE_API_KEY`                                | Optional dedicated token for that base, when the main `AIRTABLE_API_KEY` has no access to it (falls back to the main key)    |
| `TASKS_GOOGLE_CLIENT_ID` / `TASKS_GOOGLE_CLIENT_SECRET` | Google OAuth for claimers. Redirect URI: `https://moxsf.com/tasks/auth/google/callback` (and the tasks.moxsf.com equivalent) |
| `TASKS_ORGANIZER_EMAILS`                                | Comma-separated fallback organizers (staff are auto-recognized)                                                              |
| `TASKS_NUDGE_HOURS` / `TASKS_RELEASE_HOURS`             | Clock, default 8 / 24                                                                                                        |
| `TASKS_BASE_URL`                                        | Public base for email/Discord links, default `https://tasks.moxsf.com`                                                       |

Reuses existing `AIRTABLE_*`, `RESEND_API_KEY`, `DISCORD_BOT_TOKEN`,
`IMGBB_API_KEY`, `CRON_SECRET`, `SESSION_SECRET`.
