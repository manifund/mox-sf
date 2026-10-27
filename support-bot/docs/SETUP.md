# Everything the bot needs from you

Fill in every `<<...>>`. The bot is built to **refuse to start** while any placeholder is left, so
nothing can silently run against the wrong channel.

Roughly 25 minutes. Do the sections in order — section D depends on A.

⚠️ **Sections B, C and D contain live secrets.** Send them somewhere private, and rotate any that
end up in a shared thread. Every one has a "reset" button where you made it.

---

## A · Discord IDs — 8 minutes

**First turn on Developer Mode:** Discord → ⚙️ **User Settings** → **Advanced** → **Developer Mode** on.

Then right-click anything → **Copy ID** at the bottom of the menu.

```yaml
GUILD_ID:                        <<   >>   # right-click the Mox server icon, far-left sidebar

# Channels — right-click the channel name in the sidebar
CHANNEL_REPORT_AN_ISSUE:         <<   >>   # create it first if it doesn't exist
CHANNEL_TEAM_JAKE:               <<   >>   # where facilities tickets land
CHANNEL_TEAM_CLAUDIO:            <<   >>   # or write NONE — see note below
CHANNEL_TEAM_ROBIN:              <<   >>   # or write NONE
CHANNEL_MOX_CONTRACTOR_REQUESTS: <<   >>   # rename the janitorial channel to this first
CHANNEL_DIGEST:                  <<   >>   # where Monday's summary posts — #team-jake is fine

# People — right-click their name in the member list, or their avatar on any message
USER_JAKE:                       <<   >>
USER_WHIT:                       <<   >>
USER_CLAUDIO:                    <<   >>
USER_ROBIN:                      <<   >>
USER_JEN:                        <<   >>   # you — gets the DM when something breaks

# Role — Server Settings → Roles → right-click the role → Copy ID
ROLE_MOX_STAFF:                  <<   >>
```

> **If Claudio or Robin has no channel,** write `NONE` and their tickets post in `#team-jake` with
> them @-mentioned. It works, it's just noisier for Jake.

### The `@mox staff` role — the one thing to get right

Everything about who-sees-what hangs off this role.

1. **Server Settings → Roles** — create `mox staff` if it doesn't exist.
2. **Add everyone who should see every ticket.** Jake, Whit, Claudio, Robin, you, Carolina, and
   anyone else who'd ever act on one. Members of this role see *all* tickets, assigned to them or
   not — that's deliberate, and it's what you asked for.
3. On **`#report-an-issue`** → Edit Channel → **Permissions**, set:

| Role | View | Send Messages | Send in Threads | Create Threads | **Manage Threads** | Add Reactions |
|---|---|---|---|---|---|---|
| `@everyone` | ✅ | ❌ | ✅ | ❌ | **❌** | ❌ |
| `@mox staff` | ✅ | ✅ | ✅ | ✅ | **✅** | ✅ |

> **`Manage Threads` is the whole mechanism.** Discord shows a private thread to its members *or* to
> anyone with that permission on the channel. It's how all staff see all tickets without being
> invited to each thread. If `@everyone` gets it by accident, every "private" ticket becomes public.

---

## B · Discord bot — 7 minutes

1. **discord.com/developers/applications** → **New Application** → name it `Mox Support`
2. Left sidebar → **Bot** → **Reset Token** → copy it. ⚠️ Shown once.
3. Same page, **Privileged Gateway Intents** — turn ON:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
4. Left sidebar → **OAuth2** → copy the **Client ID**
5. **OAuth2 URL Generator**:
   - Scopes: ✅ `bot` ✅ `applications.commands`
   - Permissions: **View Channels · Send Messages · Send Messages in Threads · Create Public Threads · Create Private Threads · Manage Threads · Manage Messages · Add Reactions · Embed Links · Attach Files · Read Message History · Mention @everyone, @here and All Roles**
6. Open the generated URL → add the bot to the Mox server

```
DISCORD_TOKEN:     <<   >>
DISCORD_CLIENT_ID: <<   >>
```

---

## C · Anthropic API key — 3 minutes

1. **console.anthropic.com** → sign in
2. **Settings → Billing** → add a payment method *(required — free credits won't cover a service that runs continuously)*
3. **API Keys → Create Key** → name it `mox-support-bot`
4. **Settings → Limits** → set a monthly cap. **$5 is generous** — real cost is under $1/month at pilot volume.

```
ANTHROPIC_API_KEY: <<   >>
```

---

## D · Notion — 4 minutes

1. **notion.so/profile/integrations** → **New integration**
2. Name `Mox Support Bot`, workspace **manifoldmarkets**, type **Internal**
3. Capabilities: ✅ Read content ✅ Update content ✅ Insert content
4. Submit → copy the **Internal Integration Secret**
5. **Connect it to the page** — this step gets missed and the bot then 404s:
   open the **Building Tickets** page → **•••** (top right) → **Connections** → **Connect to** → `Mox Support Bot`

```
NOTION_TOKEN:            <<   >>
NOTION_TICKETS_PAGE_ID:  3d054492ea7a80beba2bc4ecaf6fbee3   # already confirmed — leave as is
```

> The database itself doesn't exist yet. The bot creates it and its five views on first run, on
> that page. You don't need to build anything in Notion.

---

## E · Four decisions — 2 minutes

I picked a default for each so nothing blocks. Change any of them here.

```yaml
# 1. Where facilities tickets (plumbing, wifi, desks, appliances, security) post.
#    "team_jake"  = #team-jake, both Jake and Whit mentioned, first 👀 owns it   ← default
#    "facilities" = a new shared #facilities channel (give me its ID in section A)
FACILITIES_DESTINATION: team_jake

# 2. Who covers midnight to 5am? You gave Claudio 5am–5pm and contractors 5pm–midnight.
#    "contractors" = they own 5pm–5am as one block, no gap                       ← default
#    "claudio"     = Claudio owns midnight–5pm
OVERNIGHT_OWNER: contractors

# 3. Broken appliances — coffee machine, printer, fridge, microwave.
#    "facilities" = Jake + Whit                                                  ← default
#    "claudio"    = Claudio
APPLIANCE_OWNER: facilities

# 4. Where public tickets and mirrors land.
#    "report_an_issue" = same channel as the pinned post                         ← default
#    "separate"        = a dedicated #whats-broken (give me its ID in section A)
PUBLIC_CHANNEL: report_an_issue
```

---

## F · The one that isn't a config value

**Who reviews the ideas list, and how often?**

Broken things route to a person automatically. Ideas don't — by design, so they never ping anyone.
But that means without a named human and a rhythm, the Ideas view is a list nobody opens, and
we've rebuilt `#ask-staff` with extra steps.

Answer both:

```
IDEAS_REVIEWER:  <<   >>      # a name — you, Carolina, whoever
IDEAS_CADENCE:   <<   >>      # "monthly", "at Monday standup", "when it hits 10", …
```

Monday's digest will show the count and name that person, so it's in front of someone every week.

---

## Handing it over

Send me sections A–F filled in and I'll produce `config.yaml` and `.env`, then build Phase 1.

If you'd rather not paste secrets into chat: fill in **A, E and F** here, and put **B, C and D**
straight into the `.env` on the host yourself. Those four values are the only ones the bot reads
from the environment rather than from config.

---

## Quick checklist

- [ ] `#report-an-issue` exists, permissions set per the table in §A
- [ ] Janitorial channel renamed `#mox-contractor-requests`
- [ ] `@mox staff` role exists and contains everyone who should see all tickets
- [ ] `@mox staff` has **Manage Threads** on `#report-an-issue`; `@everyone` does **not**
- [ ] Bot added to the server, both privileged intents ON
- [ ] Anthropic billing on, spend limit set
- [ ] Notion integration **connected to the Building Tickets page**
- [ ] Every `<<   >>` above filled in
