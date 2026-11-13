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


def configure(source, run=subprocess.run, etc=Path('/etc'),
              support=Path('/usr/local/lib/mox-tv')):
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
        'Environment=TESSAVISION_WIFI_CONNECTION=Mox-dongle\n'
        'ExecStart=\n'
        f'ExecStart=/usr/bin/python3 {support}/watchdog_monitor.py '
        '/home/mox/production/network_watchdog.sh\n')
    # Keep the monitor outside app rollback directories so recovery survives rollback.
    files[support / 'watchdog_monitor.py'] = (source / 'scripts/watchdog_monitor.py').read_text()
    journal = etc / 'systemd/journald.conf.d/zz-mox-tv.conf'
    files[journal] = ('[Journal]\nStorage=volatile\nRuntimeMaxUse=16M\n'
                      'ForwardToSyslog=no\n')
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
    timer = 'tessavision-network-watchdog.timer'
    run(['sudo', '-n', 'systemctl', 'enable', '--now', timer], check=True)
    started = run(['sudo', '-n', 'systemctl', 'start', 'tessavision-network-watchdog.service'], check=False)
    if started.returncode:
        status = run(['systemctl', 'show', 'tessavision-network-watchdog.service',
                      '-p', 'ExecMainStatus', '--value'], check=True, capture_output=True, text=True)
        # nmcli exit 4 means activation failed (e.g. AP unavailable). The timer
        # must keep retrying; this is not a broken logging installation.
        if status.stdout.strip() != '4':
            raise RuntimeError('Watchdog failed with exit status ' + status.stdout.strip())
        print('Wi-Fi activation failed; watchdog timer will continue retrying')
    run(['systemctl', 'is-enabled', '--quiet', timer], check=True)
    run(['systemctl', 'is-active', '--quiet', timer], check=True)
    print(f'Wi-Fi recovery enabled on {device}; routine journal in RAM; bounded Wi-Fi failure/recovery records on disk')


if __name__ == '__main__':
    configure(Path(sys.argv[1]))
