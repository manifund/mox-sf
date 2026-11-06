#!/usr/bin/env python3
"""One-time migration from the existing HTML app to ~/production, run on a Pi.

Place this script beside apply_release.py, then run:
  python3 migrate_pi.py display.tar.gz 1   # or 3
The old app and token remain available for recovery. No secrets leave the Pi.
"""
import argparse
import datetime
import fcntl
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

from apply_release import APP, interrupted, unpack, verify_display

OLD = Path('/home/tessavision/moxscreens-htmldesign')
OLD_KEY = Path('/home/tessavision/tessavision/auth/airtable.com.txt')
UNITS = Path('/etc/systemd/system')


def run(args, **kwargs):
    kwargs.setdefault('check', True)
    return subprocess.run(args, **kwargs)


def systemctl(*args):
    return run(['sudo', '-n', 'systemctl', *args])


def state(verb, unit):
    return subprocess.run(['systemctl', verb, '--quiet', unit]).returncode == 0


def migrate(archive, floor):
    if APP.exists() or APP.is_symlink():
        raise RuntimeError(f'{APP} already exists; refusing to overwrite it')
    if not OLD.is_dir() or not OLD_KEY.is_file():
        raise RuntimeError('Expected the original HTML app and its local credential')
    display_unit = UNITS / 'mox-display.service'
    if f'?floor={floor}' not in display_unit.read_text():
        raise RuntimeError('Requested floor does not match the existing display service')
    for unit in ('mox-display.service', 'mox-html-events.timer'):
        if not state('is-active', unit) or not state('is-enabled', unit):
            raise RuntimeError(f'{unit} must be active and enabled before migration')
    names = ['mox-display.service', 'mox-html-events.service', 'mox-html-events.timer']
    watchdog = UNITS / 'tessavision-network-watchdog.service'
    if watchdog.exists():
        names.append(watchdog.name)
    originals = {name: (UNITS / name).read_text() for name in names}
    legacy = ['tessavision-events.timer', 'tessavision-ticker.timer',
              'tessavision-display-rollback.timer', 'tessavision-renderer-fallback.timer',
              'tessavision-events.service', 'tessavision-ticker.service',
              'tessavision-display.service']
    legacy = [name for name in legacy if (UNITS / name).exists()]
    prior = {name: (state('is-enabled', name), state('is-active', name)) for name in legacy}
    watchdog_timer = 'tessavision-network-watchdog.timer'
    watchdog_active = watchdog.exists() and state('is-active', watchdog_timer)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = APP.parent / 'deploy-backups' / f'production-migration-{stamp}'
    backup.mkdir(parents=True, mode=0o700)
    for name, content in originals.items():
        (backup / name).write_text(content)
    stage = Path(tempfile.mkdtemp(prefix='.production-stage-', dir=APP.parent))
    changing = False
    try:
        unpack(archive, stage)
        (stage / 'auth').mkdir(mode=0o700)
        shutil.copyfile(OLD_KEY, stage / 'auth/airtable.com.txt')
        (stage / 'auth/airtable.com.txt').chmod(0o600)
        # Validate API access before stopping the working screen or its timer.
        run(['bash', str(stage / 'update_events.sh')], timeout=240)
        changing = True
        systemctl('stop', 'mox-html-events.timer', 'mox-html-events.service', 'mox-display.service')
        if watchdog_active:
            systemctl('stop', watchdog_timer, 'tessavision-network-watchdog.service')
        for name in legacy:
            if prior[name][0] or name.endswith('.timer'):
                systemctl('disable', '--now', name)
            else:
                systemctl('stop', name)
        stage.rename(APP)
        for name, content in originals.items():
            updated = content.replace(str(OLD), str(APP)).replace(str(OLD_KEY), str(APP / 'auth/airtable.com.txt'))
            updated = updated.replace('/home/tessavision/tessavision/network_watchdog.sh', str(APP / 'network_watchdog.sh'))
            source = backup / (name + '.new')
            source.write_text(updated)
            run(['sudo', '-n', 'install', '-m', '644', str(source), str(UNITS / name)])
        systemctl('daemon-reload')
        systemctl('start', 'mox-html-events.service')
        since = f'{time.time():.6f}'
        systemctl('start', 'mox-display.service')
        verify_display(since, run)
        systemctl('start', 'mox-html-events.timer')
        if watchdog_active:
            systemctl('start', watchdog_timer)
        print(f'Migrated floor {floor} to {APP}; original units saved in {backup}', flush=True)
    except BaseException:
        if changing:
            systemctl('stop', 'mox-display.service', 'mox-html-events.timer', 'mox-html-events.service')
            for name in originals:
                run(['sudo', '-n', 'install', '-m', '644', str(backup / name), str(UNITS / name)])
            systemctl('daemon-reload')
            if APP.exists():
                APP.rename(backup / 'failed-production')
            for name, (enabled, active) in prior.items():
                if enabled:
                    systemctl('enable', name)
                if active:
                    systemctl('start', name)
            systemctl('start', 'mox-display.service', 'mox-html-events.timer')
            if watchdog_active:
                systemctl('start', watchdog_timer)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('floor', choices=['1', '3'])
    args = parser.parse_args()
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    with (APP.parent / '.mox-tv-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        migrate(args.archive, args.floor)
