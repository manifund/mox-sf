# Post-merge instructions

## Getting the Pis on a better tailnet
So that Github can access them, the Pis that run this folder's Mox display are on a tailnet that I (clayjonesthomas) own. This needs to be migrated to a better owner. Tailscale accounts are free, so all this needs is a Mox-owned email address. Without the tailnet, the only way to access the Pis directly will be via SSH on the mox wifi, and only if your SSH key is already on the box.

If, in the future, nobody has ssh access to the Pis, you'll have to grab their SD cards and add ssh keys that way (to /home/mox/.ssh/authorized_keys).

### Instructions for moving the Pis to an appropriate tailnet

1. Create/select a new tailnet.
2. In **Access controls**, merge these entries into the existing `tagOwners` and `grants` fields; preserve other entries. Replace the example email with the tailscale account's login. Add more emails to `src` as needed; this allows you to ssh in to the Pis with your tailscale account instead of being connected to the Mox wifi (as in, remotely).

   ```json
   {
     "tagOwners": {
       "tag:mox-tv": ["autogroup:admin"],
       "tag:mox-tv-deploy": ["autogroup:admin"]
     },
     "grants": [
       {
         "src": ["maintainer@example.com", "tag:mox-tv-deploy"],
         "dst": ["tag:mox-tv"],
         "ip": ["tcp:22"]
       }
     ]
   }
   ```

3. Connect over **local Wi-Fi SSH**, not Tailscale: currently `mox@10.103.4.120` (1F) and `mox@10.103.2.187` (3F). DHCP addresses may change.
4. Move one Pi at a time: run `sudo tailscale login --advertise-tags=tag:mox-tv --hostname=mox-1f` (use `mox-3f` upstairs), then approve the login in the destination tailnet. Verify SSH through its new Tailscale address.
5. Update addresses in `tvs/scripts/deploy.py`, `tvs/tests/test_deploy.py`, `tvs/known_hosts`, `tvs/README.md`, `.github/workflows/tvs.yml`, and local SSH shortcuts. Preserve the verified SSH host keys.
6. Create a destination-tailnet OAuth client under **Settings → Trust credentials → Credential → OAuth**, with **Auth Keys: Write** for `tag:mox-tv-deploy`. Update GitHub's two Tailscale secrets below and verify a deployment.
7. Re-establish any other maintainers' access before retiring the old registrations and deployment credentials. The `mox` account, authorized SSH keys, and display files stay unchanged.

## Setting up Github Actions

An admin of `manifund/mox-sf` must:

1. Create **Settings → Environments → `tvs`**, restricted to `main`. Leave required reviewers unset for unattended deployments.
2. Add these **environment secrets** (secrets do not transfer with the PR):

| Name | Value |
| --- | --- |
| `TVS_TS_OAUTH_CLIENT_ID` | OAuth client ID from the tailnet currently hosting the TVs |
| `TVS_TS_OAUTH_SECRET` | Matching client secret |
| `TVS_AIRTABLE_TOKEN` | Existing token from `/home/mox/production/auth/airtable.com.txt` on either Pi |
| `TVS_SSH_PRIVATE_KEY` | New dedicated, unencrypted Ed25519 private key; append its public key to `/home/mox/.ssh/authorized_keys` on both Pis |

The fork's SSH private key is stored only in its GitHub secret store; generate a new pair for upstream.

3. Merge to `main`. Upstream `main` pushes that change `tvs/` deploy both TVs after checks; PRs only run checks. If secrets were added after merging, run **Actions → TV displays → Run workflow → main**.
4. Verify both deployment steps succeed, then disable the fork's deployment access. Do not run fork and upstream deployments concurrently.
