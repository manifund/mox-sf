#!/usr/bin/env python3
"""Run with sudo on an existing TV; migrate its display and access to mox.

Keep beside apply_release.py. Existing tessavision access stays available.
Secrets are copied locally only. Failed display migrations restore old paths.
"""
import datetime
import fcntl
import grp
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import time

from apply_release import verify_display

OLD = Path('/home/tessavision')
NEW = Path('/home/mox')
UNITS = Path('/etc/systemd/system')


def run(args, **kwargs):
    kwargs.setdefault('check', True)
    return subprocess.run(args, **kwargs)


def systemctl(*args):
    return run(['systemctl', *args])


def own(path, uid, gid):
    os.chown(path, uid, gid)
    for root, dirs, files in os.walk(path):
        for name in dirs + files:
            os.chown(Path(root) / name, uid, gid, follow_symlinks=False)


def migrate():
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo')
    old = pwd.getpwnam('tessavision')
    try:
        pwd.getpwnam('mox')
    except KeyError:
        pass
    else:
        raise RuntimeError('mox already exists; inspect before retrying')
    if NEW.exists() or not (OLD / 'production/auth/airtable.com.txt').is_file():
        raise RuntimeError('Unexpected home/app state')
    for unit in ('mox-display.service', 'mox-html-events.timer'):
        systemctl('is-active', '--quiet', unit)
        systemctl('is-enabled', '--quiet', unit)
    groups = [grp.getgrgid(g).gr_name for g in os.getgrouplist(old.pw_name, old.pw_gid)
              if g != old.pw_gid]
    run(['useradd', '--create-home', '--shell', old.pw_shell,
         '--groups', ','.join(groups), 'mox'])
    new = pwd.getpwnam('mox')
    NEW.chmod(0o700)
    # Preserve password authentication without exposing the hash in argv or logs.
    shadow = next(line.split(':') for line in Path('/etc/shadow').read_text().splitlines()
                  if line.startswith('tessavision:'))
    run(['chpasswd', '--encrypted'], input=f'mox:{shadow[1]}\n', text=True)
    ssh = NEW / '.ssh'
    ssh.mkdir(mode=0o700)
    for name in ('authorized_keys', 'authorized_keys2'):
        source = OLD / '.ssh' / name
        if source.exists():
            shutil.copy2(source, ssh / name)
            (ssh / name).chmod(0o600)
    own(ssh, new.pw_uid, new.pw_gid)
    sudo = Path('/etc/sudoers.d/90-mox')
    sudo.write_text('mox ALL=(ALL:ALL) NOPASSWD: ALL\n')
    sudo.chmod(0o440)
    run(['visudo', '-cf', str(sudo)])
    names = ['mox-display.service', 'mox-html-events.service']
    watchdog = UNITS / 'tessavision-network-watchdog.service'
    if watchdog.exists():
        names.append(watchdog.name)
    originals = {name: (UNITS / name).read_text() for name in names}
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = NEW / 'account-migration' / stamp
    backup.mkdir(parents=True, mode=0o700)
    for name, content in originals.items():
        (backup / name).write_text(content)
    watchdog_timer = 'tessavision-network-watchdog.timer'
    watchdog_active = watchdog.exists() and subprocess.run(
        ['systemctl', 'is-active', '--quiet', watchdog_timer]).returncode == 0
    moved = []
    try:
        systemctl('stop', 'mox-html-events.timer', 'mox-html-events.service', 'mox-display.service')
        if watchdog_active:
            systemctl('stop', watchdog_timer, watchdog.name)
        for name in ('production', 'deploy-backups'):
            if (OLD / name).exists():
                (OLD / name).rename(NEW / name)
                moved.append(name)
                own(NEW / name, new.pw_uid, new.pw_gid)
        for name, content in originals.items():
            content = content.replace(str(OLD), str(NEW)).replace('User=tessavision', 'User=mox')
            content = content.replace(f'/run/user/{old.pw_uid}', f'/run/user/{new.pw_uid}')
            (UNITS / name).write_text(content)
        systemctl('daemon-reload')
        systemctl('start', 'mox-html-events.service')
        since = f'{time.time():.6f}'
        systemctl('start', 'mox-display.service')
        verify_display(since, run)
        systemctl('start', 'mox-html-events.timer')
        if watchdog_active:
            systemctl('start', watchdog_timer)
    except BaseException:
        systemctl('stop', 'mox-display.service', 'mox-html-events.timer', 'mox-html-events.service')
        for name, content in originals.items():
            (UNITS / name).write_text(content)
        for name in reversed(moved):
            (NEW / name).rename(OLD / name)
            own(OLD / name, old.pw_uid, old.pw_gid)
        systemctl('daemon-reload')
        systemctl('start', 'mox-display.service', 'mox-html-events.timer')
        if watchdog_active:
            systemctl('start', watchdog_timer)
        raise
    print(f'Migrated to {NEW}/production, UID {new.pw_uid}; unit backup: {backup}')


if __name__ == '__main__':
    with (OLD / '.mox-tv-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        migrate()
