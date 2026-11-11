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
            recovery.configure(ROOT, run=run, etc=etc)
            config = etc / 'systemd/system/tessavision-network-watchdog.service.d/device.conf'
            self.assertIn('TESSAVISION_WIFI_DEVICE=wlan1', config.read_text())
            journal = (etc / 'systemd/journald.conf.d/mox-tv.conf').read_text()
            self.assertIn('Storage=persistent', journal)
            self.assertIn('SystemMaxUse=100M', journal)
            self.assertIn(['sudo', '-n', 'systemctl', 'enable', '--now',
                           'tessavision-network-watchdog.timer'], calls)
            calls.clear()
            recovery.configure(ROOT, run=run, etc=etc)
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
