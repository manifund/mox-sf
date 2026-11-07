import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'


def module(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


apply = module('apply_release')
upload = module('deploy')
REVISION = 'a' * 40


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.app = self.home / 'production'
        (self.app / 'web').mkdir(parents=True)
        (self.app / 'web/index.html').write_text('old display')
        (self.app / 'web/events.js').write_text('last good live events')
        (self.app / 'auth').mkdir(mode=0o700)
        self.key = self.app / 'auth/airtable.com.txt'
        self.key.write_text('test-only-placeholder')
        self.uploaded_key = self.home / 'uploaded.token'
        self.uploaded_key.write_text('new-test-token')
        self.archive = self.home / 'display.tar.gz'
        upload.package(self.archive)
        self.calls = []
        self.fail_fetch = False
        self.fail_install = False
        self.fail_validation = False
        self.fail_command = None
        self.units = self.home / 'units'
        self.units.mkdir()
        for name in apply.MANAGED_UNITS:
            source = name + '.in' if name == 'mox-display.service' else name
            content = (SCRIPTS.parent / 'systemd' / source).read_text()
            content = content.replace('@FLOOR@', '3').replace('@UID@', '1234')
            (self.units / name).write_text(content + '# previous unit\n')
        self.original_units = {name: (self.units / name).read_text() for name in apply.MANAGED_UNITS}

    def run_command(self, args, **kwargs):
        self.calls.append(args)
        if args == self.fail_command:
            self.fail_command = None
            raise subprocess.CalledProcessError(1, args)
        if 'systemd-analyze' in args and self.fail_validation:
            raise subprocess.CalledProcessError(1, args)
        if args[:3] == ['sudo', '-n', 'install']:
            if self.fail_install and args[-1].endswith('mox-html-events.service'):
                self.fail_install = False
                raise subprocess.CalledProcessError(1, args)
            Path(args[-1]).write_text(Path(args[-2]).read_text())
        if args[:2] == ['bash', '-n']:
            return subprocess.run(args, **kwargs)
        if args[0] == 'bash':
            if self.fail_fetch:
                raise subprocess.CalledProcessError(22, args)
            staged_key = Path(kwargs['env']['AIRTABLE_KEY_FILE'])
            self.assertEqual(staged_key.read_text(), 'new-test-token')
            self.assertNotEqual(staged_key, self.key)
            Path(kwargs['env']['MOX_EVENTS_OUT']).write_text('fresh live events')
        return subprocess.CompletedProcess(args, 0, stdout='')

    def deploy(self, verify=lambda since, run: None):
        apply.deploy(self.archive, REVISION, self.app, self.uploaded_key, self.run_command, verify, units=self.units, uid=1234)

    def test_package_excludes_runtime_data_and_credentials(self):
        with tarfile.open(self.archive) as archive:
            names = archive.getnames()
        self.assertNotIn('web/events.js', names)
        self.assertTrue(apply.REQUIRED <= set(names))
        self.assertFalse(any('auth/' in name or 'backup' in name for name in names))

    def test_success_preserves_backup_and_writes_revision(self):
        self.deploy()
        self.assertEqual((self.app / 'web/events.js').read_text(), 'fresh live events')
        self.assertEqual((self.app / 'DEPLOYED_REVISION').read_text(), REVISION + '\n')
        backups = list((self.home / 'deploy-backups').glob('html-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'web/index.html').read_text(), 'old display')
        self.assertEqual(self.key.read_text(), 'new-test-token')
        self.assertEqual(self.key.stat().st_mode & 0o777, 0o600)
        self.assertEqual((backups[0] / 'auth/airtable.com.txt').read_text(), 'test-only-placeholder')
        self.assertIn(['sudo', '-n', 'systemctl', 'daemon-reload'], self.calls)
        display = (self.units / 'mox-display.service').read_text()
        self.assertIn('?floor=3', display)
        self.assertIn('/run/user/1234', display)
        self.assertNotIn('# previous unit', display)

    def test_api_failure_leaves_previous_display_and_resumes_timer(self):
        self.fail_fetch = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertEqual((self.app / 'web/events.js').read_text(), 'last good live events')
        self.assertEqual((self.app / 'web/index.html').read_text(), 'old display')
        self.assertNotIn(['sudo', '-n', 'systemctl', 'stop', 'mox-display.service'], self.calls)
        self.assertEqual(self.calls[-1][-2:], ['start', 'mox-html-events.timer'])

    def test_page_load_failure_rolls_back(self):
        def failed(since, run):
            raise RuntimeError('renderer crashed')
        with self.assertRaisesRegex(RuntimeError, 'renderer crashed'):
            self.deploy(failed)
        self.assertEqual((self.app / 'web/index.html').read_text(), 'old display')
        self.assertEqual((self.app / 'web/events.js').read_text(), 'last good live events')
        self.assertFalse((self.app / 'DEPLOYED_REVISION').exists())
        self.assertEqual(self.key.read_text(), 'test-only-placeholder')
        self.assertEqual(len(list((self.home / 'deploy-backups').glob('failed-html-*'))), 1)
        self.assertEqual({name: (self.units / name).read_text() for name in apply.MANAGED_UNITS},
                         self.original_units)
        self.assertEqual(self.calls[-1][-2:], ['start', 'mox-html-events.timer'])

    def test_rejects_path_traversal_before_stopping_display(self):
        with tarfile.open(self.archive, 'w:gz') as bundle:
            for name in sorted(apply.REQUIRED | {'web/assets/../../escape'}):
                member = tarfile.TarInfo(name)
                member.size = 1
                bundle.addfile(member, io.BytesIO(b'x'))
        with self.assertRaisesRegex(ValueError, 'Unexpected archive member'):
            self.deploy()
        self.assertEqual((self.app / 'web/index.html').read_text(), 'old display')
        self.assertFalse(any('stop' in args for args in self.calls))

    def test_partial_unit_install_restores_all_units_and_app(self):
        self.fail_install = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertEqual((self.app / 'web/index.html').read_text(), 'old display')
        self.assertEqual({name: (self.units / name).read_text() for name in apply.MANAGED_UNITS},
                         self.original_units)

    def assert_command_failure_rolls_back(self, command):
        self.fail_command = ['sudo', '-n', 'systemctl', *command]
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertEqual((self.app / 'web/index.html').read_text(), 'old display')
        self.assertEqual({name: (self.units / name).read_text() for name in apply.MANAGED_UNITS},
                         self.original_units)
        self.assertEqual(self.calls[-1][-2:], ['start', 'mox-html-events.timer'])

    def test_reload_failure_rolls_back(self):
        self.assert_command_failure_rolls_back(['daemon-reload'])

    def test_event_service_failure_rolls_back(self):
        self.assert_command_failure_rolls_back(['start', 'mox-html-events.service'])

    def test_timer_start_failure_rolls_back(self):
        self.assert_command_failure_rolls_back(['start', 'mox-html-events.timer'])

    def test_invalid_units_abort_before_stopping_services(self):
        self.fail_validation = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.deploy()
        self.assertFalse(any('stop' in args for args in self.calls))

    def test_unchanged_units_do_not_reload_systemd(self):
        for name in apply.MANAGED_UNITS:
            (self.units / name).write_text(self.original_units[name].replace('# previous unit\n', ''))
        self.deploy()
        self.assertFalse(any('daemon-reload' in args or 'install' in args for args in self.calls))

    def test_unknown_floor_aborts_before_stopping_services(self):
        (self.units / 'mox-display.service').write_text('no floor configured')
        with self.assertRaisesRegex(RuntimeError, 'display floor'):
            self.deploy()
        self.assertFalse(any('stop' in args for args in self.calls))

    def test_missing_uploaded_credential_aborts_without_service_changes(self):
        self.uploaded_key.unlink()
        with self.assertRaisesRegex(RuntimeError, 'uploaded Airtable credential'):
            self.deploy()
        self.assertEqual(self.calls, [])
        self.assertEqual(self.key.read_text(), 'test-only-placeholder')

    def test_runner_requires_secret_before_connecting(self):
        with patch.dict('os.environ', {}, clear=True), patch('sys.argv',
                ['deploy.py', '100.75.230.87', REVISION]), \
                patch.object(upload.subprocess, 'check_output') as ssh, \
                patch('sys.stderr', new_callable=io.StringIO):
            with self.assertRaises(SystemExit):
                upload.main()
            ssh.assert_not_called()

    def test_runner_transfers_secret_only_via_stdin_and_cleans_up(self):
        remote = '/home/mox/.mox-upload-test123'
        with patch.dict('os.environ', {'TVS_AIRTABLE_TOKEN': 'new-test-token'}), \
                patch('sys.argv', ['deploy.py', '100.75.230.87', REVISION]), \
                patch.object(upload.subprocess, 'check_output', return_value=remote), \
                patch.object(upload.subprocess, 'run') as run:
            upload.main()
            calls = run.call_args_list
            self.assertEqual(calls[0].kwargs['input'], 'new-test-token\n')
            for call in calls:
                self.assertNotIn('new-test-token', ' '.join(call.args[0]))
            self.assertIn(remote + '/airtable.token', calls[2].args[0][-1])
            self.assertIn('rm -rf', calls[-1].args[0][-1])

    def test_rejects_invalid_revision(self):
        with self.assertRaisesRegex(ValueError, 'full Git commit'):
            apply.deploy(self.archive, 'main; anything', self.app, self.key, self.run_command)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
