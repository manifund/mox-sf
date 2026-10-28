# Airtable Schema

This document describes the Airtable tables and fields used by the Mox SF application.

> **Auto-generated from Airtable API** - Last updated: 2026-01-20

## Configuration

- **Base ID**: Set via `AIRTABLE_BASE_ID` environment variable
- **API Key**: Set via `AIRTABLE_API_KEY` environment variable
- **Client**: Uses direct REST API calls via `fetch`

---

## Tables

### People

Primary table for user/member management.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | User's full name | ✅ Profile, directory |
| `Email` | email | Email address (used for login) | ✅ Auth, notifications |
| `Tier` | singleSelect | Membership level | ✅ Discord sync, access control |
| `Status` | singleSelect | Member status | ✅ Auth, Discord sync |
| `Org` | multipleRecordLinks | Links to Orgs table | ✅ Portal display |
| `Program` | multipleRecordLinks | Program affiliations | ✅ Portal display |
| `Website` | url | Personal/professional website | ✅ Profile editing |
| `Photo` | multipleAttachments | Profile photo | ✅ Profile, directory |
| `Show in directory` | checkbox | Display in public directory | ✅ Directory visibility |
| `Discord Username` | singleLineText | Discord handle for role syncing | ✅ Discord integration |
| `Work thing` | singleLineText | Professional interest (1-4 words) | ✅ Profile, directory |
| `Work thing URL` | url | Link for professional interest | ✅ Profile, directory |
| `Fun thing` | singleLineText | Fun interest (1-4 words) | ✅ Profile, directory |
| `Fun thing URL` | url | Link for fun interest | ✅ Profile, directory |
| `magic_link_token` | singleLineText | Auth token (32-byte hex) | ✅ Magic link auth |
| `token_expires` | dateTime | Token expiration timestamp | ✅ Magic link auth |
| `Stripe Customer ID` | multilineText | Link to Stripe customer | ✅ Billing, subscriptions |
| `First Name` | formula | Extracts the first name from the 'Name' field | |
| `Last Name` | formula | Extracts the last name from the 'Name' field | |
| `Stripe Dashboard Link` | formula | Creates a direct URL to the Stripe customer dashboard | |
| `In Verkada` | checkbox | Verkada access provisioned | |
| `In Forkable` | checkbox | Forkable meal club status | |
| `Internal Notes` | multilineText | Staff notes | |
| `Priority` | singleSelect | Application priority | |
| `Tags` | multipleSelects | Various tags | |
| `Room` | multipleRecordLinks | Assigned room/desk | |
| `Events` | multipleRecordLinks | Events attended/hosted | |
| `Day Passes` | multipleRecordLinks | Purchased day passes | |
| `Created` | createdTime | Record creation date | |
| `Job status` | singleSelect | **STAFF-ONLY.** Looking now / Open to offers / Not looking | ✅ Profile career section, careers admin |
| `Hiring` | checkbox | **STAFF-ONLY.** Member says they're hiring | ✅ Profile career section, careers admin |
| `LinkedIn` | url | **STAFF-ONLY.** | ✅ Profile career section, careers admin |
| `Career notes` | multilineText | **STAFF-ONLY.** Free-text for staff | ✅ Profile career section, careers admin |
| `Event digest` | checkbox | Opt-in to weekly personalized event email | ✅ Profile, event-suggestions cron |

**Tier options:** Staff, Volunteer, Private Office, Program, Resident, Core, Friend, Courtesy, Guest Program, Paused

**Status options:** Applied, Evaluating, Backburner, To Invite, Invited, Guest Program, Joined, Cancelled, Rejected, Payment Issue, Waitlisted, Declined, Visited, Event Host, Paused

---

### Events

Manages events and activities.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Event name | ✅ Calendar, portal |
| `Start Date` | dateTime | Event start (America/Los_Angeles timezone) | ✅ Calendar |
| `End Date` | dateTime | Event end (America/Los_Angeles timezone) | ✅ Calendar |
| `Event Description` | multilineText | Detailed description | ✅ Calendar, portal |
| `Event Poster` | multipleAttachments | Event image for website | ✅ Event display |
| `Featured` | checkbox | Featured event flag | ✅ Homepage |
| `Priority` | singleSelect | P1, P2, P3 | |
| `Status` | singleSelect | Event status | ✅ Calendar filtering |
| `Type` | singleSelect | Public, Members, Private | ✅ Calendar |
| `URL` | url | Event link (Partiful, Luma, etc.) | ✅ Calendar |
| `Hosted by` | multipleRecordLinks | Host people | ✅ Portal hosted events |
| `Host org` | multipleRecordLinks | Host organization | |
| `Host Name` | formula | Returns Host org if present, otherwise Hosted by | ✅ Calendar display |
| `Assigned Rooms` | multipleRecordLinks | Booked rooms | |
| `Name (from Assigned Rooms)` | lookup | Room names | ✅ Portal display |
| `Notes` | multilineText | Additional notes | ✅ Calendar |
| `Event Retro` | multilineText | Post-event retrospective | |
| `Revenue` | currency | Event revenue | |
| `Invoice Status` | singleSelect | Payment status | |
| `Door Token` | singleLineText | 12-char alphanumeric token gating the `/door?evt=…` unlock link. Populated by an Airtable automation when `Status` becomes `Confirmed`. | ✅ Door unlock |

**Status options:** Idea, Maybe, Confirmed, To invoice, Invoiced, Paid, Cancelled, Recurring, Declined

**Type options:** Public, Members, Private

---

### Orgs

Organization/company management.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Organization name | ✅ Portal display |
| `Status` | singleSelect | Organization status | |
| `Stealth` | checkbox | Hide from directory | ✅ Directory filtering |
| `People` | multipleRecordLinks | Organization members | |
| `Rooms` | multipleRecordLinks | Assigned offices | |
| `Notes` | multilineText | Internal notes | |
| `Hiring` | checkbox | Org is actively hiring | ✅ Careers admin |
| `Careers URL` | url | Careers page, scraped weekly into Roles | ✅ scrape-roles cron |
| `About` | multilineText | Public 1-2 sentence blurb on /jobs; auto-generated from Website when empty (never overwrites hand edits) | ✅ /jobs, scrape-roles cron |

**Status options:** Tried once, To reach out, Normal membership, Guest program, Joined, Declined, Tried twice, In contact, Short-term, Left

---

### Day Passes

Guest day pass and week pass management.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Stripe session ID (unique identifier) | ✅ Activation lookup |
| `User` | multipleRecordLinks | Link to People record | ✅ User association |
| `Username` | lookup | Guest's name (from User) | ✅ Display |
| `Email` | lookup | Guest's email (from User) | ✅ Notifications |
| `Pass Type` | singleSelect | Type of pass | ✅ Activation |
| `Status` | singleSelect | Pass status | ✅ Activation flow |
| `Date Purchased` | createdTime | Purchase timestamp | |
| `Date Activated` | date | When pass was activated | ✅ Activation |
| `Issued By` | multipleRecordLinks | Member who bought or issued the pass | ✅ Portal, guest passes |
| `Issued By Email` | lookup | Issuer's email (from Issued By); lets the app list a host's passes | ✅ Guest passes |
| `Guest Name` | singleLineText | Guest Pass only: who the pass is for. No People record is created for the guest. | ✅ Guest passes |
| `Guest Email` | email | Guest Pass only: the guest's email, so Mox can reach them if needed | ✅ Guest passes |
| `Token` | singleLineText | Guest Pass only: 12-char token in the `/guest/<token>` unlock link | ✅ Guest passes |
| `Valid Date` | date | Guest Pass only: the Pacific day the pass works (8am–11pm); counts against that week's allowance | ✅ Guest passes |
| `Unlock Count` | number | Guest Pass only: door unlocks via the link (capped at 100) | ✅ Guest passes |
| `First Used` | dateTime | Guest Pass only: first unlock | ✅ Guest passes |

**Pass Type options:** Day Pass, Happy Hour Pass, Week Pass, Guest Pass

**Status options:** Unused, Activated, Expired, Revoked

The app writes `Guest Pass` and `Revoked` with `typecast: true`, so Airtable
adds those select options automatically on first use.

---

### Programs

Short-term programs and residencies.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Program name | |
| `Organization` | multipleRecordLinks | Associated org | |
| `Members` | multipleRecordLinks | Program participants | ✅ Portal (Program field) |
| `Start Date` | date | Program start | |
| `End Date` | date | Program end | |
| `Pipeline Status` | singleSelect | Maybe, Confirmed, Cancelled | |

---

### Rooms

Physical room/desk management.

| Field | Type | Description |
|-------|------|-------------|
| `Name` | singleLineText | Room name |
| `Floor` | multipleRecordLinks | Link to a Floors record (resolved to floor number "1"–"4" by `getBookableRooms`) |
| `Room #` | singleLineText | Room number |
| `Room Size` | number | Capacity |
| `Status` | singleSelect | Private Office, Hotdesks, Lounge, Staff, Public Space, Booth |
| `Tenants` | multipleRecordLinks | Current tenants (Orgs) |
| `Resident Desks` | multipleRecordLinks | Assigned residents (People) |
| `Events` | multipleRecordLinks | Scheduled events |

---

### Floors

Per-floor metadata used by the `/floorplans` public page.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Floor name, e.g. "Floor 1" | ✅ Floorplans page |
| `Description` | multilineText | Short description of the floor's character/use | ✅ Floorplans page |
| `Images` | multipleAttachments | Photos of the floor (shown alongside SVG floorplan) | ✅ Floorplans page |

The SVG floorplans themselves are stored as static files in `/public/floorplans/Floor N.svg`.

---

### Attendance

Door-presence tracking: one record per person per Pacific day. Written by the
`sync-checkins` cron from Verkada door-access events; read by the weekly GEF
digest. Not to be confused with **Check-ins** (the pre-existing staff 1:1
conversation tracker, not used by the app).

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | "Person — date", set by the sync cron | ✅ Sync cron |
| `Person` | multipleRecordLinks | Link to People | ✅ Sync cron, GEF digest |
| `Date` | date | The Pacific-time day this record covers | ✅ Sync cron, GEF digest |
| `First seen` | dateTime | First door event that day | ✅ Sync cron |
| `Last seen` | dateTime | Last door event that day | ✅ Sync cron |
| `Source` | singleSelect | Verkada, Day Pass, Manual | ✅ Sync cron |

---

### Roles

Open roles in and around the Mox community, shown publicly at `/jobs`. Fed by
the weekly `scrape-roles` cron (LLM-extracts openings from member orgs'
`Careers URL` pages) and manual entry.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Title` | singleLineText | Role title | ✅ /jobs, scraper |
| `Org` | multipleRecordLinks | Link to Orgs (stealth orgs never shown publicly) | ✅ /jobs, scraper |
| `Company` | singleLineText | Company name for non-member orgs | ✅ /jobs |
| `URL` | url | Job posting link | ✅ /jobs |
| `Location` | singleLineText | | ✅ /jobs |
| `Tags` | multipleSelects | AI Safety, Research, Engineering, Policy, Operations, Comms, Design, Other | ✅ /jobs, matching |
| `Status` | singleSelect | Open (shown), Stale, Filled, Closed | ✅ /jobs, scraper |
| `Source` | singleSelect | Careers page, Manual, Member | ✅ Scraper (only touches its own) |
| `Posted` | date | First seen | ✅ Scraper |
| `Last verified` | date | Last seen on the careers page | ✅ Scraper |
| `Notes` | multilineText | | |
| `Description` | multilineText | Expandable summary on /jobs ("- " lines render as bullets); auto-extracted from the posting page | ✅ /jobs, scraper |
| `Salary` | singleLineText | As listed on the posting (auto-extracted) | ✅ /jobs, scraper |
| `Deadline` | date | Application deadline if listed (auto-extracted) | ✅ /jobs, scraper |

---

### GEF Applications

Global Expert Fellowship interest-form submissions from `/gef`.

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name` | singleLineText | Applicant name | ✅ GEF form |
| `Email` | email | Applicant email | ✅ GEF form |
| `Country` | singleLineText | Current country | ✅ GEF form |
| `Focus area` | singleLineText | Primary focus area | ✅ GEF form |
| `Background` | multilineText | Background | ✅ GEF form |
| `Proud of` | multilineText | Work they are proud of | ✅ GEF form |
| `Intentions` | multilineText | What they would work on in SF | ✅ GEF form |
| `Status` | singleSelect | New, Reviewing, Interviewing, Accepted, Rejected | ✅ GEF form (sets "New") |

---

### Operations Requests

Tickets submitted through the Airtable form at `/request` (one request per
submission). The portal's "tickets & requests" section lists a member's own
requests, matched on `Your Email`. Referenced by table ID (`tbl77SjSdonCzvVMr`).

| Field | Type | Description | Used by App |
|-------|------|-------------|-------------|
| `Name (first and last)` | singleLineText | Primary field; prefilled from the portal link | ✅ Portal (prefill) |
| `Your Email` | email | Prefilled from the portal link | ✅ Portal (prefill, lookup) |
| `Request Details` | richText | First line shown as the ticket summary | ✅ Portal |
| `Request Category` | multipleSelects | Building Issues, Food & Drink, Events Setup or other A/V, Program-related, Security & Safety, Other | ✅ Portal |
| `Status` | singleSelect | New, In progress, Done, Won't do (staff-only; blank shows as "new") | ✅ Portal |
| `Request Location`, `Room`, `Location Details`, `Time sensitive?`, `Date Needed By`, ... | | Form fields for staff | |

---

### Other Tables (not used by app)

- **Investments** - Investment tracking
- **Feedback** - Member survey responses
- **Speaker Reachouts** - Event speaker outreach
- **Frame Fellowship Apps** - Fellowship applications
- **GP Reachouts** - Guest program outreach

---

## Common Query Patterns

### Status-based filters
```
{Status} = "Joined"
OR(Status="Invited",Status="To Invite")
```

### Email lookups
```
{Email} = "user@example.com"
```

### Directory queries
```
AND({Show in directory}=TRUE(), {Status}="Joined")
```

### Events by host
```
AND(SEARCH("user_name", ARRAYJOIN({Hosted by}, ", ")), IS_AFTER({Start Date}, "2024-01-20"))
```

### Exclude staff from searches
```
{Tier} != 'Staff'
```

---

## Security

All user inputs are escaped using `escapeAirtableString()` before use in Airtable formulas to prevent formula injection attacks.

See [airtable-helpers.ts](../app/lib/airtable-helpers.ts) for validation utilities.
