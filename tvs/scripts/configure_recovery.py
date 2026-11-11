#!/usr/bin/env python3
"""Idempotent host provisioning; intentionally survives display rollback."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def wifi_device(output):
    devices = set(output.strip().splitlines()) - {''}
    if len(devices) != 1 or not re.fullmatch(r'wlan[0-9]+', next(iter(devices))):
        raise RuntimeError('Cannot identify one Wi-Fi interface for Mox-dongle')
    return devices.pop()


def configure(source, run=subprocess.run, etc=Path('/etc')):
    result = run(['nmcli', '-g', 'connection.interface-name,GENERAL.DEVICES',
                  'connection', 'show', 'Mox-dongle'],
                 check=True, capture_output=True, text=True)
    device = wifi_device(result.stdout)
    units = etc / 'systemd/system'
    files = {
        units / name: (source / 'systemd' / name).read_text()
        for name in ('tessavision-network-watchdog.service', 'tessavision-network-watchdog.timer')
    }
    files[units / 'tessavision-network-watchdog.service.d/device.conf'] = (
        f'[Service]\nEnvironment=TESSAVISION_WIFI_DEVICE={device}\n'
        'Environment=TESSAVISION_WIFI_CONNECTION=Mox-dongle\n')
    journal = etc / 'systemd/journald.conf.d/mox-tv.conf'
    files[journal] = ('[Journal]\nStorage=persistent\nSystemMaxUse=100M\n'
                      'SystemKeepFree=500M\nMaxRetentionSec=14day\n')
    changed = []
    with tempfile.TemporaryDirectory(prefix='mox-recovery-') as temporary:
        for index, (destination, content) in enumerate(files.items()):
            if destination.exists() and destination.read_text() == content:
                continue
            staged = Path(temporary) / str(index)
            staged.write_text(content)
            run(['sudo', '-n', 'install', '-D', '-m', '644', str(staged), str(destination)], check=True)
            changed.append(destination)
    if any(path != journal for path in changed):
        run(['sudo', '-n', 'systemctl', 'daemon-reload'], check=True)
    if journal in changed:
        run(['sudo', '-n', 'systemctl', 'restart', 'systemd-journald'], check=True)
    run(['sudo', '-n', 'journalctl', '--flush'], check=True)
    timer = 'tessavision-network-watchdog.timer'
    run(['sudo', '-n', 'systemctl', 'enable', '--now', timer], check=True)
    run(['sudo', '-n', 'systemctl', 'start', 'tessavision-network-watchdog.service'], check=True)
    run(['systemctl', 'is-enabled', '--quiet', timer], check=True)
    run(['systemctl', 'is-active', '--quiet', timer], check=True)
    print(f'Wi-Fi recovery enabled on {device}; persistent journal capped at 100 MB / 14 days')


if __name__ == '__main__':
    configure(Path(sys.argv[1]))
