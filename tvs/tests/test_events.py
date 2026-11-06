"""Run the real updater/jq pipeline with a fixed clock and a fake HTTP endpoint."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

UPDATER = Path(__file__).resolve().parents[1] / 'update_events.sh'
NOW = datetime.datetime(2026, 11, 5, 20, tzinfo=datetime.timezone.utc)


def timestamp(hours):
    return (NOW + datetime.timedelta(hours=hours)).isoformat().replace('+00:00', 'Z')


class EventFeedTests(unittest.TestCase):
    def test_query_and_feed_keep_ongoing_multiday_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            def stub(name, source):
                path = bin_dir / name
                path.write_text(f'#!{sys.executable}\n' + source)
                path.chmod(0o755)

            stub('curl', '''import json, os, sys
from pathlib import Path
Path(os.environ['REQUEST_FILE']).write_text(json.dumps(sys.argv[1:]))
print(Path(os.environ['RESPONSE_FILE']).read_text())
''')
            stub('date', '''import sys
args = sys.argv[1:]
if args == ['+%s']:
    print(1793908800)  # 2026-11-05 20:00 UTC / noon Pacific
elif args == ['-d', 'tomorrow 00:00', '+%s']:
    print(1793952000)  # 2026-11-06 08:00 UTC / midnight Pacific
elif args == ['-u', '+%Y-%m-%dT%H:%M:%SZ']:
    print('2026-11-05T20:00:00Z')
else:
    raise SystemExit('Unexpected date arguments: ' + repr(args))
''')
            records = []
            for title, start, end in (
                ('Ongoing multi-day', -48, 3),
                ('Finished multi-day', -48, -1),
                ('Ends now', -48, 0),
                ('Upcoming today', 2, 4),
                ('Tomorrow', 13, 14),
                ('Missing end ongoing', -1, None),
                ('Missing end expired', -3, None),
                ('Missing end old', -48, None),
            ):
                fields = {'Name': title, 'Start Date': timestamp(start),
                          'Floor Rollup (from Assigned Rooms)': ['Floor 3']}
                if end is not None:
                    fields['End Date'] = timestamp(end)
                records.append({'fields': fields})
            response = root / 'response.json'
            response.write_text(json.dumps({'records': records}))
            request = root / 'request.json'
            key = root / 'key'
            key.write_text('test-only-token')
            output = root / 'events.js'
            env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'],
                       REQUEST_FILE=str(request), RESPONSE_FILE=str(response),
                       AIRTABLE_KEY_FILE=str(key), MOX_EVENTS_OUT=str(output))
            subprocess.run(['bash', str(UPDATER)], env=env, check=True, capture_output=True)

            # Check the actual API request as well as the local filter: otherwise
            # returning fixtures would hide the original server-side exclusion.
            args = json.loads(request.read_text())
            formula = next(arg.split('=', 1)[1] for arg in args if arg.startswith('filterByFormula='))
            formula = ' '.join(formula.split())
            self.assertIn("IS_AFTER(IF({End Date}, {End Date}, DATEADD({Start Date}, 2, 'hours')), NOW())", formula)
            self.assertNotIn('IS_AFTER({Start Date}', formula)
            self.assertIn("IS_BEFORE({Start Date}, DATEADD(NOW(), 1, 'days'))", formula)
            for status in ('Idea', 'Maybe', 'Cancelled', 'Declined'):
                self.assertIn("{Status} = '" + status + "'", formula)

            data = output.read_text().split('window.MOX_EVENTS = ', 1)[1].rstrip().removesuffix(';')
            events = json.loads(data)
            self.assertEqual([event['title'] for event in events],
                             ['Ongoing multi-day', 'Missing end ongoing', 'Upcoming today'])
            self.assertTrue(all(event['floor'] == 3 for event in events))


if __name__ == '__main__':
    unittest.main()
