#!/usr/bin/env python3
"""Keep routine watchdog output in journald (RAM); persist sparse transitions only."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

MAX_BYTES = 64 * 1024
MAX_RECORDS_PER_HOUR = 8


def record(status, device, state_path=Path('/run/mox-tv-watchdog/state.json'),
           log_path=Path('/var/log/mox-tv-recovery/events.log'), now=None):
    now = time.time() if now is None else now
    try:
        state = json.loads(state_path.read_text())
    except (FileNotFoundError, ValueError):
        state = {}
    previous = state.get('status', 'healthy')
    if status == previous:
        return
    recent = [stamp for stamp in state.get('writes', []) if now - stamp < 3600]
    if len(recent) < MAX_RECORDS_PER_HOUR:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        if log_path.exists() and log_path.stat().st_size >= MAX_BYTES:
            log_path.replace(log_path.with_suffix('.log.1'))
        event = 'recovered' if status == 'healthy' else status
        timestamp = datetime.datetime.fromtimestamp(now, datetime.timezone.utc).isoformat()
        with log_path.open('a') as output:
            output.write(f'{timestamp} {device}: {event}\n')
        recent.append(now)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({'status': status, 'writes': recent}))


def main():
    device = os.environ.get('TESSAVISION_WIFI_DEVICE', 'wlan0')
    def observe():
        result = subprocess.run(['nmcli', '-g', 'GENERAL.STATE', 'device', 'show', device],
                                capture_output=True, text=True)
        value = result.stdout.strip().split(' ', 1)[0]
        # Association/authentication/DHCP in progress are not failures.
        if value in ('40', '50', '60', '70', '80', '90'):
            return
        status = 'healthy' if value == '100' else 'disconnected' if value else 'unavailable'
        try:
            record(status, device)
        except OSError as error:
            # Logging must never prevent a reconnection attempt.
            print(f'Recovery log unavailable: {error}', file=sys.stderr)
    observe()
    result = subprocess.run(['bash', sys.argv[1]])
    observe()
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
