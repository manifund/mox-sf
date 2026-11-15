# Web Door Keypad (`/door`)

`moxsf.com/door` is a keypad in the browser. Anyone can type a Verkada entry
code there, and a code that is valid right now opens the front door. It stands
in for the hardware keypad at the door.

It accepts whatever Verkada accepts: a member's personal code, a guest pass
code, the shared weekly code, a code set by hand in Verkada Command. There is
no separate list of codes on our side.

(`/door?evt=...` is unrelated: that is the event page, which shows an event's
name and hours and has no unlock.)

## How a code becomes an unlock

```mermaid
flowchart TB
    A[Code typed at /door] --> B{Too many wrong codes?}
    B -->|Yes| X[429: wait]
    B -->|No| C[Look the code up:<br/>just-issued codes, then the index]
    C -->|No index exists yet| W[503 'starting up';<br/>rebuild starts in the background]
    C -->|Not found| R[Count a wrong code]
    C -->|Found a user| E[Re-read that user from Verkada:<br/>same code? inside start/end dates?]
    E -->|No| R
    E -->|Yes| F[Verkada user_unlock as that user]
    F -->|Granted| G[Door opens; Verkada logs the user]
    F -->|Refused| H[Shown as 'can't open the door now']
```

- **Finding the owner.** Verkada has no "who owns this code" lookup; a code
  can only be read one user at a time. `app/lib/door-pins.ts` keeps an index
  of every access user's code, built by listing all access users and reading
  each one. The index holds keyed hashes, not the codes, and lives in the
  Vercel Runtime Cache (`app/lib/door-store.ts`) so all function instances
  share it.
- **The index is only a shortcut.** Before every unlock the matched user is
  read from Verkada again, and the live code and start/end dates must match.
  A changed, revoked or expired code is refused even if the index still
  lists it.
- **The unlock.** `POST /access/v1/door/user_unlock` with the user's id.
  Verkada decides whether that user may open that door (access groups and
  schedules), so a guest code outside pass hours is refused by Verkada.

## Keeping the index current

Rebuilding the index reads every access user (about 690 in November 2026)
and has taken anywhere from 26 seconds to over two minutes, depending on how
hard Verkada rate-limits it. So it is never done while someone waits:

- **Every 30 minutes** the `refresh-door-codes` cron rebuilds it. This is
  what picks up codes set or changed by hand in Verkada Command, so those
  can take up to 30 minutes to work at `/door`.
- **Codes the site issues work at once.** When the portal generates a
  member's code or a guest pass is created, the code is registered directly
  (`rememberDoorCode`) without waiting for a rebuild.
- **No index at all** (first deploy to an environment, or the cache evicted
  it): the keypad answers "starting up", starts a rebuild in the background,
  and works a minute or two later. The same background rebuild starts if the
  index is over two hours old, meaning the cron has stopped.
- Only one rebuild runs at a time. Production and preview deployments keep
  separate indexes.

The first version rebuilt the index inside the unlock request when it was
missing or a code wasn't found. On the first production use both rebuilds
ran past the 120-second function limit and were killed, leaving the page
spinning. That is why rebuilding is now always in the background.

## What the person sees while waiting

A normal unlock answers in a second or two. The page steps through progress
messages as time passes ("Checking your code", "Asking the door system to
unlock", "The door system is slow to answer") and gives up after 15 seconds
with "The door system didn't answer in time", keeping the code on screen so
trying again is one tap. On the server the two Verkada calls made during an
unlock have their own time limits (4 and 6 seconds) so an answer normally
arrives before the page gives up.

## Tracking who came in

Each unlock appears in Verkada Command's access log as **Access Granted**,
method **User Unlock API**, against the access user who owns the code. That
is the same log keypad entries go to, so the nightly `sync-checkins` cron and
the guest-pass usage counts pick these up like any other entry.

Wrong codes never reach Verkada. They are in the function logs as
`[door-unlock]` lines (address and outcome, never the code).

## Wrong-code limits

The page is public, so guessing has to be slow (`app/lib/door-throttle.ts`).
Only wrong codes count.

| Limit | Threshold | Effect |
|-------|-----------|--------|
| Per address | 5 wrong in 10 minutes | That address waits out the 10 minutes |
| Everyone combined | 20 wrong in 10 minutes | Keypad closed to all for 30 minutes; post in Discord #notifications |

While the keypad is closed, signed-in members can still use the unlock button
in the portal.

## Requirements in Verkada

- **Enable Door Management via API** switched on at the organization, the
  site, and the front door (Command > Access). Without it Verkada refuses
  every API unlock.
- The API key (`VERKADA_MEMBER_KEY`, falling back to `VERKADA_API_KEY`) needs
  Access Control read/write, as for the portal's door code.
- The door id is `MOX_FRONT_DOOR_ID` in `app/lib/verkada.ts`.

## Files

- `app/door/page.tsx`, `app/door/DoorKeypad.tsx`: the page
- `app/door/api/unlock/route.ts`: the endpoint
- `app/lib/door-pins.ts`: code index and live check
- `app/api/cron/refresh-door-codes/route.ts`: scheduled index rebuild
- `app/lib/door-throttle.ts`: wrong-code limits
- `app/lib/door-store.ts`: shared store (Vercel Runtime Cache)
- `app/lib/verkada.ts`: `userUnlockDoor`, `listAccessUsers`, `getAccessUserCredentials`
