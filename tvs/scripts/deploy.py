#!/usr/bin/env python3
"""Package display source and deploy it over an already-authenticated SSH connection."""
import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
               "-o", "StrictHostKeyChecking=yes", "-o", "ServerAliveInterval=10",
               "-o", "ServerAliveCountMax=3"]


def package(destination):
    # Runtime data, credentials, local previews, and backups never enter the upload.
    files = [ROOT / "update_events.sh", ROOT / "network_watchdog.sh",
             ROOT / "scripts/configure_recovery.py"]
    files += [ROOT / "web" / name for name in ("index.html", "screen.js", "screen.css")]
    files += sorted((ROOT / "web/assets").rglob("*"))
    files += [ROOT / "systemd" / name for name in
              ("mox-display.service.in", "mox-html-events.service", "mox-html-events.timer",
               "tessavision-network-watchdog.service", "tessavision-network-watchdog.timer")]
    with tarfile.open(destination, "w:gz") as archive:
        for path in files:
            if path.is_symlink():
                raise ValueError(f"Refusing symlink: {path}")
            if path.is_file() and path.name != ".DS_Store":
                archive.add(path, arcname=str(path.relative_to(ROOT)), recursive=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", choices=["100.75.230.87", "100.114.127.4"])
    parser.add_argument("revision", help="Full Git commit SHA")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        parser.error("revision must be a full Git commit SHA")
    token = os.environ.pop("TVS_AIRTABLE_TOKEN", "").strip()
    if not token or any(c.isspace() for c in token):
        parser.error("TVS_AIRTABLE_TOKEN must contain a nonempty token without whitespace")
    target = f"mox@{args.host}"
    ssh = ["ssh", *SSH_OPTIONS, target]
    remote = subprocess.check_output(
        [*ssh, "mktemp -d /home/mox/.mox-upload-XXXXXXXX"], text=True
    ).strip()
    if not re.fullmatch(r"/home/mox/\.mox-upload-[A-Za-z0-9]+", remote):
        raise RuntimeError("Unexpected remote staging path")
    try:
        # Send the secret over SSH stdin, never in argv, the archive, or local files.
        credential = f"{remote}/airtable.token"
        subprocess.run([*ssh, f"umask 077; cat > {shlex.quote(credential)}"],
                       input=token + "\n", text=True, check=True)
        with tempfile.TemporaryDirectory(prefix="mox-tv-") as tmp:
            archive = Path(tmp) / "display.tar.gz"
            package(archive)
            subprocess.run(["scp", *SSH_OPTIONS, str(archive), f"{target}:{remote}/display.tar.gz"], check=True)
            command = shlex.join(["python3", "-", f"{remote}/display.tar.gz", args.revision, credential])
            subprocess.run([*ssh, command], input=(ROOT / "scripts/apply_release.py").read_text(),
                           text=True, check=True)
    finally:
        # Only the uniquely created upload directory is removed, never the deployed app.
        subprocess.run([*ssh, shlex.join(["rm", "-rf", "--", remote])], check=False)


if __name__ == "__main__":
    main()
