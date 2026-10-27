# Mox Building Support Bot — Implementation Spec

**Version:** 2.5
**Owner:** Jen Baik
**Status:** ✅ Ready to build — config complete, nothing blocking
**Target:** 1-week pilot, offices first
**Scope:** Discord only. The web form is designed for but explicitly **not built** in this version.

> **How to use this document:** it is written to be handed to a coding agent and executed top to
> bottom. Every value the bot needs from a human is a `<<PLACEHOLDER>>` and every one of them is
> collected in **`SETUP.md`** — fill that in first. Don't start Phase 1 until `config.yaml` has no
> placeholders left in it.

---

## Changelog

**v2.5 — this version**
- `#team-carolina` landed. **`config.yaml` has no placeholders left** — the bot can boot.
- **Ideas stay unassigned by decision** (§12.2 O1). The digest keeps them visible with a count and
  the age of the oldest, rather than pretending someone owns them.
- Channel usage written out explicitly (§12.1) so the "nothing below P0 leaves
  #report-an-issue" rule can't drift.

**v2.4**
- **Jake and Whit are separate owners**, splitting facilities work 50/50 by ticket-number parity
  (§7.2.1). A P0 still mentions both.
- **Reassign specced properly** (§6.4.2) — on every card, other half of the rota listed first.
- **Notion is read-only in practice** (§6.4.3), with an honest answer on why write-back isn't in scope.
- **Monday digest**: open tickets listed in full, closed ones condensed to a one-sentence recap plus
  **at most four bullets**, written by Haiku (§9.3).
- **Closed tickets now auto-vanish** from the Notion board — the "Open issues" filter was applied.
- The Notion page now opens with a user-facing "how to use this" section.

**v2.3**
- **Triage gets a judgment tier.** When the category doesn't fit or the model isn't confident, it
  picks the owner by reasoning about who each person actually is, instead of forcing a bad category
  match. (§4.4.2, R3)
- **`prompts/triage.md` now ships with the spec** and carries the descriptions of Jake, Whit,
  Carolina, Robin and Claudio. That file is where routing intuition lives — edit it, not the code.
- **Three new categories:** `events` → Claudio, `operations` → Robin, `space` → Carolina.
- **The default owner is now Carolina, not Jake.** Jake is the chief engineer; his queue should be
  building work. Most non-building things belong to Carolina and she routes onward.
- **Robin is a routed owner again** — operations, automations, event strategy.

**v2.2**
- **No DMs for delivery.** P1/P2 for Jake, Whit and Carolina are an `@mention` on the thread card,
  inside `#report-an-issue`. Nothing leaves the channel. (§7.5)
- **P0 breaks out to a team channel** — `#team-jake` for facilities, **`#team-carolina`** for door
  codes. Claudio gets `#team-claudio` at every priority.
- **DMs are now only ever nudges** (§7.5.2).
- Dropped the DM-card button machinery from v2.1 — with one card per ticket it isn't needed.
- Whit's user ID was wrong in v2.1 (it was Carolina's). Corrected, and all 13 IDs verified collision-free.

**v2.1**
- **Delivery split from routing.** Facilities and door codes were DM-first — superseded by v2.2. (§7.5)
- **Door codes move from Robin to Carolina.** Robin is no longer an owner. (§7.2)
- **Overnight changed** — Claudio owns 00:00–17:00, contractors own 17:00–24:00. (§7.4)
- **Closed cards collapse** to a single struck-through line. (§6.5)
- **New: the standing queue** — one pinned, self-updating message showing everything open, grouped
  by owner. This is the answer to "you'd have to scroll to find yours". (§9.4)
- Real Discord IDs landed in `config.yaml`; two are still wrong (§12.1).

**v2.0**
- **Web form removed from scope.** Discord only. The intake seam stays so it can be added later without a rewrite (§2.4).
- **Routing rewritten** to Jen's model: six rules, six destinations (§7.3). New owners **Robin** (door codes) and **Jake + Whit together** (facilities). Safety pings **@mox staff**.
- **Hours changed** — Claudio 05:00–17:00, contractors 17:00–05:00 (§7.4).
- **P3 added** for ideas and wishlist items (§4.1).
- **Three ticket types** — Issue / Idea / Question (§4.2).
- **Staff role is `@mox staff`**, and every member of it can see every ticket (§2.3, §6.3).
- Merged from the parallel v1.3 branch: **public tickets** (§6.9) — unchanged except that the staff role name and the routing table are now the v2.0 ones.
- Merged from the parallel v1.3 branch: **thread-first staff interaction** (§6.4) after Jake's feedback.

> **Fork note:** two v1.3 documents existed — one added public tickets, one added the form, ideas
> and the conversation changes. This version is the merge of both. There is no other live spec.

---

## 0. For Jen

**What this builds:** a Discord bot in `#report-an-issue`. Member taps a button → a thread opens →
Claude Haiku reads it immediately and works out what kind of thing it is and who owns it → the
member picks an urgency → a card lands in the right channel → staff react 👀 to claim and ✅ to
close, or jump into the thread and talk → the reporter is kept informed → a row lands on the
**Building Tickets** board in Notion.

**Your routing, as built:**

| What it is | Who | P1 / P2 | P0 |
|---|---|---|---|
| Safety — injury, fire, flood, gas, break-in | **@mox staff** | — | `#team-jake` + role pinged |
| Plumbing · wifi · power · desks · appliances · security | **Jake + Whit** | `@Jake @Whit` on the ticket | + `#team-jake` |
| Door codes & access codes | **Carolina** | `@Carolina` on the ticket | + `#team-carolina` |
| Space, member experience, anything that doesn't fit | **Carolina** | `@Carolina` on the ticket | + `#team-carolina` |
| Systems, automations, event strategy | **Robin** | `@Robin` on the ticket | + `#team-robin` |
| Stocking, cleaning & event setup, 00:00–17:00 | **Claudio** | `#team-claudio` | `#team-claudio` |
| Stocking & cleaning, 17:00–24:00 | **Contractors** | `#mox-contractor-requests` | *never — reroutes* |
| Ideas & nice-to-haves | **Nobody** | P3 on the board. No card, ever. | — |

**Triage can now think, not just look up.** When a request doesn't fit a category — *"someone left a
bike blocking the 2F corridor"* — the model reasons about who's actually best placed, using written
descriptions of what each of you does, and shows its reasoning on the card. **Carolina is the
default**, since most non-building things are hers and Jake's queue should stay building work.
Those descriptions live in `prompts/triage.md`, which ships with this spec — that's the file to edit
when routing intuition changes, not the code.

**The structural idea:** routing and delivery are two different things. Routing decides *who owns
it*; delivery decides *where the notification lands*. That's what lets Jake work from mentions while
Claudio works from a channel, on one pipeline.

**Ordinary tickets never leave `#report-an-issue`.** The card lives in the ticket thread and the
owner is @-mentioned on it. Only a P0 breaks out into a team channel — and Claudio and the
contractors, whose work is channel-based by nature.

**The bot does not DM to deliver a ticket.** DMs are for nudges only (§7.5.2).

**What I decided for you.** Each is one config line, all are in §12:

1. **Appliances** → Jake + Whit, confirmed.
2. **P2 still exists.** Ideas are P3 with no owner, but "restock the mugs" is real work, so it stays
   P2 with Claudio. Members pick from three buttons; the AI assigns P3 on its own.
3. **Robin is configured but unrouted** — door codes went to Carolina and nothing else was his.
   One line in `category_owner` turns him back on.

**What I need from you:** the `#team-carolina` channel ID (§12.1) and the ideas reviewer (§12.2 O1).

---

## 1. Goals & non-goals

### 1.1 Problem

Requests arrive in person (primary), in per-office Discord channels (secondary), and via DM to
Carolina. There is no written queue, no ownership, no status, and no record. Requests get lost;
members build workarounds instead of asking; Jennifer can't see what's posted in office channels;
`#ask-staff` mixes questions with work items; nobody can say what got fixed last month.

### 1.2 What the pilot week must answer

1. Do members use the bot instead of finding Jake?
2. Do Jake, Whit and Claudio act from the Discord cards?
3. Does the P0/P1/P2 vocabulary make sense to members?
4. Does routing send work to the right person?
5. Does the reporter feel more informed than before?
6. Does logging create visibility without making staff feel bureaucratized?
7. Do public tickets cut down on duplicate reports?

### 1.3 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | The bot becomes the front door | ≥70% of known requests captured (bot + `/log`); ≥50% member-originated via bot |
| G2 | Every issue has exactly one accountable owner | 100% have `owner_key` within 60s of routing |
| G3 | Priority stays meaningful | P0 rate <15%; reporter/AI disagreement tracked |
| G4 | Written record of everything | 100% mirrored to Notion |
| G5 | Reporter always knows the status | Message on route, claim, close |
| G6 | Jake gets a useful weekly summary of his own work | Digest posts Monday; Jake says it's useful |

### 1.4 Non-goals

Replacing Jake's walk-arounds. Anonymous tickets. SLA enforcement. Cost/vendor tracking. Member
dashboard. Contractor logins. Answering `#ask-staff` questions. Being an emergency-response system.
**The web form.** Automated SMS.

### 1.5 Constraints — non-negotiable

- **C1** Reporter identity is always attached and always visible to staff.
- **C2** The reporter's priority is authoritative for routing. AI assessment is advisory and displayed.
- **C3** The bot may escalate priority, never de-escalate.
- **C4** Staff act from their existing channels. No new tool, no dashboard to check.
- **C5** Threads are private to reporter + `@mox staff` by default. A reporter may report publicly,
  and either side may publish a private ticket later (§6.9). **Visibility only moves one way** and
  never without an explicit confirmation.
- **C6** **Every member of `@mox staff` can read every ticket**, assigned to them or not.
- **C7** Routing, hours, categories and the triage prompt live in config/prompt files, not code.
- **C8** No failure in AI or Notion may drop a ticket. Always route.
- **C9** Safety never waits on the reporter.

---

## 2. Stack & deployment

| Concern | Choice |
|---|---|
| Language | TypeScript, Node 20 |
| Discord | `discord.js` v14, gateway connection |
| AI triage | `@anthropic-ai/sdk`, Claude Haiku, tool-use structured output |
| DB | SQLite via `better-sqlite3`, on a mounted volume |
| Notion | `@notionhq/client` |
| Scheduler | `node-cron` |
| HTTP | a `/health` endpoint, nothing else |
| Config | `config.yaml` + `prompts/triage.md` + `.env` |
| Host | Railway worker + persistent volume (Fly.io equivalent fine) |
| Logging | `pino`, JSON to stdout |

> **Why not Vercel:** the bot holds a persistent Discord gateway connection. Serverless can't. When
> the web form is built it *is* a Vercel app, calling this service's API.

### 2.1 Repo layout

```
mox-support-bot/
├── src/
│   ├── index.ts                # bootstrap, intents, partials, handler wiring, /health
│   ├── config.ts               # loads + validates config.yaml; fails loudly on placeholders
│   ├── db.ts                   # migrations, prepared statements
│   ├── intake/
│   │   └── discord.ts          # modal submission -> TicketDraft
│   ├── core/
│   │   ├── createTicket.ts     # TicketDraft -> ticket row + thread + triage kickoff
│   │   └── lifecycle.ts        # the only place status is mutated
│   ├── triage/
│   │   ├── index.ts            # orchestrator: AI first, keyword fallback, escalate-only merge
│   │   ├── ai.ts               # Anthropic call, tool schema, timeout + retry
│   │   └── keywords.ts         # deterministic fallback
│   ├── routing.ts              # pure: route(kind, category, priority, now) -> Destination
│   ├── mirror.ts               # public mirror post + edits on every state change
│   ├── notion.ts               # create/update, file upload, queue drain
│   ├── render.ts               # every user-facing string, in one file
│   ├── handlers/
│   │   ├── reportButtons.ts    # both pinned buttons -> modal
│   │   ├── reportModal.ts      # modal submit
│   │   ├── priorityButtons.ts  # P0/P1/P2 pick
│   │   ├── reactions.ts        # 👀 / ✅ on staff cards
│   │   ├── staffButtons.ts     # Reply / Reassign / Won't do / Priority / Not a ticket / Make public
│   │   ├── threadMessages.ts   # photos, `bump`, reopen replies
│   │   ├── dedupeButtons.ts
│   │   ├── publicButtons.ts
│   │   └── logCommand.ts       # /log
│   ├── jobs/
│   │   ├── priorityTimeout.ts
│   │   ├── nudges.ts
│   │   ├── notionRetry.ts
│   │   ├── archiveThreads.ts
│   │   ├── weeklyDigest.ts
│   │   └── opsAlerts.ts
│   └── util/{time.ts, ids.ts}
├── prompts/triage.md
├── tests/{route.test.ts, merge.test.ts, lifecycle.test.ts, golden.jsonl}
├── config.yaml                 # filled from SETUP.md
├── .env                        # filled from SETUP.md, never committed
├── migrations/001_init.sql
└── README.md
```

### 2.2 Environment variables

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
ANTHROPIC_API_KEY=
TRIAGE_MODEL=                 # pin the current Haiku; see §4.5.1
TRIAGE_ENABLED=true
NOTION_TOKEN=
NOTION_TICKETS_DB_ID=
OPS_ALERT_USER_ID=            # Jen — receives DMs when something is wrong
DATABASE_PATH=/data/mox.db
PHOTO_DIR=/data/photos
HEALTH_PORT=8080
TZ=America/Los_Angeles
LOG_LEVEL=info
```

### 2.3 Discord application setup

**Privileged intents:** `MESSAGE_CONTENT`, `GUILD_MEMBERS`.

**Gateway intents:** `Guilds`, `GuildMessages`, `GuildMessageReactions`, `MessageContent`, `DirectMessages`.

**Partials:** `Message`, `Reaction`, `Channel`, `User` — without these, reactions on cards posted
before a restart are silently dropped.

**Bot permissions:** View Channels · Send Messages · Send Messages in Threads · Create Private
Threads · Create Public Threads · Manage Threads · Manage Messages · Add Reactions · Embed Links ·
Attach Files · Read Message History · Use Slash Commands · Mention Roles.

**`#report-an-issue` permission matrix:**

| Role | View | Send | Send in Threads | Create Threads | Manage Threads | Add Reactions |
|---|---|---|---|---|---|---|
| `@everyone` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `@mox staff` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bot | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **`Manage Threads` on `@mox staff` is what implements C6.** Discord shows a private thread to its
> members *or* to anyone holding `MANAGE_THREADS` on the parent channel. That one permission is how
> every staff member sees every ticket without being invited to each thread one at a time.
> `@everyone` must **not** have it, or the privacy guarantee breaks.

> `@everyone` has **Send in Threads** so members can reply inside a public ticket, but not
> **Add Reactions**, so 👀/✅ stay a staff-only signal even on a public thread.

### 2.4 The intake seam — build it now, use it once

`intake/discord.ts` produces a `TicketDraft` and hands it to `core/createTicket.ts`. Nothing
downstream of that function knows or cares where a ticket came from.

```ts
type TicketDraft = {
  source: 'discord' | 'web' | 'staff_log';
  reporterId: string | null;        // discord user id, null for web
  reporterName: string;
  contact: { kind: 'discord' | 'email' | 'phone'; value: string };
  description: string;
  location: string;
  context?: string;
  visibility: 'private' | 'public';
};
```

Only `'discord'` is constructed in v2.0. The web form is a second implementation of this one type,
plus a notification adapter for people who aren't in Discord. **Do not build either now** — just
don't put Discord types in `core/`, `routing.ts` or `notion.ts`.

---

## 3. Data model

### 3.1 SQLite — `tickets`

Pre-triage columns are nullable because the row is written the instant the modal is submitted,
before triage or priority exist. `lifecycle.ts` refuses to move a ticket to `routed` while any of
`kind`, `category`, `priority` or `owner_key` is null.

```sql
CREATE TABLE tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,   -- rendered MOX-001
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  routed_at         TEXT,
  claimed_at        TEXT,
  closed_at         TEXT,

  reporter_id       TEXT,                                 -- discord user id; null for web later
  reporter_name     TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'discord',      -- discord|web|staff_log
  contact_kind      TEXT NOT NULL DEFAULT 'discord',      -- discord|email|phone
  contact_value     TEXT,

  description       TEXT NOT NULL,                        -- modal: what
  location          TEXT NOT NULL,                        -- modal: where
  context           TEXT,                                 -- modal: anything else

  -- filled by triage
  kind              TEXT,                                 -- issue|idea|question  §4.2
  title             TEXT,                                 -- <=80
  staff_summary     TEXT,                                 -- <=140
  category          TEXT,                                 -- §4.3
  assessed_priority TEXT,                                 -- P0|P1|P2, null on keyword path
  suggested_owner   TEXT,                                 -- the model's pick, §4.4.2
  owner_reasoning   TEXT,                                 -- shown on the card when routed_by=ai_judgment
  routed_by         TEXT,                                 -- category_map|ai_judgment
  triage_method     TEXT,                                 -- ai|keywords
  triage_confidence REAL,                                 -- confidence in the CATEGORY
  triage_reasoning  TEXT,
  triaged_at        TEXT,

  -- filled by reporter (or timeout)
  reported_priority TEXT,                                 -- P0|P1|P2

  -- effective
  priority          TEXT,                                 -- P0|P1|P2|P3
  priority_source   TEXT,                                 -- reporter|timeout|ai_escalation|safety|idea|staff_override
  owner_key         TEXT,                                 -- §7.1
  status            TEXT NOT NULL,                        -- §5.1

  visibility        TEXT NOT NULL DEFAULT 'private',      -- private|public
  visibility_source TEXT,                                 -- reporter_at_report|reporter_later|staff
  made_public_at    TEXT,
  made_public_by    TEXT,
  mirror_channel_id TEXT,
  mirror_message_id TEXT,

  thread_id         TEXT,
  card_channel_id   TEXT,
  card_message_id   TEXT,
  notion_page_id    TEXT,

  claimed_by        TEXT,                                 -- may differ from owner
  closed_by         TEXT,
  resolution_note   TEXT,
  wont_do_reason    TEXT,
  duplicate_of      INTEGER REFERENCES tickets(id),
  reopen_count      INTEGER NOT NULL DEFAULT 0,

  nudged_at         TEXT,
  escalated_at      TEXT
);
CREATE INDEX idx_status ON tickets(status);
CREATE INDEX idx_thread ON tickets(thread_id);
CREATE INDEX idx_card   ON tickets(card_message_id);
CREATE INDEX idx_kind   ON tickets(kind, status);
```

### 3.2 Supporting tables

```sql
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  discord_url TEXT NOT NULL,        -- expires in ~24h; debugging only
  local_path TEXT NOT NULL,         -- buffered bytes, §7.7
  notion_file_id TEXT,
  uploaded_at TEXT
);

CREATE TABLE watchers (             -- duplicate reporters who get the close notice
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  user_id TEXT NOT NULL,
  thread_id TEXT,
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE notion_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  op TEXT NOT NULL,                 -- create|update|upload_photo
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
```

Queue drains every 60s, exponential backoff, max 8 attempts, then an ops alert (§9.2).
**A SQLite write must never block on a Notion call.**

### 3.3 Notion database — "Building Tickets"

> ### ✅ This already exists. Do not create it.
>
> It was built on 2026-09-22 and is populated with 11 sample rows demonstrating every path through
> the system. **Read the live schema before writing any Notion code** — Jen may have tweaked
> property names, select options or colours, and the live database is the source of truth, not this
> table.
>
> | | |
> |---|---|
> | Page | `3d054492ea7a80beba2bc4ecaf6fbee3` — *Building Tickets*, under Mox Home |
> | Database | `32a1f4dfdabe4121a1789d2c2c97c406` |
> | **Data source** (the one the API needs) | `49fb4333-f95c-4931-9823-4c06ba05de57` |
>
> Put the data source ID in `NOTION_TICKETS_DB_ID`. On boot the bot should **fetch the schema and
> fail loudly** if a property it writes is missing, rather than silently dropping fields.
>
> **Delete the sample rows before the pilot** — they all have `Source = Discord` but no real thread,
> and ticket numbers in the MOX-039…058 range. Start real numbering at MOX-100 so the two can never
> be confused.

Standalone — no relation to the Excellence OS or the team task board.

The page is laid out so the board *is* the page: one click from Mox Home lands on the open issues,
with ideas in a second table below and the source database at the foot.

| Property | Type | Values |
|---|---|---|
| `Name` | Title | `MOX-042 — Coffee machine won't turn on` |
| `Ticket ID` | Rich text | |
| `Kind` | Select | `Issue` · `Idea` |
| `Status` | Status | **To do:** `New`, `Routed` · **In progress:** `Claimed` · **Complete:** `Done`, `Won't do`, `Duplicate` |
| `Priority` | Select | `P0 Urgent` 🔴 · `P1 Important` 🟠 · `P2 No rush` 🟡 · `P3 Idea` ⚪ |
| `Reported priority` | Select | same set — what the member picked |
| `AI assessment` | Select | same set — blank on the keyword path |
| `Category` | Select | §4.3 list |
| `Owner` | Select | `Jake + Whit` · `Claudio` · `Contractors` · `Robin` · `All staff` · `Unassigned` |
| `Claimed by` | Rich text | |
| `Reporter` | Rich text | |
| `Location` | Rich text | |
| `Summary` | Rich text | AI one-liner |
| `Description` | Rich text | verbatim |
| `Photos` | Files & media | re-hosted, §7.7 |
| `Discord thread` | URL | |
| `Visibility` | Select | `Private` · `Public` |
| `Reported` / `Claimed` / `Closed` | Date | |
| `Days open` | Formula | `dateBetween(prop("Closed") ?? now(), prop("Reported"), "days")` |
| `Resolution` | Rich text | |
| `Duplicate of` | Relation (self) | |
| `Source` | Select | `Discord` · `Staff log` |

`kind = question` is never written to Notion.

### 3.4 Notion views

Notion allows one grouping per view, so the default does both asks at once: **priority as columns,
cards ordered by status inside each column.**

All four exist already.

| View | Where it lives | Type | Group | Filter |
|---|---|---|---|---|
| **Open issues** | inline on the Building Tickets page | Board | Priority | `Kind = Issue` |
| **Ideas & nice-to-haves** | inline on the Building Tickets page | Table | — | `Kind = Idea` |
| **By owner** | tab on the database | Board | Owner | `Kind = Issue` |
| **Archive — everything** | tab on the database | Table | — | none |

Two things to finish **by hand**, because the API can't do them:

1. **Hide closed tickets from "Open issues".** Add `Status is not Done` / `is not Won't do` /
   `is not Duplicate` to that view's filter. The API set the `Kind` filter but couldn't add the
   compound status exclusion. This is the one that keeps the board from becoming a junk drawer, so
   it matters.
2. **Convert `Status` to a true Status property** if the To-do / In-progress / Complete grouping is
   wanted. It's a `select` today because the Notion API can't create `status` properties. Nothing in
   the bot depends on which it is — the option names are identical either way.

Card preview: Priority · Category · Owner · Location · Days open.

---

## 4. Triage

### 4.1 Priority

| Code | Notion | Who sets it | Member-facing button |
|---|---|---|---|
| **P0** | `P0 Urgent` | reporter, or AI escalation, or safety rule | 🔴 **Urgent** — safety or security, active damage, a major outage, or something blocking many people. *Pings staff right now.* |
| **P1** | `P1 Important` | reporter, or 3-min timeout | 🟠 **Important** — broken and you need it fixed, but you can get by for now. |
| **P2** | `P2 No rush` | reporter | 🟡 **No rush** — should get done, whenever. |
| **P3** | `P3 Idea` | **AI only** — never a button | — |

**One person's blocker is P1, not P0.** A broken monitor arm or a badge that won't scan is real and
routes immediately; it just doesn't page anyone. That distinction is the only thing keeping P0
meaningful.

**P3 is not on the picker.** It is assigned automatically when `kind = idea` (§4.2). A restock is
still P2 work owned by Claudio — "nice to have" as a *priority* is different from a wishlist item
as a *kind of thing*.

Printed above the buttons, always:

> 🚨 **Fire, medical emergency, gas smell, active break-in → call 911 first.** This bot is not an
> emergency line.

**No priority after 3 minutes** → `P1`, `priority_source = timeout`, route, and post in the thread:
*"No priority picked, so I've logged this as Important — tap a button above if that's wrong."*

### 4.2 Kind — assigned by AI

| Kind | What it is | What happens |
|---|---|---|
| `issue` | Something is broken, missing, or dirty | Priority + owner, routed, full lifecycle |
| `idea` | Nothing is broken; someone wants something | **P3, owner `unassigned`**, written to Notion, no card, no ping, no nudge. Thread gets a short "logged it" reply and archives. |
| `question` | About how Mox works | Redirect flow (§6.6). Never written to Notion. |

Examples, which belong verbatim in `prompts/triage.md`:

- `issue` — "toilet on 4 won't flush" · "wifi is down" · "we're out of mugs" · "bathrooms are dirty"
- `idea` — "can we stock vegan protein bars?" · "we should get CO2 monitors" · "would be nice to have a standing desk"
- `question` — "do you do parties here?" · "can I bring my plant from home?"

### 4.3 Category — assigned by AI, drives routing

```
safety · door_codes · plumbing · utilities · furniture · appliance · security ·
stocking · cleaning · cosmetic · events · operations · space · other
```

| Category | Covers | Normally |
|---|---|---|
| `safety` | injury, fire, smoke, gas, flood, active leak, exposed wire, break-in, blocked exit | all staff |
| `door_codes` | door codes, access codes, keypad codes, fobs needing re-issue | Carolina |
| `plumbing` | toilets, sinks, drains, clogs, pipes | facilities |
| `utilities` | wifi, internet, power, HVAC, heating, cooling, hot water | facilities |
| `furniture` | desks, chairs, monitor arms, shelving, whiteboards | facilities |
| `appliance` | coffee machine, printer, fridge, microwave, dishwasher, AV | facilities |
| `security` | broken locks and door **hardware**, cameras, someone who shouldn't be here | facilities |
| `stocking` | snacks, drinks, utensils, mugs, cables, paper towels, soap, TP, markers | Claudio / contractors |
| `cleaning` | dirty, mess, spills, trash, stock room, bathrooms not cleaned | Claudio / contractors |
| `cosmetic` | scuffs, paint, clutter, things that look bad | Claudio / contractors |
| `events` | event setup, chairs and tables, room resets, AV for an event | Claudio |
| `operations` | systems, automations, tooling, process, event strategy and approvals | Robin |
| `space` | member experience, hospitality, how the space feels, general "this is off" | Carolina |
| `other` | none of the above — **the AI picks the owner**, §4.4.2 | judgment |

> **Two distinctions the model gets wrong without being told.** A door *code* that doesn't work is
> `door_codes` (Carolina); a physically broken door is `security` (Jake). A broken desk is
> `furniture`; moving desks for an event is `events`. Both are stated in the prompt and both are in
> the golden set.

### 4.4 AI triage — runs immediately on submit

One Haiku call per ticket, fired the moment the modal is submitted, **in parallel with** the
priority ask.

```ts
{
  name: "triage_ticket",
  input_schema: {
    type: "object",
    required: ["kind","category","assessed_priority","title","summary",
               "suggested_owner","owner_reasoning","confidence"],
    properties: {
      kind:                 { enum: ["issue","idea","question"] },
      category:             { enum: [ /* the 14 above */ ] },
      assessed_priority:    { enum: ["P0","P1","P2"] },
      title:                { type: "string", maxLength: 80 },
      summary:              { type: "string", maxLength: 140 },

      // §4.4.2 — always returned, used when the category doesn't settle it
      suggested_owner:      { enum: ["facilities","carolina","robin","claudio",
                                     "contractors","all_staff"] },
      owner_reasoning:      { type: "string", maxLength: 160 },

      duplicate_of:         { type: ["integer","null"] },
      duplicate_confidence: { type: "number" },
      reasoning:            { type: "string", maxLength: 200 },
      confidence:           { type: "number" }     // confidence in the CATEGORY
    }
  }
}
```

**Input:** `what`, `where`, `context`, the local time, and up to 40 open tickets as
`id · title · category · location · age`. The reporter's priority is deliberately **not** an input —
it usually hasn't been picked yet, and the assessment should be an independent second opinion.

**System prompt:** `prompts/triage.md`, which ships with this spec. It carries the Mox-specific
judgment: **who each person actually is and what they do**, what "blocking many people" means in a
coworking space, that "we should get X" is an idea not an issue, that safety is always P0, and the
two distinctions above. Edit that file rather than the code when routing intuitions change.

#### 4.4.2 The judgment tier — when the category doesn't settle it

A fixed category → owner table can't cover a coworking space. "Someone left a bike blocking the 2F
corridor" is not plumbing, not stocking, not cleaning — but it obviously belongs to Carolina, and a
person reading it knows that instantly.

So routing has **two tiers**:

| | When | How the owner is chosen |
|---|---|---|
| **Tier 1 — the map** | `category != 'other'` **and** `confidence >= 0.6` | `category_owner[category]`, deterministic and unit-tested |
| **Tier 2 — judgment** | `category == 'other'` **or** `confidence < 0.6` | the model's `suggested_owner` |

`suggested_owner` is returned on **every** ticket, not just tier-2 ones, so the two can be compared.
It is constrained to the owner enum, so the model can name a person but never invent one.

**Every ticket records `routed_by`** (`category_map` | `ai_judgment`), and the weekly digest reports
how often tier 2 fired. If it's firing a lot, a category is missing from §4.3 — that's the fix, not
a better prompt.

**On a tier-2 ticket the card shows the reasoning**, so it's contestable at a glance:

```
🤔 Sent to Carolina — sounds like a member-experience thing rather than a repair.
```

**The default is Carolina, not Jake.** Jake is the chief engineer; his queue should be building
work. Carolina owns day-to-day and space excellence, so she is where genuinely ambiguous things
land and where onward routing happens. The prompt says this in as many words, and `other` maps to
the judgment tier rather than to any fixed owner.

**`contractors` is never a valid `suggested_owner`** — the clock decides that, not the model. If it
returns one, coerce to `claudio` and let §7.4 re-resolve by time.

| Concern | Handling |
|---|---|
| Timeout | 8s, one retry, then keyword fallback |
| API error | immediate keyword fallback |
| Malformed output | schema validation → keyword fallback |
| Kill switch | `TRIAGE_ENABLED=false` |
| Cost | ~600 in / ~150 out tokens. Under $1/month at 100 tickets. |

Every ticket stores `triage_method`, so degraded periods are visible in the digest.

#### 4.4.1 Model selection

Set `TRIAGE_MODEL` to the current Claude Haiku model ID. **Confirm it at build time** — don't
hardcode one from memory:

```bash
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
```

Pin a dated version, not an alias, so triage behaviour doesn't shift mid-pilot.

### 4.5 Merge rule — escalate only

```
if kind == 'idea':      priority = P3, source = 'idea'
else if category == 'safety': priority = P0, source = 'safety'
else:                   priority = more_urgent_of(reported, assessed)
```

| Reporter | AI | Category | Effective | `priority_source` | Card shows |
|---|---|---|---|---|---|
| P0 | P0 | any | P0 | reporter | 🔴 Urgent |
| P2 | P0 | plumbing | **P0** | ai_escalation | 🔴 Urgent · *reported No rush, escalated: {reasoning}* |
| P0 | P2 | cosmetic | **P0** | reporter | 🔴 Urgent · ⚠️ *AI assessed No rush* |
| not yet | any | safety | **P0** | safety | 🔴 Urgent · *safety — routed before a priority was picked* |
| any | any | any, kind=idea | **P3** | idea | not carded at all |

**Never de-escalate.** A member who says their thing is critical gets it treated as critical.

### 4.6 Keyword fallback

`src/triage/keywords.ts`. Sets `kind` and `category` only; never produces `assessed_priority`, so on
this path `effective = reported`, except safety → P0 and idea → P3. Evaluated in the listed order,
first match wins — **safety first, `door_codes` before `security`.**

```yaml
safety:      [injury, injured, bleeding, fire, smoke, gas, spark, sparking, exposed wire, shock,
              flood, flooding, leak, leaking, pouring, blocked exit, intruder, break-in, broken glass]
door_codes:  [door code, access code, keypad code, key code, code not working, code doesn't work,
              fob, badge code, entry code, pin]
plumbing:    [toilet, flush, flushing, sink, drain, clog, clogged, backed up, urinal, faucet, tap, pipe, overflow]
utilities:   [wifi, wi-fi, internet, network, ethernet, router, offline, power, outage, electricity,
              breaker, no hot water, heat, heating, ac, a/c, hvac, air conditioning, too hot, too cold, freezing, stuffy]
furniture:   [desk, chair, table, monitor arm, shelf, shelving, drawer, cabinet, whiteboard, stool, couch, lamp, blinds]
appliance:   [coffee, espresso, kettle, printer, print, scanner, fridge, freezer, microwave,
              dishwasher, monitor, projector, tv, screen, speaker, hdmi, dongle, vending]
security:    [lock, locked, unlock, latch, door won't, door wont, camera, alarm, buzzer, intercom, gate, elevator]
stocking:    [restock, stock, out of, ran out, empty, refill, low on, need more, mugs, cups, utensils,
              cutlery, paper towel, paper towels, soap, toilet paper, tp, tissues, markers, snacks,
              protein bar, coffee beans, milk, sanitizer, trash bags, cable, cables, charger, adapter]
cleaning:    [dirty, filthy, gross, mess, messy, trash, garbage, bin, spill, spilled, stain, crumbs,
              smell, smells, stinks, sticky, dusty, not cleaned, needs cleaning, vacuum, mop]
cosmetic:    [ugly, scuff, scuffed, paint, peeling, crooked, poster, disorganized, cluttered, clutter, untidy, eyesore]
other:       []

idea_patterns: ['^(can|could) we', '^we should', '^any chance', '^it would be (nice|good|great)',
                '^(idea|suggestion):', 'would be nice', 'wish (we|there)']
question_patterns: ['^(is|are|do|does|can i|could i|am i|what|when|where|how|who)\b.*\?$',
                    "^what's the policy", '^are we allowed']
```

---

## 5. Lifecycle

### 5.1 States

```
new           row exists; triage and/or priority pending
routed        card posted in the owner's channel; nobody has 👀'd
claimed       a staff member reacted 👀
done          a staff member reacted ✅ (or the reporter self-closed)

won't_do      staff declined; reason required
duplicate     merged into duplicate_of
not_a_ticket  question, redirected to #ask-staff; never in Notion
logged        kind = idea — recorded at P3, no owner, terminal until a human moves it
```

Transitions, all of them in `lifecycle.ts`:

```
new     → routed | duplicate | not_a_ticket | logged
routed  → claimed | done | won't_do | duplicate
claimed → done | routed (👀 removed) | won't_do | duplicate
done    → routed (reopen, §5.4)
logged  → routed (a human decides to act on an idea)
```

### 5.2 Happy path

```
t=0    modal submitted
       ├─ INSERT ticket (status=new)
       ├─ create thread (private, or public if they used the public button), add reporter
       ├─ post ticket embed + emergency line + P0/P1/P2 buttons + "Make this public" + photo prompt
       └─ fire Haiku triage (async)

t≈2s   triage returns
       ├─ store kind/title/category/summary/assessed/reasoning
       ├─ rename thread "MOX-042 · {title}"
       ├─ if kind == question  → redirect flow (§6.6), stop
       ├─ if kind == idea      → P3, status=logged, Notion row, short thread reply, stop
       ├─ if duplicate ≥0.7    → merge offer (§8), pause
       └─ if category==safety  → ROUTE NOW as P0, don't wait for the button

t≤3m   reporter taps a priority (or 3-min timeout → P1)
       └─ when triage + priority are both present → merge (§4.5) → route()

route  ├─ post the staff card in the destination channel, pre-seed 👀 and ✅
       ├─ mention per §7.5
       ├─ status=routed, routed_at
       ├─ post the result in the reporter's thread
       └─ enqueue the Notion create

later  ├─ photos in the thread → re-host (§7.7), attach to Notion, thumbnail on the card
       ├─ staff 👀 → claimed; reporter told who
       ├─ staff replies in thread → nothing changes; it's a conversation
       ├─ staff ✅ → done; reporter + watchers told; Notion Done; archive in 24h
       ├─ if visibility == public → the mirror is edited on every one of the above
       └─ reporter replies within 24h of done → reopen (§5.4)
```

**If triage is slow and the reporter picks first:** wait up to 10s for triage, then route on the
keyword path. Never hold a routed ticket waiting on the AI.

### 5.3 Contesting

Reporter or staff types `bump` in the thread, or staff uses **⚙️ Priority**. Sets
`priority_source = staff_override`, re-runs `route()`, edits the card, logs before/after. The
override rate goes in the weekly digest — it's the signal that the prompt or the keyword table
needs tuning.

### 5.4 Reopen

The reporter replies in the thread within 24h of `done` (before archive) → status back to `routed`,
`reopen_count++`, card edited to `🔁 Reopened — {reply excerpt}`, the previous `claimed_by`
mentioned once. After archive the thread is read-only; they file a new ticket and dedupe will
likely link the two.

---

## 6. Discord surfaces — exact copy

Every string lives in `src/render.ts`. Nothing inlined at a call site.

### 6.1 The pinned post

```
**🔧 Report an issue**

Anything in the building that's **broken, missing or dirty** — or something you'd like us to get.

Most reports are private: just you and Mox staff. Use **Report publicly** if it affects everyone
(wifi, a bathroom, the coffee machine), so other people can see it's already reported.

Questions about how Mox works → #ask-staff

*Button not responding? The bot may be down — post in #ask-staff and tag @mox staff, and we'll log it for you.*
```

Buttons: `[🔧 Report an issue]` `[👥 Report publicly]`

### 6.2 Modal — `report_issue_modal`

Title: `Report a building issue`. Both buttons open the same modal; only the resulting thread type
differs. Discord modals allow max 5 text inputs and **no selects, checkboxes or file uploads** —
which is why priority, visibility and photos are all handled in the thread instead.

| id | Style | Label | Placeholder | Req | Max |
|---|---|---|---|---|---|
| `what` | Paragraph | What's wrong, or what would you like? | The coffee machine in the 4th floor kitchen won't turn on | ✅ | 800 |
| `where` | Short | Where is it? | 4th floor kitchen / Office 302 | ✅ | 100 |
| `context` | Paragraph | Anything else we should know? (optional) | Been like this since Monday. Tried the wall switch. | ❌ | 400 |

### 6.3 First bot message in the thread

```
Thanks {reporter} — this is **MOX-042**.

**What:** {what}
**Where:** {where}
{context ? "**Notes:** " + context : ""}

📸 **Drop a photo here if you can** — it's the single biggest thing that gets something fixed faster.

🔒 Everyone on the Mox staff team can see this thread — no other members can.
🚨 Fire, medical, gas smell, break-in → **call 911 first.** This isn't an emergency line.

**How urgent is this?**
🔴 Urgent — safety, active damage, a major outage, or blocking many people. Pings staff right now.
🟠 Important — broken and you need it fixed, but you can get by for now.
🟡 No rush — should get done, whenever.
```

Row 1: `[🔴 Urgent]` `[🟠 Important]` `[🟡 No rush]`
Row 2, private tickets only: `[👥 Make this public]`

On a public ticket the first line reads instead:
*"Thanks {reporter} — this is **MOX-042**. This one's public, so anyone in the server can see it and chime in."*

### 6.4 The staff card

Embed, coloured by priority (`P0 #E5484D`, `P1 #F76B15`, `P2 #F0C000`):

```
**MOX-042 · 🟠 Important**
Coffee machine in the 4F kitchen won't power on; unplugged and retried.

**Where** 4th floor kitchen
**Reported by** @carolina · 12 min ago
**Category** Appliance
**For** @Jake @Whit
{if disagreement}⚠️ Reported Urgent · AI assessed Important{/if}
{if routed_by == ai_judgment}🤔 Sent to {owner} — {owner_reasoning}{/if}

👀 I'm on it   ✅ Done   ·   [💬 Reply to @carolina]  [Open thread ↗]
```

The second line is the AI `summary`, not the raw description — staff get the gist without opening
the thread.

**Reactions are the fast path. The thread is the real one.** The bot pre-adds 👀 and ✅ so acting is
one click, and **💬 Reply** drops the staff member straight into the thread with the reporter.
Anything that needs a question answered should be a conversation, not a status change.

| Reaction by `@mox staff` | Effect |
|---|---|
| 👀 added | `claimed`, `claimed_by` = reactor, card footer → `👀 Jake`, reporter told, nudge timers stop |
| 👀 removed (no ✅) | back to `routed` |
| ✅ added | `done`, `closed_by` = reactor, footer → `✅ Jake · 2h`, reporter + watchers told, Notion `Done`, thread archives in 24h. The bot replies *"Closed. Add a note?"* — any staff reply within 10 min becomes `resolution_note`. Optional, never blocks. |
| ✅ removed within 10 min | back to `claimed` (undo) |
| Reactions from non-staff | ignored, silently removed |

**Buttons, for the actions that need input:**
`[💬 Reply]` `[↪️ Reassign]` `[🚫 Won't do]` `[⚙️ Priority]` `[❓ Not a ticket]` `[👥 Make public]`

- **Reply** — opens the thread. No state change.
- **Reassign** — owner select → card **edited in place** (`↪️ Reassigned to Claudio`), new card in
  the new channel, reporter told. The old card is never deleted.
- **Won't do** — modal, **reason required** → `won't_do`, reporter told with the reason.
- **Priority** — P0/P1/P2 select → §5.3.
- **Not a ticket** — §6.6.
- **Make public** — confirm, then §6.9.2. Hidden once `visibility = public`.

### 6.4.1 Closed cards collapse

Discord has no "minimise". What it does have is message editing — so on ✅ the bot **replaces** the
card rather than leaving it. The embed is dropped entirely and what remains is one line:

```
~~MOX-042 · Coffee machine won't turn on~~ ✅ Jake · 2h · [thread ↗]
```

Eight lines become one. A channel with thirty closed tickets and four open ones reads as four
tickets and a thin grey margin. The same edit happens on `won't_do` (`🚫 …`) and `duplicate`
(`🔗 merged into MOX-038`).

This applies to every surface that ticket touched — thread card, DMs, channel post, mirror.

### 6.4.2 Reassign — on every card, one click

`[↪️ Reassign]` sits on every staff card and opens a select of every owner:
**Jake · Whit · Carolina · Robin · Claudio · Contractors · All staff**.

- The **other half of the facilities rota is always first in the list**, since Jake↔Whit is by far
  the most common hand-off.
- The old card is **edited in place** to `↪️ Reassigned to Whit`, never deleted — someone may have
  replied around it.
- A new card is posted wherever the new owner's `delivery` says, and the reporter is told in their
  thread.
- Reassigning **does not** change whose turn it is for the next ticket. The rota keeps alternating.
- Notion's `Owner` is updated; `Claimed by` is cleared if the old owner had claimed it.

### 6.4.3 Notion is read-only in practice

**Discord is the only place a ticket changes.** Notion receives writes and never sends them.

> **If someone edits a cell in Notion, it does not reach Discord, and the bot will overwrite it**
> the next time anything happens to that ticket. There is no warning and no merge. This is stated
> on the Notion page itself, in the first thing you read.

**Could Notion write back?** Technically yes — Notion database automations can fire a webhook on a
property change, so a `Status → Done` edit could reach the bot. It is deliberately **not in scope**,
for two reasons:

1. **Loops.** The bot writes Notion, Notion fires the webhook, the bot writes Discord, which writes
   Notion. Breaking that needs an echo-suppression token on every write and careful idempotency —
   real work, and a class of bug that is miserable to debug in production.
2. **It would make Notion a second source of truth**, which is exactly what §9.4 argues against.
   Discord answers *"what needs me now"*; Notion answers *"what happened"*. Two write paths blurs
   that and invites the two to disagree.

If it's ever wanted, the cheap version is **one-way and narrow**: a Notion automation on `Status`
only, hitting `POST /webhooks/notion`, with the bot ignoring any change whose value already matches
SQLite (which suppresses every echo it causes itself). That's Phase 3, and only if people actually
try to work in Notion during the pilot — worth watching for, not worth pre-building.

### 6.5 Duplicate offer — never names the other reporter

```
Heads up — this looks like **MOX-038**, which is already reported and currently **{status}**.
Want me to link them so you get the update when it's fixed?
```

`[Yes, same issue]` `[No, this is different]`

### 6.6 Redirect — `kind = question`

```
Quick check — this reads more like a question than something that's broken.
Those live in #ask-staff, where more people see them. Was this meant as a building issue?
```

`[Yes, something's broken]` → route normally, log the miss for prompt tuning.
`[No — take me to #ask-staff]` → `not_a_ticket`, archive, nothing written to Notion.

### 6.7 Idea acknowledgement — `kind = idea`

```
Logged it 💡 — **MOX-045** is on the ideas list.

Nothing's broken here so it won't go to anyone right now, but it's written down where we review
them rather than scrolling away in chat. I'll close this thread; it's on the board.
```

Thread archives after 1 hour. No card, no ping, no nudge, ever.

### 6.8 `/log` — staff only

Records work that arrived in person so it lands on the same board and in the same digest. **This is
the single most important feature for staff adoption** — it gives Jake something before it asks
anything of him.

```
/log what:<what you fixed> [where:<location>] [asked_by:<@member>] [minutes:<n>]
```

Creates a ticket already `done`, `source = staff_log`, `closed_by` = invoker, `owner_key` from
`config.staff_map[invoker]` (falling back to `unassigned`). No thread, no routing, no AI call.
Ephemeral reply: `Logged MOX-043. That's 7 this week.`

### 6.9 Public tickets

Some issues are everyone's business. Those currently generate five private tickets that all say the
same thing, and five people with no way of knowing it's already reported.

**The Discord constraint:** a thread's privacy is fixed at creation and there is no API to convert
one. So public tickets use two mechanisms, each the best available at its moment.

| Chosen | Mechanism | Members can |
|---|---|---|
| At report time | Bot creates a **public thread** in `#report-an-issue` | read, reply, add photos |
| Afterwards | Bot posts a **public mirror card** in the channel; the private thread stays private | read, react, discuss in channel |

#### 6.9.1 Public at report time

The `[👥 Report publicly]` button on the pinned post. Everything downstream is identical — same
modal, same immediate triage, same priority buttons, same card, same routing, same nudges. The only
differences: thread type, `visibility = public`, `visibility_source = reporter_at_report`, and
non-staff reactions **in the thread** are ignored rather than removed (stripping a member's 👍 off a
public thread is rude and achieves nothing). Non-staff reactions on the **staff card** are still
removed.

#### 6.9.2 Public afterwards — the mirror

Either the reporter (`[👥 Make this public]` in the thread) or any `@mox staff` member
(`[👥 Make public]` on the card). Both see the same confirm:

> This posts **MOX-042** in #report-an-issue where everyone can see it — what's wrong, where, and
> its status. **This can't be undone.**
> `[Yes, make it public]` `[Cancel]`

On confirm the bot posts a mirror in `public_channel_id`:

```
**MOX-042 · 🟠 Important · Appliance**
Coffee machine in the 4F kitchen won't power on.
**Where** 4th floor kitchen
**Reported by** @carolina · 2h ago
**Status** 👀 Jake is on it
```

- The mirror carries the **AI summary**, never the verbatim `description` or `context` — the
  reporter wrote those expecting privacy.
- The bot **edits** the mirror on every state change: routed → claimed → done → reopened, and on
  close appends `✅ Fixed — {resolution_note}`.
- The private thread continues unchanged. Staff still act from the card; the mirror is read-only
  signal, not a control surface.
- `mirror_channel_id` / `mirror_message_id` are persisted so edits survive a restart.
- Channel replies are **not** ingested as ticket updates in v2.0. A member with something to add
  opens their own ticket and dedupe links the two.

#### 6.9.3 Who gets named

| Made public by | The mirror says |
|---|---|
| The reporter | `Reported by @carolina` |
| Staff | `Reported by a member` |

Consistent with the anonymised duplicate message. **C1 is unaffected** — the reporter's identity is
always in SQLite and Notion and always visible to staff on the card. Only the member-facing mirror
is anonymised, and only when staff rather than the reporter chose to publish.

#### 6.9.4 Rules

- **One-way.** No un-publish, no `[Make private]`. The confirm copy carries the weight.
- Visibility never affects kind, priority, routing, nudges or Notion status. **Presentation only.**
- **Never automatic.** Not on P0, not on safety, not on a third duplicate. Always a human tap.
- `kind = question` is never mirrored. If a public ticket becomes `duplicate` or `won't_do` the
  mirror is **edited** to say so — never deleted. A disappearing post is worse than an honest one.
- `/log` tickets are private by default; staff can mirror one if it's worth broadcasting.

---

## 7. Routing

### 7.1 Owner map — `config.yaml`

`delivery` is the new field. It decides **where the notification goes**, independently of who owns
the ticket.

```yaml
owners:
  jake:
    display_name: "Jake"
    mention_user_ids: ["<<USER_JAKE>>"]
    delivery: thread
    p0_channel_id: "<<CHANNEL_TEAM_JAKE>>"
  whit:
    display_name: "Whit"
    mention_user_ids: ["<<USER_WHIT>>"]
    delivery: thread
    p0_channel_id: "<<CHANNEL_TEAM_JAKE>>"
  carolina:
    display_name: "Carolina"
    mention_user_ids: ["<<USER_CAROLINA>>"]
    delivery: dm
    p0_channel_id: "<<CHANNEL_TEAM_JAKE>>"
  claudio:
    display_name: "Claudio"
    mention_user_ids: ["<<USER_CLAUDIO>>"]
    delivery: channel
    channel_id: "<<CHANNEL_TEAM_CLAUDIO>>"
  contractors:
    display_name: "Mox Contractors"
    mention_user_ids: []
    delivery: channel
    channel_id: "<<CHANNEL_MOX_CONTRACTOR_REQUESTS>>"
  all_staff:
    display_name: "All staff"
    mention_role_id: "<<ROLE_MOX_STAFF>>"
    delivery: channel
    channel_id: "<<CHANNEL_TEAM_JAKE>>"
  unassigned:
    display_name: "Unassigned"
    delivery: none                                 # ideas — board only, never carded
```

### 7.2 Categories → owners

```yaml
category_owner:
  safety:      all_staff
  door_codes:  carolina         # moved from Robin, 2026-09-22
  plumbing:    facilities_rota  # jake | whit, 50/50 — §7.2.1
  utilities:   facilities_rota
  furniture:   facilities_rota
  appliance:   facilities_rota
  security:    facilities_rota
  stocking:    time_based       # claudio | contractors, §7.4
  cleaning:    time_based
  cosmetic:    time_based
  events:      claudio          # setup is scheduled work — not time-based
  operations:  robin
  space:       carolina
  other:       ai_judgment      # → the model's suggested_owner, §4.4.2
```

#### 7.2.1 The facilities rota — Jake and Whit, 50/50

Jake and Whit are **two separate people with two separate queues**, not one joint owner. Facilities
work splits evenly between them.

```yaml
rota:
  facilities: [jake, whit]
  strategy: ticket_parity      # even ticket number -> first, odd -> second
```

**Split by ticket-number parity, not a counter.** Even → Jake, odd → Whit. That gives a genuine
50/50, it's stateless (a restart can't lose its place), and it's trivially unit-testable —
`MOX-042` is always Jake and `MOX-039` is always Whit, forever.

| Case | Behaviour |
|---|---|
| **P1 / P2** | One of them owns it and only that person is mentioned. The other isn't pinged at all. |
| **P0** | Owned by whoever the rota picked, but **both are mentioned** — urgent work shouldn't wait on the roll of a coin. |
| **Either is away** | Remove them from `rota.facilities` and everything goes to the other. One config line. |
| **Wrong one got it** | **↪️ Reassign** on the card, one click (§6.4.1). Reassignment never changes the rota for the next ticket. |
| **`/log`** | Attributed to whoever typed it, never to the rota. |

`all_staff` (safety) is unaffected — that always mentions the whole `@mox staff` role.

### 7.3 The rules, in order — first match wins

```
route(kind, category, priority, now, suggestedOwner, confidence) -> { ownerKey, routedBy }
```

| # | Condition | Owner | `routed_by` |
|---|---|---|---|
| **R1** | `kind == 'idea'` | `unassigned` | — |
| **R2** | `category == 'safety'` | `all_staff` | `category_map` |
| **R3** | `category == 'other'` **or** `confidence < 0.6` | `suggestedOwner` | `ai_judgment` |
| **R4** | `category_owner[category]` is `time_based` and **inside** Claudio's hours | `claudio` | `category_map` |
| **R5** | `category_owner[category]` is `time_based` and **outside** them | `contractors` | `category_map` |
| **R6** | `category_owner[category]` is `facilities_rota` | `jake` if the ticket number is even, else `whit` | `category_map` |
| **R7** | otherwise | `category_owner[category]` | `category_map` |

R3 sits above the table lookups deliberately: a low-confidence category shouldn't be trusted to
pick an owner just because it happens to be in the map.

**Guards, applied after the rule matches:**
- `suggestedOwner == 'contractors'` → coerce to `claudio`, then re-resolve through R4/R5.
- `suggestedOwner == 'facilities'` (the model doesn't know about the rota) → resolve through R6.
- `priority == P0` and the result is `contractors` → run R6 instead.
- On the keyword fallback path there is no `suggestedOwner`, so R3 resolves to `carolina`.
- `priority == P0` and the owner is `jake` or `whit` → **mention both** (§7.2.1).

> **P0 never goes to the contractors.** If `priority == P0` and R5 would have matched, it routes to
> `facilities` instead — an urgent overflowing toilet at 11pm is not an overnight-restock job.
> Implement this as a guard inside R5, not as a separate rule.

### 7.4 Hours

```yaml
claudio_hours:
  start: "00:00"
  end:   "17:00"
  days:  [mon, tue, wed, thu, fri, sat, sun]
  tz:    "America/Los_Angeles"
```

Stocking and cleaning go to **Claudio from midnight to 17:00** and to the **contractors from 17:00
to midnight**. The contractors' block is the evening shift only; the small hours belong to Claudio,
who picks them up in the morning. No ping fires at 3am — a P2 has no mention at any hour.

Implement as an interval test, not a naive `>=`/`<`, so the boundaries are exact: 16:59 is Claudio,
17:00 is contractors, 23:59 is contractors, 00:00 is Claudio.

### 7.5 Delivery — where the notification actually lands

**The canonical card lives in the ticket thread**, inside `#report-an-issue`. One surface, visible
to every member of `@mox staff` via `Manage Threads`, carrying the 👀 / ✅ reactions and the action
buttons.

For most tickets **that is the only surface** — the bot simply @-mentions the owner on the card and
nothing leaves the channel. A second surface is created in exactly two cases: a P0 breakout, and an
owner whose work is channel-based.

| `delivery` | P1 / P2 | P0 |
|---|---|---|
| `thread` | `@mention` the owner **on the thread card**. Nothing posted anywhere else. | Same, **plus** a card in `p0_channel_id` with the mentions |
| `channel` | Card in `channel_id`, owner mentioned | Same, mentions included |
| `none` | nothing | n/a |

In practice:

| Owner | P1 / P2 | P0 |
|---|---|---|
| **Jake + Whit** | `@Jake @Whit` on the ticket, in `#report-an-issue` | + card in `#team-jake` |
| **Carolina** | `@Carolina` on the ticket, in `#report-an-issue` | + card in `#team-carolina` |
| **Claudio** | card in `#team-claudio` | card in `#team-claudio`, mentioned |
| **Contractors** | card in `#mox-contractor-requests` | *(P0 never routes here — see R5)* |
| **Safety** | — | card in `#team-jake` + `@mox staff` |

**No DMs for delivery.** The only DM the bot ever sends about a ticket is a nudge (§7.5.2) or an ops
alert to Jen.

> **Why this is better than the DM model it replaces:** a DM to Jake *and* a DM to Whit is two cards
> for one ticket, and reactions can't be reconciled across two people's DMs. Mentioning them both on
> the single thread card removes that problem entirely — one message, one set of reactions, whoever
> reacts first owns it. It also means every staff member can see the ticket and the mention, which
> a DM would have hidden.

> **Their queue is Discord's mention inbox.** Jake and Carolina have no channel to watch for
> ordinary tickets — but every ticket @-mentions them, so Discord's own **Mentions** view (the @
> icon, top right) is already a per-person queue, sorted newest-first, with nothing else in it.
> Pair that with the standing queue (§9.4) and neither of them ever scrolls a channel.

#### 7.5.1 Surface tracking

A ticket can touch several messages — the thread card, a P0 channel card, a public mirror, the
standing queue. `ticket_surfaces` records each one so a restart never orphans a card and a state
change edits all of them:

```sql
CREATE TABLE ticket_surfaces (
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  kind       TEXT NOT NULL,      -- thread|channel|mirror
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (ticket_id, channel_id, message_id)
);
```

On 👀, ✅, reassign, priority change, won't-do or reopen: update SQLite, then edit **every** row in
`ticket_surfaces` for that ticket, then rebuild the standing queue.

#### 7.5.2 Nudges — the only thing DMs are for

| Priority | Later |
|---|---|
| P0 | no 👀 in 20 min → **DM** each owner, **and** reply on the P0 card tagging `@mox staff` |
| P1 | no 👀/✅ after 4 staffed hours → **one DM** to each owner; `channel` owners get one channel reply instead |
| P2, P3 | never |

One nudge per ticket per rule, ever. A DM here is deliberate: it's private, it doesn't add noise to
a channel, and it's unmissable — which is exactly what you want from a thing that fires once.

### 7.6 Owner vs claimant

- **Owner** (`owner_key`) is the accountable queue. Set by routing or reassign, **never changed by
  a reaction**.
- **Claimed by** (`claimed_by`) is the human who reacted 👀. Anyone in `@mox staff` may claim
  anything.

If Whit 👀s a ticket owned by `facilities`, the owner stays `facilities`, the claimant is Whit, the
card shows `👀 Whit`, and the nudge timers stop. Accountability and execution are different things
and both stay visible.

### 7.7 Photos — required in Phase 1

**Discord CDN URLs are signed and expire in ~24h.** Storing the raw URL in Notion produces a dead
link within a day. On every `messageCreate` in a ticket thread carrying image attachments
(png/jpeg/webp/gif, ≤10 MB each, ≤5 per ticket):

1. Download **immediately** and buffer to `${PHOTO_DIR}/{ticket}/{n}.{ext}`.
2. Upload to Notion via the file-upload API and attach to `Photos`.
3. Store `notion_file_id`. On failure enqueue `upload_photo` and retry **from the buffered file**,
   never from the Discord URL.
4. Edit the staff card to add a thumbnail; post `📸 Added to MOX-042.` in the thread.

---

## 8. Duplicate detection

Handled inside the Haiku call. Threshold **0.7** → the §6.5 offer. On **Yes**: `duplicate`,
`duplicate_of` set, reporter added to `watchers`, no card, no full Notion row. On **No** or after
3 minutes: proceed normally.

Public tickets are the cheaper half of this problem — a visible mirror stops the second report being
filed at all.

A jaccard fallback for the keyword path is **Phase 2**.

---

## 9. Jobs

| Job | Schedule | Behaviour |
|---|---|---|
| `priorityTimeout` | every 30s | `new` with triage done and no priority for 3 min → P1, route |
| `nudges` | every 5 min | §9.1 |
| `notionRetry` | every 60s | drain the queue; on the 8th failure → ops alert |
| `archiveThreads` | hourly | `done` >24h → archive; `logged` >1h → archive |
| `weeklyDigest` | Mon 09:00 PT | §9.3 |
| `opsAlerts` | every 5 min | §9.2 |

### 9.1 Nudges — one each, never repeated

| Condition | Action |
|---|---|
| P0 (non-safety), `routed`, no 👀 after 20 min | reply on the card: `@mox staff — MOX-042 hasn't been picked up` |
| P1, `routed`, no 👀/✅ after **4 staffed hours** | reply on the card: `@{owner} — MOX-042 hasn't been picked up yet` |
| P2, P3 | never |

"Staffed hours elapsed" counts only time inside the 05:00–17:00 window. A P1 filed at 16:00 nudges
the following morning, not at 20:00.

### 9.2 Ops alerts — DM to `OPS_ALERT_USER_ID`

| Trigger | Message |
|---|---|
| A `notion_queue` item hits 8 attempts | `Notion write for MOX-042 failed 8× — {error}. Run /mox resync 42 when Notion is back.` |
| `notion_queue` depth >10 | `Notion queue backing up ({n} pending).` |
| Keyword fallback >5 consecutive tickets | `Haiku triage has fallen back to keywords 5× in a row — check the Anthropic key or quota.` |
| Process boot | `Mox Support Bot online (v{ver}).` — a reboot loop shows as repeated DMs |

Rate-limited to one per type per hour. **Bot-offline is not detectable from inside the bot:**
`/health` on `HEALTH_PORT` returns `200 {uptime, queueDepth}` — point a free uptime monitor
(UptimeRobot, Better Stack) at it. That's a Phase 0 checklist item.

### 9.4 The standing queue — the fix for scrolling

**The problem:** a Discord channel is a chronological stream, not a queue. It can't be filtered or
sorted, so "three open for Jake and one for Carolina" means Carolina scrolls past Jake's to find
hers. Collapsing closed cards (§6.4.1) helps, and DM delivery (§7.5) helps more — each person's DM
*is* their own queue with nothing else in it. But there still needs to be one place that shows the
whole picture.

**The answer: one pinned message that never moves and is always current.** The bot posts it once in
`digest_channel_id`, pins it, stores its ID, and **edits it in place** on every state change.
Not a new message per update — the same message, forever.

```
📋 **Open right now** · 8 tickets · updated 2 min ago

**🔴 Urgent**
MOX-051  Water through the 3F ceiling · 8m · unclaimed · @mox staff

**Jake + Whit — 3**
🟠 MOX-042  Coffee machine won't turn on · 2h · 👀 Jake
🟠 MOX-047  Chair arm cracked, Office 302 · 1d · 👀 Jake
🟡 MOX-049  Printer jamming on 2F · 2d · unclaimed

**Carolina — 1**
🟠 MOX-053  Door code for 302 not working · 20m · unclaimed

**Claudio — 2**
🟡 MOX-044  4F kitchen out of mugs · 3h
🟡 MOX-046  2F bathroom not cleaned · 5h

**Contractors — 1**
🟡 MOX-052  Stock room needs tidying · 1h

─────
✅ 3 closed today · 💡 4 ideas on the board · [Open the Notion board ↗]
```

Rules:

- **Only open tickets appear.** The moment something closes it vanishes from the list — that is the
  "auto-minimise" you asked for, applied to the queue rather than to individual messages.
- **Grouped by owner**, urgent lifted to the top regardless of owner. Carolina reads four lines and
  is done.
- **P3 ideas never appear** — just the count on the footer line, with a link to the Ideas view.
- Rebuilt from SQLite, so it survives restarts and can be regenerated with `/mox requeue`.
- Edits are debounced to one every 5 seconds, so a burst of activity doesn't hit the rate limit.
- If it exceeds Discord's 4000-character embed limit, it truncates the oldest P2s and appends
  `+ 6 more on the board ↗`.

**The division of labour:** Discord answers *"what needs me right now?"* — this message and your
DMs. Notion answers *"what happened, when, how long did it take, what's the pattern?"* — history,
filtering and reporting. Neither tries to be the other.

### 9.3 Weekly digest — `digest_channel_id`

Framed as *what got done*, not *what's overdue*. This is Jake's report.

**Open tickets are listed in full** — people need to act on those. **Closed tickets are summarised**,
because thirty lines of things that are already done is noise.

```
**Mox building support · week of 22 September**

**✅ Closed — 14**
Mostly plumbing and restocking, and the 3F ceiling leak is sorted.
· Fixed the 3F ceiling leak and the two radiators it took out
· Cleared four printer and coffee-machine faults across 2F and 4F
· Restocked the kitchens six times — mugs and oat milk keep running out
· Reset the lounge after three events
Jake 5 · Whit 4 · Claudio 3 · Contractors 1 · Carolina 1 · via /log 4
Median time to close: 4h

**🔧 Still open — 6**
🔴 MOX-071  Front door keypad dead · 2h · unclaimed · Jake
🟠 MOX-064  2F radiator not heating · 3d · 👀 Whit
🟠 MOX-068  Printer jamming on 2F · 1d · unclaimed · Jake
🟡 MOX-059  Stock room needs tidying · 8d ⚠️ · Claudio
🟡 MOX-066  Scuff on the stairwell wall · 4d · Claudio
🟡 MOX-070  Signage for the new meeting rooms · 2d · Carolina

**💡 Ideas — 3 new, 11 on the list**
Nobody owns this list. Oldest has been sitting 6 weeks.

**Signals**
· P0 rate 7% · reporter/AI disagreed 2× · staff override 1× · keyword fallback 0×
· routed by AI judgment 3× · public 2 · duplicates caught 4×
```

**The closed recap is written by Haiku**, from the week's closed rows — one sentence, then **at most
four bullets** grouping the work by theme rather than listing it. If fewer than four themes exist,
use fewer. It reads as *"here's what your week actually consisted of"*, which is what makes it
Jake's report rather than a management artefact.

Everything else in the digest is generated from SQLite with no model call, so an Anthropic outage
degrades the recap to a plain count and nothing else breaks.

---

## 10. Build phases

### Phase 0 — Setup (Jen, ~25 min — see `SETUP.md`)
- [ ] Discord app + bot token; enable `MESSAGE_CONTENT` and `GUILD_MEMBERS`
- [ ] `#report-an-issue` created with the §2.3 permission matrix
- [ ] `@mox staff` role exists, has `Manage Threads` + `Add Reactions` on that channel, and contains everyone who should see all tickets
- [ ] Janitorial channel renamed `#mox-contractor-requests`
- [ ] Every ID in `SETUP.md` filled in
- [ ] Anthropic API key with billing and a spend limit
- [ ] Notion integration created and **connected to the Building Tickets page**
- [ ] Uptime monitor pointed at `/health` once deployed

### Phase 1 — The pilot build
- [ ] Bootstrap, config loader that **fails loudly on any remaining `<<PLACEHOLDER>>`**, migrations, `/health`
- [ ] Notion DB + the 5 views, created via API
- [ ] Pinned post, both entry buttons, footer, modal, thread creation (private or public)
- [ ] Immediate AI triage + keyword fallback + escalate-only merge + **safety fast-path**
- [ ] Priority buttons + 3-minute timeout
- [ ] `route()` as a pure function + the §11.1 tests
- [ ] Staff card, pre-seeded 👀 ✅, reaction handlers, all six buttons
- [ ] Reporter thread updates: routed, claimed, done, reassigned, reopened
- [ ] Idea path (§6.7) and question redirect (§6.6)
- [ ] Duplicate flow
- [ ] **Public tickets** — both mechanisms, mirror edits on every state change
- [ ] Notion create/update + retry queue; **photo re-hosting**
- [ ] `/log`
- [ ] Nudges, weekly digest, ops alert DMs
- [ ] `archiveThreads`, structured logging

### Phase 2 — After the pilot week
- [ ] Jaccard dedupe on the keyword path
- [ ] `/mox reload-config`, `/mox resync <id>`
- [ ] Triage eval harness replaying real pilot tickets against prompt edits
- [ ] `#ask-staff` nudge: a keyword-detected building issue gets a one-click "open a ticket" button

### Phase 3 — Later
- [ ] **The web form** (Vercel) + notification adapter for non-Discord reporters
- [ ] `tasks.moxsf.com` push for claimable volunteer work
- [ ] Monthly rollup in Notion

---

## 11. Acceptance criteria

### 11.1 Deterministic — must be 100%

**`route()`** — `now` is America/Los_Angeles.

| kind / category / priority / time | owner | delivery |
|---|---|---|
| issue / safety / P0 / 03:00 | all_staff | `#team-jake` + `@mox staff` |
| issue / safety / P2 / 14:00 | all_staff | same *(safety forces P0)* |
| issue / door_codes / P1 / 14:00 | carolina | **thread only**, `@Carolina` — no channel post |
| issue / door_codes / P0 / 14:00 | carolina | thread **and** `#team-carolina` |
| issue / security / P1 / 14:00 | facilities | **thread only**, `@Jake @Whit` |
| issue / plumbing / P0 / 14:00 | facilities | thread **and** `#team-jake` |
| issue / utilities / P1 / 20:00 | facilities | thread only |
| issue / appliance / P1 / 14:00 | facilities | thread only |
| issue / furniture / P2 / 14:00 | facilities | thread only |
| issue / stocking / P2 / 09:00 | claudio | `#team-claudio` |
| issue / stocking / P2 / 02:00 | claudio | `#team-claudio` *(midnight–17:00 is Claudio)* |
| issue / cleaning / P2 / 16:59 | claudio | `#team-claudio` |
| issue / cleaning / P2 / 17:00 | contractors | `#mox-contractor-requests` |
| issue / cleaning / P2 / 23:59 | contractors | `#mox-contractor-requests` |
| issue / cleaning / P2 / 00:00 | claudio | `#team-claudio` |
| issue / cleaning / **P0** / 23:00 | **facilities** | DMs + `#team-jake` *(P0 never to contractors)* |
| issue / cosmetic / P2 / 14:00 | claudio | `#team-claudio` |
| **idea** / any / any / any | unassigned | **nothing** — board only |

**Surface sync** — for every case above, assert that the thread card exists, that closing edits
*every* recorded surface in `ticket_surfaces` to the collapsed one-liner, and that the standing
queue no longer lists the ticket.

**Merge** — per §4.5, including: reporter P2 + AI P0 → P0 `ai_escalation`; reporter P0 + AI P2 → P0
`reporter` with the disagreement flag; safety with no reported priority → P0 `safety`; any idea → P3
`idea`.

**Lifecycle** — every transition in §5.1 is allowed and every other pair is rejected; `routed` is
refused while `kind`, `category`, `priority` or `owner_key` is null.

### 11.2 Model eval — `tests/golden.jsonl`

≥90% on category, **100% on `kind`**.

| Input | kind | category | owner |
|---|---|---|---|
| toilet on 4 won't flush | issue | plumbing | facilities |
| wifi is down, nobody on 3 can work | issue | utilities | facilities |
| water pouring through the ceiling | issue | safety | all_staff |
| coffee machine won't turn on | issue | appliance | facilities |
| out of mugs and paper towels | issue | stocking | claudio |
| we need more HDMI cables | issue | stocking | claudio |
| bathrooms are dirty | issue | cleaning | claudio |
| stock room is a mess | issue | cleaning | claudio |
| my door code isn't working for 302 | issue | **door_codes** | **carolina** |
| the lock on 302 is broken | issue | **security** | **facilities** |
| my monitor arm is broken | issue | furniture | facilities |
| ugly scuff on the stairwell wall | issue | cosmetic | claudio |
| need 40 chairs set up in the lounge Thursday | issue | **events** | **claudio** |
| the Zapier that posts to Slack has stopped | issue | **operations** | **robin** |
| should we start charging for evening events? | issue | **operations** | **robin** |
| the lounge feels cluttered and unwelcoming | issue | **space** | **carolina** |
| new members can't find anything, signage is bad | issue | **space** | **carolina** |
| someone left a bike blocking the 2F corridor | issue | **other** | **carolina** *(tier 2)* |
| a member keeps taking calls on speaker in the quiet room | issue | **other** | **carolina** *(tier 2)* |
| can we stock vegan protein bars? | **idea** | stocking | unassigned |
| we should get CO2 monitors | **idea** | utilities | unassigned |
| would be nice to have a standing desk | **idea** | furniture | unassigned |
| do you do parties here? | **question** | — | — |
| can I bring my plant from home? | **question** | — | — |
| we're incorporating a nonprofit, do you provide a CA address? | **question** | — | — |

Two extra assertions on the judgment tier:

- **Nothing ever lands unassigned** except `kind = idea`. Assert `owner != null` on every issue,
  including every deliberately-vague row.
- **`suggested_owner` is never `contractors`** and never a value outside the enum.

Run with `npm run eval`. Re-run on every edit to `prompts/triage.md` — that file is where routing
intuition lives now, so changing it is a behaviour change.

### 11.3 End-to-end

| # | Scenario | Pass |
|---|---|---|
| E1 | Submit, pick 🔴, plumbing | card in the facilities channel ≤10s with `@Jake @Whit`; Notion `Routed`/`P0 Urgent` |
| E2 | Submit "water pouring through the ceiling", **never touch a button** | routed as P0 with `@mox staff` within ~5s; thread explains why |
| E3 | Submit, never pick a priority | after 3 min → P1, routed, thread explains |
| E4 | Submit "can we stock vegan protein bars?" | no card, no ping; Notion row `Idea`/`P3`/`Unassigned`; thread acknowledges and archives in 1h |
| E5 | Submit "my door code isn't working" | routes to Robin, not facilities |
| E6 | Submit "the lock on 302 is broken" | routes to facilities, not Robin |
| E7 | Stocking ticket at 04:30 then at 05:30 | first → contractors, second → Claudio |
| E8 | P0 cleaning ticket at 23:00 | facilities, **not** contractors |
| E9 | Jake reacts 👀 then ✅ | reporter told twice; Notion `Claimed` then `Done`; archived 24h later |
| E10 | Whit 👀s a facilities ticket | `claimed_by` Whit, owner unchanged, nudge timer cancelled |
| E11 | P0 unclaimed for 20 min | one `@mox staff` reply on the card; never a second |
| E12 | P1 filed 16:00, unclaimed | nudge the next morning (4 staffed hours), not at 20:00 |
| E13 | A staff member who isn't the owner opens the thread | can read and post — C6 |
| E14 | A non-staff member opens someone else's thread link | denied |
| E15 | Non-staff reacts ✅ on a card | ignored and removed |
| E16 | Reporter replies "still broken" 3h after ✅ | back to `routed`, card shows 🔁, previous claimant mentioned once |
| E17 | 3 photos posted | all 3 in Notion `Photos`, all still load 48h later |
| E18 | Second wifi report 10 min later | merge offered **without naming the first reporter**; both notified at close |
| E19 | Reassign facilities → Claudio | old card **edited**, new card in Claudio's channel, reporter told |
| E20 | Won't do | reason required; reporter sees it; Notion `Won't do` |
| E21 | `[👥 Report publicly]` | public thread; another member can read and reply; triage/routing identical |
| E22 | Reporter publishes a claimed P1 | mirror names `@carolina`, shows `👀 Jake`; private thread unchanged |
| E23 | Staff publishes, then closes | mirror says `Reported by a member`; edits to `✅ Fixed` within 10s; survives a restart mid-way |
| E24 | Publish an already-public ticket | button absent; no second mirror |
| E25 | A public ticket is marked Won't do | mirror **edited**, not deleted |
| E26 | Anthropic 500s for 10 minutes | every ticket still routes on keywords; digest shows the fallback count |
| E27 | Notion down for 10 minutes | tickets route normally; rows appear on recovery; nothing lost |
| E28 | Bot restarts | old cards still accept 👀/✅ (partials + SQLite lookup by `card_message_id`) |
| E29 | `/log what:"fixed 3F printer"` by Jake | `done` ticket, owner facilities, appears in Monday's digest |
| E30 | `config.yaml` still contains a `<<PLACEHOLDER>>` | **process refuses to start**, names the key |

### 11.4 Pilot exit criteria — offices, one week

- ≥15 tickets via bot + `/log` combined
- ≥50% of logged requests came through the bot directly rather than `/log`
- 0 issues without an owner
- P0 rate <15%
- Reporter/AI disagreement <25%; manual category review ≥90% correct
- Median 👀 on a P1 within one staffed day
- Jake: the digest is useful **and** his office contact hasn't dropped
- Every pilot photo still loads at the end of the week

---

## 12. Open questions

### 12.1 Nothing is blocking — `config.yaml` is complete

All 14 IDs are filled in and collision-free. The bot can boot.

**Channel usage, stated once so it can't drift:**

| Channel | Gets |
|---|---|
| `#report-an-issue` | **Every P1 and P2**, as an @mention on the ticket card. This is where the work is. |
| `#team-jake` | P0 facilities, and **all** safety |
| `#team-carolina` | P0 door codes only |
| `#team-robin` | P0 operations only |
| `#team-claudio` | every priority — Claudio's work is channel-based |
| `#mox-contractor-requests` | every priority — the crew has no individual accounts |

> **Nothing below P0 reaches a team channel** for Jake, Whit, Carolina or Robin. Claudio and the
> contractors are the deliberate exception, because their work is shift-based and they don't watch
> a mention inbox.

### 12.2 Non-blocking

| # | Question | Default in this spec |
|---|---|---|
| **O1** | ~~Who reviews the ideas list?~~ | **Decided: nobody.** Ideas stay unassigned on purpose — no owner, no cadence, no reminder. The digest keeps them *visible* rather than owned: a count, and the age of the oldest, every Monday. If that number climbs past ~20 or the oldest passes a couple of months, the list has become a wishlist nobody reads, and that's the moment to revisit — not before. |
| **O2** | Is Robin an owner of anything now? | No. Door codes went to Carolina and nothing else was his. His channel ID stays in config, unused. |
| **O3** | Does a DM-first owner ever want a channel post for P1? | No — DM only below P0. Easy to flip per owner if Jake finds DMs easy to lose. |
| **O4** | Should the standing queue live in `#issues-digest-staff` or `#report-an-issue`? | `#issues-digest-staff` — staff-facing, and it keeps the report channel to just the pinned button |
| **O5** | Is P2 still routed work, with P3 only for ideas? | Yes — restocks are P2 to Claudio; P3 is ideas only |
| **O6** | Where do public mirrors land — `#report-an-issue` or a separate `#whats-broken`? | `#report-an-issue` |
| **O7** | May staff publish someone else's ticket? | Yes, with the reporter's name stripped |
| **O8** | `#report-an-issue` permissions change after launch | Noted — the ID is stable across permission changes, so nothing in config needs updating. Re-check only that `@mox staff` keeps **Manage Threads** and `@everyone` never gains it. |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| **Priority inflation** | Tight P0 definition; the P0 button names its consequence; the AI assesses independently and disagreement is shown and counted; P0 rate in the digest |
| **Jake disengages** | `/log` credits in-person work; the digest is his report; reactions not forms; 💬 Reply keeps him talking to people; the bot never gates requests; an exit criterion explicitly checks his office contact |
| **Staff ignore the cards** | P1 nudge at 4 staffed hours; P0 widens to `@mox staff`; median-👀 is an exit metric |
| **AI misclassifies** | Reasoning shown in-thread; `bump` to contest; golden eval on every prompt edit; manual review during the pilot |
| **AI de-escalates something urgent** | Structurally impossible — the merge only escalates |
| **Anthropic outage** | Keyword fallback is a hard requirement (C8, E26); kill switch; visible in the digest |
| **Bot offline** | Pinned-post footer tells members what to do; `/health` + uptime monitor; boot DM |
| **Photo rot** | Re-host at ingest, buffered to disk first |
| **A public ticket exposes a reporter** | Never automatic; explicit confirm that says it can't be undone; staff-published mirrors don't name the reporter; the mirror carries the summary, never the raw text |
| **The public channel becomes a complaints wall** | Opt-in only, and the copy frames it as "affects everyone"; public rate tracked; if it turns noisy, move mirrors to their own channel — one config key |
| **Ideas list rots** | O5. This is a people problem, not a software one, and the digest surfaces the count every Monday |
| **SQLite/Notion drift** | SQLite is authoritative; everything goes through the queue; `/mox resync` |

---

## 14. Staff playbook — the adoption mechanism

The bot doesn't win because triage is smart. It wins because every staff member says the same
sentence for a month:

> **"Yep, I can do that — drop it in #report-an-issue so it doesn't get lost."**

- **Jake keeps walking the floor.** Nothing changes. When someone grabs him he fixes it *and*
  `/log`s it — five seconds. The digest is **his** record of his week, not a supervisor's.
- **React, don't type.** 👀 when you start, ✅ when it's done. That's the whole job. Hit 💬 Reply
  when you actually need to ask the person something.
- **When someone DMs Carolina or posts in an office channel,** the reply is the sentence above.
  Every time. Kindly. For a month.
- **Pin a one-liner in `#ask-staff`:** *"Something broken? → #report-an-issue."*
- **When something affects everyone, make it public.** Wifi down, bathroom out, coffee machine
  dead — one tap and nobody files it four more times.
- **Week-one review:** read every ticket together for fifteen minutes. Fix the prompt, the keyword
  table or the copy — not the people.

---

## Appendix — Sources

- Video call transcript, Jen Baik + Carolina Oliveira
- [Jake + Whit Support ticket system](https://app.notion.com/p/3cd54492ea7a80c786aefa51affeadf2) — Notion meeting notes
- [Building Tickets](https://app.notion.com/p/3d054492ea7a80beba2bc4ecaf6fbee3) — Notion, the DB host page
- Jen's routing model, 2026-09-22
- Jake's feedback on v1.2 (discrete tasks / requester interaction), incorporated in §6.4 and §14
- External review of v1.1 (ChatGPT), incorporated in v1.2
