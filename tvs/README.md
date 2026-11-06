# Mox TV displays

The HTML/CSS/JavaScript display currently used on the 1F and 3F Raspberry Pi
Zero 2 W devices. This is a separate app from the Next.js website. Cog/WPE
WebKit renders one local page at 1920×1080; no Node server or build is needed
on the TVs.

| Device | Tailscale IP | Page |
| --- | --- | --- |
| 1F | `100.87.232.90` | `web/index.html?floor=1` |
| 3F | `100.72.72.35` | `web/index.html?floor=3` |

Source was imported from the working `moxscreens-htmldesign` deployment.
Both Pis were migrated to `/home/mox/production` on November 6, 2026.
`web/events.js` in Git is an empty preview placeholder, never uploaded to a TV.

## Events

`update_events.sh` reads the Mox Airtable base `appkHZ2UvU6SouT5y`, Events
table `tblqzGMNypqO3jftS`. It writes `web/events.js` atomically. The existing
`mox-html-events.timer` refreshes it every minute; the page rereads it every
minute and recalculates “On now”/“Up next” every 30 seconds.

The feed includes ongoing events and events starting before midnight Pacific.
Idea, Maybe, Cancelled, and Declined statuses are hidden. Room rollups assign
events to floors 1–4; **Floor TBD events are not displayed**. A missing end
time defaults to two hours. Failed API refreshes retain the last good file.

Each Pi keeps its own PAT at
`/home/mox/production/auth/airtable.com.txt`. The PAT needs
`data.records:read` and access to the base. It is never uploaded to GitHub or
included in the deployment archive. The browser only sees the generated feed.

## Local preview and checks

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory tvs/web
# Open http://127.0.0.1:8766/index.html?floor=3

bash -n tvs/update_events.sh
node --check tvs/web/screen.js
python3 -m unittest discover -s tvs/tests -v
```

The preview initially has no events. `update_events.sh` requires GNU `date`,
`curl`, and `jq` (as installed on the Pis/Linux); the deploy tooling requires
Python 3.12+ and OpenSSH. Keep fictional preview data out of commits.

## Automatic deployment

[`TV displays`](../.github/workflows/tvs.yml) validates PRs without secrets.
Every push to **`main` in `manifund/mox-sf`** triggers deployment after checks,
including pushes that only change the website. A manual workflow run on main
can retry a failed rollout. Forks and PRs do not deploy.

The runner joins Tailscale, authenticates with ordinary SSH, then deploys 1F
and 3F sequentially. If 1F fails, 3F is not touched. A failure on 3F rolls back
3F; 1F retains the successful release. Concurrent runs are serialized and an
in-progress deployment is not canceled by a newer commit.
Queued runs reject superseded commits before connecting to the TVs, so an old
run cannot deploy over a newer completed rollout.

For each Pi the deploy script:

1. Uploads `update_events.sh`, `network_watchdog.sh`, the HTML/CSS/JS source,
   and `web/assets/`.
2. Validates the archive and shell syntax, pauses the HTML refresh timer, and
   copies that Pi's credential into the staged app with private permissions and
   generates fresh events using that copy. API failure
   aborts before changing the visible display.
3. Stops Cog, moves the current app into `~/deploy-backups/html-…`, and swaps
   the staged app into the same deployed path.
4. Starts Cog and waits up to 90 seconds for its successful page-load log.
   A failed launch restores the previous app and starts it again.
5. Resumes the refresh timer and records the Git SHA in `DEPLOYED_REVISION`.

Deployment does not modify service units, credentials, network settings,
floor configuration, or packages, and does not reboot. The existing services
must already be active and enabled. Both TVs were provisioned this way on
November 2, 2026. A fresh/reimaged Pi needs separate provisioning before this
workflow can target it. Keep the current Cog, `libgles2`, GNU `date`, `curl`,
`jq`, and systemd setup in place.

Backups are retained under `~/deploy-backups/` for manual recovery; there is
no automatic pruning. Backups now include the private `auth/` directory; do not
copy them into Git. Failed replacement apps are retained as `failed-html-…`.
Health verification confirms page loading, not physical TV appearance.

## One-time maintainer setup (required before deployment works)

The PR supplies code, not production credentials. Create a GitHub environment
named **`tvs`** in `manifund/mox-sf`, restrict deployments to `main`, and add:

| Environment secret | Value |
| --- | --- |
| `TVS_TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TVS_TS_OAUTH_SECRET` | OAuth client secret with auth-key write access for `tag:mox-tv-deploy` |
| `TVS_SSH_PRIVATE_KEY` | Dedicated unencrypted Ed25519 deployment private key, multiline OpenSSH format |

Use the **tailnet that owns the TVs**, not merely a personal tailnet to which
the TVs have been shared. Configure `tag:mox-tv-deploy` ownership and grant
that tag access to TCP port 22 on the two IPs above. See the official
[Tailscale GitHub Action setup](https://tailscale.com/docs/integrations/github/github-action).
An approval rule on the GitHub environment will pause deployment for approval;
omit required reviewers if every main push should deploy unattended.

Generate a dedicated deployment key on a trusted admin computer and append
its public key to `/home/mox/.ssh/authorized_keys` on both Pis. The
workflow runs as `mox`, whose current configuration permits
passwordless sudo for managing services. Treat this deployment credential as
privileged: do not reuse a personal SSH key. Ordinary SSH is used; Tailscale
SSH need not be enabled. Never commit private keys or PATs.

`known_hosts` contains **public** Ed25519 host keys obtained over authenticated
SSH from both Pis on November 3, 2026. Strict host verification is enabled.
After a reimage, verify the new key through a trusted channel and update this
file; do not disable host checking or blindly trust `ssh-keyscan` in CI.

## Manual rollout and recovery

On a trusted machine with Tailscale access, an authorized SSH identity, and
the checked-in host keys installed in `~/.ssh/known_hosts`:

```sh
python3 tvs/scripts/deploy.py 100.87.232.90 "$(git rev-parse HEAD)"
python3 tvs/scripts/deploy.py 100.72.72.35 "$(git rev-parse HEAD)"
```

If manually restoring a backup, stop `mox-html-events.timer`,
`mox-html-events.service`, and `mox-display.service` first. Move the failed
app aside, move the selected backup to `~/production`, then start
`mox-display.service` and `mox-html-events.timer` again. This preserves the
floor-specific service URL and the Airtable credential in the restored app's `auth/` directory.

Read-only status commands on a Pi:

```sh
systemctl is-active mox-display.service mox-html-events.timer
cat /home/mox/production/DEPLOYED_REVISION
journalctl _COMM=cog -n 20 --no-pager
```

`DEPLOYED_REVISION` is created by the first automated/manual rollout, so it
will be absent on the initial hand-deployed installation.

## Display account migration

Both TVs now run the display and event updater as `mox`, with their own
`/home/mox` and app at `/home/mox/production`. Existing authorized keys and
the password credential were copied locally from `tessavision`, along with
supplementary groups and passwordless sudo access. Existing `tessavision`
logins remain available. Future key changes should target `/home/mox/.ssh/authorized_keys`.

`scripts/migrate_user.py` is the one-time account migration, run with sudo
beside `apply_release.py`. It moves production and deployment backups, updates
service users, home paths and the Cog runtime UID, then verifies the event
refresh and page load. Failed migrations restore the previous app ownership
and unit files; the new account remains for inspection. Original unit files
are retained in `/home/mox/account-migration/`.

## Historical production directory migration

The repository directory stays `tvs/`; the app runs at `~/production` on each
Pi. `auth/airtable.com.txt` is copied locally on the Pi and is Git-ignored.
No runtime script reads from the old `~/tessavision` app directory. The Linux
display account is `mox`; `tessavision` remains available for existing SSH access.

`scripts/migrate_pi.py` performs the one-time migration on an existing Pi.
Upload an archive produced by `scripts/deploy.py`'s `package()` function and
place `migrate_pi.py` beside `apply_release.py` in a temporary remote directory.
This historical script targets `/home/tessavision/production` before the account
migration. Run `python3 migrate_pi.py display.tar.gz 1` (or `3`). It checks the floor,
fetches live events before stopping the display, saves existing unit files,
updates their paths, and checks Cog's page-load log. On failure it restores
the original units and services. It refuses to overwrite an existing
`~/production`. The old app directories remain as recovery copies.

The migration disables the unused legacy event/ticker timers and old display
fallback timers. On 1F, it also copies the existing Wi-Fi watchdog into
`production/network_watchdog.sh` and changes its service path, preserving
the device-specific Wi-Fi configuration. 3F does not have that watchdog
service. Other system networking tools under `/usr/local/sbin` remain in place.

`systemd/` contains the display, refresh, and 1F watchdog unit definitions for reference
and future provisioning. Replace `@FLOOR@` in `mox-display.service.in` with
the device floor and `@UID@` with `id -u mox`. Routine deployments do not reinstall these units.
