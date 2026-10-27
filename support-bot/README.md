# Mox Building Support Bot

A Discord bot for `#report-an-issue` at Mox. Member taps a button → a thread opens → Claude Haiku
reads it immediately and works out what kind of thing it is and who owns it → the member picks an
urgency → a card lands with the right person → staff react 👀 to claim and ✅ to close → the
reporter is kept informed → a row lands in the **Tickets** table in the Mox Airtable base.

Spec: [`docs/spec.md`](docs/spec.md) (v2.5). Setup checklist: [`docs/SETUP.md`](docs/SETUP.md).

> **Where this lives.** This folder is a self-contained Node service inside the `mox-sf` repo. It is not
> part of the Next.js site: it has its own `package.json`, uses **npm** (not Bun), and is excluded from the
> site's type-check, tests and Prettier. Run every command below from `support-bot/`.

> **Airtable, not Notion.** The spec and SETUP.md describe a Notion board. On 2026-09-28 the mirror
> moved to Airtable: base `appkHZ2UvU6SouT5y`, table `Tickets` (`tblu7WNEE8R6YBZHH`). Everything the
> spec says about "Notion" applies to that table. Ignore SETUP.md section D; instead create an Airtable
> personal access token with `data.records:read`, `data.records:write` and `schema.bases:read` on the
> Mox base and put it in `.env` as `AIRTABLE_TOKEN`.

## Run it

```bash
cp .env.example .env        # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, ANTHROPIC_API_KEY, AIRTABLE_TOKEN
npm install
npm run check-config        # same validation the bot does at boot — refuses on any <<PLACEHOLDER>>
npm run register-commands   # /log and /mox, once per guild
npm run dev                 # tsx watch
```

Production runs on Railway: see [`docs/DEPLOY.md`](docs/DEPLOY.md). Locally, `npm run build && npm start`.
The process needs a persistent volume for `DATABASE_PATH` and `PHOTO_DIR`. It refuses to start if:

- `config.yaml` or `.env` still contains a `<<PLACEHOLDER>>` (E30 — the key is named);
- the live Airtable table is missing a field the bot writes (§3.3);
- there's no database and neither `SEED_DATABASE_URL` nor `ALLOW_FRESH_DATABASE=true` is set, so ticket numbering
  can never restart by accident.

`/health` on `HEALTH_PORT` returns `200 {ok, uptime, queueDepth, open, triage}` — point an uptime
monitor at it. Bot-offline is not detectable from inside the bot.

## Running without Airtable

Leave `AIRTABLE_TOKEN` blank and the bot runs normally: tickets route, cards work, the standing queue
and digest are unaffected. Every Airtable write is queued in SQLite instead of sent, and no backlog
alert fires. When the token is added, restart the bot: it checks the live schema, then drains the
queue and creates every record that was waiting. Nothing is lost.

## Airtable is two-way (2026-10-13)

People can work tickets in Airtable too, including the **Building Tickets** interface (Queue board, By owner,
Ideas, At a glance). Every minute, and right before any digest, the bot reads the table and applies changes to
**Status, Owner, Priority, Kind or Resolution** through the same actions as a Discord click: the reporter is
told, every card and digest line updates, and the change is attributed to whoever made it in Airtable.

On an idea, Done or Won't do closes it, and an Owner just says who's looking after it: it stays an idea, with no
thread and no ping. A P0–P2 priority, or Kind → Issue, turns it into a work item (keeping that owner).

Echoes can't happen. A ticket with a bot write still queued is skipped, and a row counts as edited only if its
**Last edited** time is after the bot last wrote it (`mirror_written_at`). Changes the bot can't act on, like an
owner who no longer exists or a duplicate without a link, are ignored rather than guessed. Other fields
(the reporter's words, Discord links) remain bot-owned and are rewritten on the next update. This supersedes
spec §6.4.3, which kept Airtable write-only.

## The Airtable table

Created 2026-09-28 in the Mox base. Fields the bot writes: `Name`, `Ticket ID`, `Kind`, `Status`,
`Priority`, `Reported priority`, `AI assessment`, `Category`, `Owner`, `Routed by`, `Owner reasoning`,
`Claimed by`, `Reporter`, `Location`, `Summary`, `Description`, `Photos`, `Discord thread`,
`Visibility`, `Reported`, `Claimed`, `Closed`, `Resolution`, `Duplicate of`, `Source`. `Days open` is a
formula and `Duplicates` is the inverse of the self-link. Photos are uploaded from the buffered file
through Airtable's `uploadAttachment` endpoint (5 MB cap; larger images are attached by Discord URL
while it is still fresh). **Airtable is write-only from the bot's point of view** — an edit made in
Airtable does not reach Discord and is overwritten the next time the ticket changes.

## Tests

```bash
npm test        # route table (§11.1), merge rule (§4.5), lifecycle (§5.1), keywords, time, config
npm run eval    # replays tests/golden.jsonl through live Haiku — run after every edit to prompts/triage.md
```

## Where things live

| Question | File |
|---|---|
| Who owns which category, hours, channels, IDs | `config.yaml` |
| How the model decides (who each person is, worked examples) | `prompts/triage.md` |
| Every user-facing string | `src/render.ts` |
| Routing rules R1–R7 and delivery (thread vs channel) | `src/routing.ts` |
| Escalate-only merge | `src/triage/merge.ts` |
| The only place `status` changes | `src/core/lifecycle.ts` |
| Intake state machine: triage → priority → dupe/question/safety → route | `src/core/flow.ts` |
| Claim / close / reassign / priority / won't do / publish / reopen / `/log` | `src/core/actions.ts` |
| Cards on every surface + collapse on close | `src/cards.ts`, `src/mirror.ts`, `src/queue.ts` |
| Airtable mirror (write-only, queued, schema-checked on boot) | `src/airtable.ts` |
| Buttons, selects, modals, slash commands | `src/handlers/interactions.ts` |
| 👀 / ✅ | `src/handlers/reactions.ts` |
| Photos, `bump`, reopen, resolution notes | `src/handlers/threadMessages.ts` |
| Timers | `src/jobs/*.ts` |

## Decisions made while building (where the spec disagreed with itself)

`config.yaml` is the source of truth wherever the spec text lagged behind it:

- **Carolina's delivery is `thread`, not `dm`** (spec §7.1 shows an older `dm`; §7.5 and the config say no DMs for delivery).
- **Door codes go to Carolina**, so E5's "routes to Robin" is read as "routes to Carolina, not facilities".
- **Claudio owns 00:00–17:00** per the config and §7.4, so E7's "04:30 → contractors" is read the v2.x way: 04:30 → Claudio.
- **The board is Airtable, not Notion** (see the note at the top). The table is not created by the bot; it fetches the live schema on boot and fails loudly if a field is missing. `Owner` has separate `Jake` and `Whit` options; `Duplicate of` is a real self-link.
- **✅ removed within 10 min** goes back to `claimed` (§6.4) without counting as a reopen; the §5.1 table only lists `done → routed`, so it is implemented as `done → routed → claimed` with `reopen_count` untouched.
- **Unanswered pauses never drop a ticket (C8):** a duplicate offer or question redirect left for 3 minutes proceeds as an ordinary issue.
- **Nudges** follow §7.5.2: P0 → DM each owner + reply on the card tagging `@mox staff`; P1 → DM for thread-delivery owners, one channel reply for channel-based owners.
- **Numbering starts at MOX-100** (`notion.first_ticket_number`) so real tickets never collide with the sample rows. Delete the sample rows before the pilot.

## Staffing changes

**Whit left on 2026-09-28.** `rota.facilities` in `config.yaml` is `[jake]`, so every plumbing, utilities,
furniture, appliance and security ticket goes to Jake and only Jake is mentioned on a P0. His owner block
and user id are commented out rather than deleted, and the `Whit` option still exists in Notion so old
rows keep their history. To split facilities again, add an owner block and a second name to
`rota.facilities`; the parity rule (even → first, odd → second) comes back on its own.

## Urgency is a checkbox on the modal (2026-10-01)

The spec's second interaction (three priority buttons in the thread, 3-minute timeout) is gone. The report
modal has a **This is urgent** checkbox. Ticked → reported P0, routed the moment triage returns. Unticked →
the member expressed no preference, so the model's assessment (P1 or P2) is the effective priority
(`priority_source = ai_assessment`; P1 `default` on the keyword path). The AI still only ever escalates, and
staff can still change priority from the card. The 30-second job now just unsticks stale pauses.

## Ideas go straight on the board (2026-10-01)

Triage runs before any thread is opened. If it's an idea, no thread is created in `#report-an-issue`:
the row lands in Airtable (Idea / P3 / Unassigned) and the member gets one line, "Thanks! We've added
this to the queue as MOX-x and will try to address it when we can." From the modal that's a private
reply only they see; from `#ask-staff` it's the confirmation in the thread on their message.

## Private issues only (2026-10-01)

Public tickets (§6.9: the "Report publicly" button, "Make public", the mirror card) were removed. Every
report opens a private thread visible to the reporter and `@mox staff`. The `visibility` columns stay in
SQLite and Airtable so old rows still read; new rows are always `Private`.

## Intake channel

The intake is a dedicated **`#report-an-issue`** (`1555120759435829328`, recreated 2026-10-01). Members
can see it and press the button but cannot post in it, so the button post is the only message there and
stays front and center. That is the spec's §2.3 permission matrix; `npx tsx scripts/checkPermissions.ts`
verifies it. An earlier attempt to host the intake in `#ask-staff` was reverted because chat pushed the
button out of view.

## Running with only the intake channel

The bot works with access to just that one channel. Every ticket's card is posted in its own thread with
the owner @-mentioned, so delivery never depends on the team channels. What you lose until `support-bot`
can see the others: the P0 breakout cards in team channels, the extra card in `#team-sl-claudio` and
`#mox-contractor-requests`, the pinned standing queue and the Monday digest in `#issues-digest-staff`.
Each inaccessible channel is logged once at boot and then skipped silently. Grant View Channel and they
start working without a code change; restart once so the standing queue gets posted.

## Discord setup that the code relies on

- `@mox staff` has **Manage Threads** on `#report-an-issue` and `@everyone` does not — that is C6.
- The bot needs Manage Messages (to pin the standing queue and strip non-staff reactions) and Add
  Reactions in every channel it posts cards to.
- Grant `/log` and `/mox` to the `mox staff` role under Server Settings → Integrations; they are
  registered with no default permissions.
