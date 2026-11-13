import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recovery', ROOT / 'scripts/configure_recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def test_rejects_missing_or_ambiguous_devices(self):
        for output in ('', 'wlan0\nwlan1', 'eth0', 'wlan1;reboot'):
            with self.assertRaises(RuntimeError):
                recovery.wifi_device(output)
        self.assertEqual(recovery.wifi_device('wlan1\nwlan1\n'), 'wlan1')

    def test_provisions_missing_watchdog_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            etc = Path(tmp)
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                if args[0] == 'nmcli':
                    return subprocess.CompletedProcess(args, 0, stdout='wlan1\nwlan1\n')
                if args[:3] == ['sudo', '-n', 'install']:
                    dest = Path(args[-1])
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_text(Path(args[-2]).read_text())
                return subprocess.CompletedProcess(args, 0)
            recovery.configure(ROOT, run=run, etc=etc, support=etc / 'support')
            config = etc / 'systemd/system/tessavision-network-watchdog.service.d/device.conf'
            self.assertIn('TESSAVISION_WIFI_DEVICE=wlan1', config.read_text())
            journal = (etc / 'systemd/journald.conf.d/zz-mox-tv.conf').read_text()
            self.assertIn('Storage=volatile', journal)
            self.assertIn('RuntimeMaxUse=16M', journal)
            self.assertIn('watchdog_monitor.py', config.read_text())
            self.assertFalse(any('--flush' in c for c in calls))
            self.assertIn(['sudo', '-n', 'systemctl', 'enable', '--now',
                           'tessavision-network-watchdog.timer'], calls)
            calls.clear()
            recovery.configure(ROOT, run=run, etc=etc, support=etc / 'support')
            self.assertFalse(any('install' in c or 'restart' in c or 'daemon-reload' in c for c in calls))
            self.assertFalse(any('NetworkManager' in c or 'reboot' in c for c in calls))

    def test_unknown_device_leaves_host_unchanged(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, stdout='')
        with self.assertRaises(RuntimeError):
            recovery.configure(ROOT, run=run)
        self.assertEqual(len(calls), 1)

    def test_activation_failure_is_retryable_but_monitor_failure_is_not(self):
        for code in ('4', '1'):
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                def run(args, **kwargs):
                    if args[0] == 'nmcli':
                        return subprocess.CompletedProcess(args, 0, stdout='wlan1\nwlan1\n')
                    if args[:3] == ['sudo', '-n', 'install']:
                        dest = Path(args[-1]); dest.parent.mkdir(parents=True, exist_ok=True)
                        dest.write_text(Path(args[-2]).read_text())
                    if 'start' in args:
                        return subprocess.CompletedProcess(args, 1)
                    return subprocess.CompletedProcess(args, 0, stdout=code)
                if code == '4':
                    recovery.configure(ROOT, run=run, etc=root, support=root / 'support')
                else:
                    with self.assertRaisesRegex(RuntimeError, 'Watchdog failed'):
                        recovery.configure(ROOT, run=run, etc=root, support=root / 'support')
