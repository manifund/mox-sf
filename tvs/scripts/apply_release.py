#!/usr/bin/env python3
"""Run as tessavision on an already-provisioned Pi. Retain a rollback copy."""
import datetime
import fcntl
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time

APP = Path('/home/tessavision/production')
KEY = APP / 'auth/airtable.com.txt'
REQUIRED = {'update_events.sh', 'web/index.html', 'web/screen.js', 'web/screen.css',
            'web/assets/mox-logo.svg', 'network_watchdog.sh'}


def unpack(archive, stage):
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        names = {member.name for member in members}
        if not REQUIRED <= names:
            raise ValueError('Incomplete display archive')
        for member in members:
            path = Path(member.name)
            allowed = member.name in REQUIRED or member.name.startswith('web/assets/')
            if not allowed or not member.isfile() or path.is_absolute() or '..' in path.parts:
                raise ValueError(f'Unexpected archive member: {member.name}')
        bundle.extractall(stage, filter='data')


def verify_display(since, run):
    # PAM puts Cog in a session scope, so -u mox-display misses its page-load logs.
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        run(['systemctl', 'is-active', '--quiet', 'mox-display.service'], check=True)
        result = run(['journalctl', '_COMM=cog', '--since', f'@{since}',
                      '--no-pager', '-o', 'cat'], check=True, capture_output=True, text=True)
        if 'Loaded successfully.' in result.stdout:
            return
        time.sleep(3)
    raise RuntimeError('Cog did not confirm a successful page load within 90 seconds')


def deploy(archive, revision, app=APP, key=KEY, run=subprocess.run, verify=verify_display):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected a full Git commit SHA')
    if not app.is_dir() or app.is_symlink() or not key.is_file():
        raise RuntimeError('Expected the existing provisioned app and local Airtable credential')
    for unit in ('mox-display.service', 'mox-html-events.timer'):
        run(['systemctl', 'is-enabled', '--quiet', unit], check=True)
        run(['systemctl', 'is-active', '--quiet', unit], check=True)
    stage = Path(tempfile.mkdtemp(prefix='.mox-stage-', dir=app.parent))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backups = app.parent / 'deploy-backups'
    backup = backups / f'html-{stamp}-{revision[:12]}'
    failed = backups / f'failed-html-{stamp}-{revision[:12]}'
    moved_old = False
    timer_stopped = False
    try:
        unpack(archive, stage)
        run(['bash', '-n', str(stage / 'update_events.sh')], check=True)
        # Stop writers before copying the last good cache or swapping directories.
        timer_stopped = True
        run(['sudo', '-n', 'systemctl', 'stop', 'mox-html-events.timer', 'mox-html-events.service'], check=True)
        cache = app / 'web/events.js'
        if cache.exists():
            shutil.copy2(cache, stage / 'web/events.js')
        # Credentials belong to the app now; preserve them across directory swaps.
        auth = stage / 'auth'
        auth.mkdir(mode=0o700)
        staged_key = auth / 'airtable.com.txt'
        shutil.copyfile(key, staged_key)
        staged_key.chmod(0o600)
        env = dict(os.environ, AIRTABLE_KEY_FILE=str(staged_key), MOX_EVENTS_OUT=str(stage / 'web/events.js'))
        run(['bash', str(stage / 'update_events.sh')], env=env, check=True, timeout=240)
        (stage / 'DEPLOYED_REVISION').write_text(revision + '\n')
        run(['sudo', '-n', 'systemctl', 'stop', 'mox-display.service'], check=True)
        backups.mkdir(mode=0o700, exist_ok=True)
        app.rename(backup)
        moved_old = True
        stage.rename(app)
        # Fractional timestamp excludes a previous load in the same second.
        since = f'{time.time():.6f}'
        run(['sudo', '-n', 'systemctl', 'start', 'mox-display.service'], check=True)
        verify(since, run)
        print(f'Deployed {revision}; rollback copy: {backup}', flush=True)
    except BaseException:
        if moved_old:
            run(['sudo', '-n', 'systemctl', 'stop', 'mox-display.service'], check=True)
            if app.exists():
                app.rename(failed)
            backup.rename(app)
            run(['sudo', '-n', 'systemctl', 'start', 'mox-display.service'], check=True)
            print(f'Restored previous display; failed release: {failed}', flush=True)
        else:
            # Also covers interruption just after stopping the old display.
            run(['sudo', '-n', 'systemctl', 'start', 'mox-display.service'], check=True)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if timer_stopped:
            run(['sudo', '-n', 'systemctl', 'start', 'mox-html-events.timer'], check=True)


def interrupted(signum, frame):
    raise RuntimeError(f'Deployment interrupted by signal {signum}')


if __name__ == '__main__':
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    with (APP.parent / '.mox-tv-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(Path(sys.argv[1]), sys.argv[2])
