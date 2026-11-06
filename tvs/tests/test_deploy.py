import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

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
        self.archive = self.home / 'display.tar.gz'
        upload.package(self.archive)
        self.calls = []
        self.fail_fetch = False

    def run_command(self, args, **kwargs):
        self.calls.append(args)
        if args[:2] == ['bash', '-n']:
            return subprocess.run(args, **kwargs)
        if args[0] == 'bash':
            if self.fail_fetch:
                raise subprocess.CalledProcessError(22, args)
            staged_key = Path(kwargs['env']['AIRTABLE_KEY_FILE'])
            self.assertEqual(staged_key.read_text(), 'test-only-placeholder')
            self.assertNotEqual(staged_key, self.key)
            Path(kwargs['env']['MOX_EVENTS_OUT']).write_text('fresh live events')
        return subprocess.CompletedProcess(args, 0, stdout='')

    def deploy(self, verify=lambda since, run: None):
        apply.deploy(self.archive, REVISION, self.app, self.key, self.run_command, verify)

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
        self.assertEqual(self.key.read_text(), 'test-only-placeholder')
        self.assertEqual(self.key.stat().st_mode & 0o777, 0o600)
        self.assertEqual((backups[0] / 'auth/airtable.com.txt').read_text(), 'test-only-placeholder')
        self.assertEqual(self.calls[-1][-2:], ['start', 'mox-html-events.timer'])

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

    def test_rejects_invalid_revision(self):
        with self.assertRaisesRegex(ValueError, 'full Git commit'):
            apply.deploy(self.archive, 'main; anything', self.app, self.key, self.run_command)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
