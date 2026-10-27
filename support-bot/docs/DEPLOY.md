# Deploying the support bot

The bot holds an open Discord connection and keeps a small SQLite database. That rules out serverless
hosts like Vercel. It needs **one always-on container with a disk attached, and never more than one copy.**

Railway does both for about $5/month, and redeploys by itself when `support-bot/` changes on `main`.

---

## Before you start

- [ ] `Dockerfile`, `.dockerignore` and `railway.json` are in `support-bot/` on `main` (they are).
- [ ] You have the four secrets to hand. They're in the current `.env` on the machine running the bot today:
      `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ANTHROPIC_API_KEY`, `AIRTABLE_TOKEN`.
- [ ] You can stop the bot that's running today (the "mox bot" terminal tab).

---

## 1 · Create the service

1. **railway.com** → sign in with GitHub → **New Project** → **Deploy from GitHub repo** → `manifoldmarkets/mox-sf`.
   Railway may need you to grant it access to the `manifoldmarkets` org; an org owner may have to approve.
2. Open the service → **Settings**:
   - **Root Directory** → `support-bot`. *The step that gets missed: without it Railway builds the website.*
   - **Config as code / Railway config file** → `support-bot/railway.json`, if it isn't picked up by itself.
     That file sets the Dockerfile build, one replica, no sleeping, the `/health` check, and **watch paths**
     so only changes under `support-bot/` redeploy the bot (website changes don't restart it).

The first deploy will **fail on purpose**: with no database yet, the bot refuses to start (see step 4).
That's what stops a second copy from running while the old one is still up.

## 2 · Attach the volume

Service → **Add Volume** → **Mount path** `/data`.

The ticket database, numbering, retry queue and photo buffer live here. Without a volume they'd be wiped
on every redeploy.

## 3 · Variables

**Variables** → Raw Editor, paste, then fill in the four secrets:

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
ANTHROPIC_API_KEY=
AIRTABLE_TOKEN=
DISCORD_GUILD_ID=1339404214081687675
TRIAGE_MODEL=claude-haiku-4-5-20251001
TRIAGE_ENABLED=true
OPS_ALERT_USER_ID=698382049136082996
DATABASE_PATH=/data/mox.db
PHOTO_DIR=/data/photos
TZ=America/Los_Angeles
LOG_LEVEL=info
NODE_ENV=production
```

`DATABASE_PATH` and `PHOTO_DIR` must point at the volume. No port setting is needed: the bot listens on the
`PORT` Railway gives it.

## 4 · Cut over: order matters

Two copies of the bot on one token answer every tag twice and open duplicate tickets. So:

1. **Stop the old bot** (Ctrl-C in its terminal tab). From here until step 4, tags go unanswered for a few minutes.
2. On that machine, from `support-bot/`: `npm run export-seed`. It snapshots the database, DMs you the file
   from the bot, and prints a `SEED_DATABASE_URL=…` line.
3. Add that line to Railway's **Variables**. Railway redeploys.
4. Check the deploy log for `database created` with `seeded`, then `Mox Support Bot online`, and that you got
   the bot's "online" DM. If not, read the log; don't assume.
5. Remove `SEED_DATABASE_URL` from Variables (the bot never re-seeds over an existing database anyway),
   and delete the snapshot DM.

**Don't start the old copy again.** For local development use a separate test bot token, never the prod one.

## 5 · Slash commands

Already registered with Discord; deploying doesn't touch them. Re-run `npm run register-commands` from a
machine with the `.env` only when a command's name or options change.

## 6 · Uptime monitoring

Service → **Settings → Networking → Generate Domain**. Point UptimeRobot or Better Stack (both free) at
`https://<that-domain>/health`, every 5 minutes, alert on anything but 200.

`/health` returns 503 until the bot is connected to Discord, so this catches a bot that's running but
disconnected, which you'd otherwise never notice.

---

## Shipping a change

Merge a PR to `mox-sf` `main` that touches `support-bot/`. Railway rebuilds and restarts the bot by itself;
the database on the volume is untouched. Website-only changes don't restart it.

## Things that will bite you

| | |
|---|---|
| **Two copies** | Never scale past 1 replica, and never run the prod token anywhere else. Duplicate cards, digests and nudges, and a locked database. `numReplicas: 1` is pinned in `railway.json`. |
| **No volume** | Everything is wiped on redeploy. The bot refuses to start on an empty database unless `ALLOW_FRESH_DATABASE=true`, which is only for a brand-new install with no history. |
| **Sleeping** | A sleeping bot silently stops answering buttons. `sleepApplication: false` is set; don't turn it on. |
| **Wrong root directory** | Railway builds the website instead. Must be `support-bot`. |
| **Secrets in git** | Secrets go in Railway Variables only. `.env` stays gitignored. Rotate anything ever pasted somewhere shared. |

## Backups

Railway doesn't back up volumes for you. Manual backup, with the Railway CLI logged in:

```bash
railway ssh -- node -e "require('better-sqlite3')('/data/mox.db').backup('/data/backup-' + new Date().toISOString().slice(0,10) + '.db')"
```

Airtable holds a copy of every ticket's fields, so losing the volume costs the Discord bookkeeping (which card
belongs to which ticket, numbering, photo buffers), not the record of what happened.

## Rolling back

**Deployments** tab → the last good deploy → **Redeploy**. The volume isn't touched, so the database survives.
