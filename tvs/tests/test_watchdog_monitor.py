import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).resolve().parents[1] / 'scripts/watchdog_monitor.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTests(unittest.TestCase):
    def test_healthy_checks_and_repeated_failure_do_not_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            state, log = Path(tmp) / 'ram/state', Path(tmp) / 'disk/events.log'
            monitor.record('healthy', 'wlan1', state, log, now=1)
            self.assertFalse(log.exists())
            self.assertFalse(state.exists())
            monitor.record('disconnected', 'wlan1', state, log, now=2)
            stamp = log.stat().st_mtime_ns
            for now in range(3, 200):
                monitor.record('disconnected', 'wlan1', state, log, now=now)
            self.assertEqual(log.stat().st_mtime_ns, stamp)
            monitor.record('healthy', 'wlan1', state, log, now=200)
            self.assertEqual(len(log.read_text().splitlines()), 2)
            self.assertIn('recovered', log.read_text())

    def test_flapping_is_rate_limited_and_log_rotates(self):
        with tempfile.TemporaryDirectory() as tmp:
            state, log = Path(tmp) / 'state', Path(tmp) / 'events.log'
            for now in range(20):
                monitor.record('disconnected' if now % 2 == 0 else 'healthy', 'wlan1', state, log, now=now)
            self.assertEqual(len(log.read_text().splitlines()), 8)
            log.write_text('x' * monitor.MAX_BYTES)
            monitor.record('disconnected', 'wlan1', state, log, now=4000)
            self.assertEqual(log.with_suffix('.log.1').stat().st_size, monitor.MAX_BYTES)
            self.assertLess(log.stat().st_size, 150)
