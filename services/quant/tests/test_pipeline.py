import contextlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pipeline', Path(__file__).resolve().parents[1] / 'pipeline.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / 'cec.sqlite'
        self.connection = sqlite3.connect(self.database)
        self.addCleanup(self.connection.close)
        self.connection.executescript('''PRAGMA journal_mode=WAL;
            CREATE TABLE outbox(id TEXT PRIMARY KEY, body TEXT, delivered INTEGER DEFAULT 0, error TEXT DEFAULT '');
            CREATE TABLE sessions(token TEXT); INSERT INTO sessions VALUES ('synthetic-session');
            CREATE TABLE email_tokens(used INTEGER); INSERT INTO email_tokens VALUES(0);
            CREATE TABLE email_jobs(status TEXT,payload TEXT,lease TEXT,lease_until INTEGER);
            INSERT INTO email_jobs VALUES('processing','encrypted','old-lease',100);
            CREATE TABLE tasks(id TEXT, note TEXT); INSERT INTO tasks VALUES ('task1','Durable submission');''')
        event = {'source':'native', 'external_id':'event1', 'fact_key':'task:member:task1',
                 'kind':'task', 'subject':'member', 'object_id':'task1',
                 'occurred_at':'2026-09-15T01:00:00Z', 'payload':{'status':'submitted', 'title':'Synthetic task', 'due_at':'2026-09-20T01:00:00Z'}, '_actor':'member'}
        self.connection.execute('INSERT INTO outbox(id,body) VALUES (?,?)', ('event1',json.dumps(event)))
        self.connection.commit()

    def test_failure_backoff_exhaustion_and_manual_recovery(self):
        with patch.dict('os.environ', {'CEC_QUANT_SCRIPT':str(self.root / 'missing.py')}):
            self.assertEqual(pipeline.deliver(self.database)['failed'], 1)
            self.assertEqual(pipeline.deliver(self.database)['failed'], 0)
            for _ in range(7):
                self.connection.execute('UPDATE pipeline_retry SET next_attempt=0')
                self.connection.commit()
                pipeline.deliver(self.database)
            self.assertEqual(pipeline.status(self.database)['exhausted'], 1)
        self.assertEqual(pipeline.deliver(self.database)['delivered'], 0)
        self.assertEqual(pipeline.deliver(self.database, force=True)['delivered'], 1)
        self.assertEqual(pipeline.status(self.database)['pending'], 0)

    def test_foreign_organization_never_reaches_analytics(self):
        event = json.loads(self.connection.execute('SELECT body FROM outbox').fetchone()[0])
        event['organization_id'] = 'other-club'
        self.connection.execute('UPDATE outbox SET body=?', (json.dumps(event),))
        self.connection.commit()
        self.assertEqual(pipeline.deliver(self.database)['failed'], 1)
        self.assertFalse((self.root / 'quant.sqlite').exists())

    def test_crash_replay_is_idempotent(self):
        pipeline.deliver(self.database)
        # Crash window: ingestion committed, source acknowledgement not committed.
        self.connection.execute('UPDATE outbox SET delivered=0')
        self.connection.commit()
        pipeline.deliver(self.database)
        with contextlib.closing(sqlite3.connect(self.root / 'quant.sqlite')) as quant:
            self.assertEqual(quant.execute('SELECT COUNT(*) FROM records').fetchone()[0], 1)

    def test_lock_released_after_owner_exits(self):
        with pipeline.lock(self.database):
            self.assertTrue(pipeline.deliver(self.database)['busy'])
        self.assertEqual(pipeline.deliver(self.database)['delivered'], 1)

    def test_wal_backup_restore_and_pending_replay(self):
        saved = Path(pipeline.backup(self.database, self.root / 'backups')['backup'])
        self.connection.execute("UPDATE tasks SET note='Newer data'")
        self.connection.commit()
        target = self.root / 'restored'
        pipeline.restore(saved, target)
        with contextlib.closing(sqlite3.connect(target / 'cec.sqlite')) as restored:
            self.assertEqual(restored.execute('SELECT note FROM tasks').fetchone()[0], 'Durable submission')
            self.assertEqual(restored.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 0)
            self.assertEqual(restored.execute('SELECT used FROM email_tokens').fetchone()[0], 1)
            self.assertEqual(restored.execute('SELECT status,payload,lease FROM email_jobs').fetchone(), ('cancelled', '', None))
        self.assertEqual(pipeline.deliver(target / 'cec.sqlite')['delivered'], 1)
        with self.assertRaises(ValueError):
            pipeline.restore(saved, target)
        (saved / 'cec.sqlite').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            pipeline.restore(saved, self.root / 'corrupt-restore')
        self.assertFalse((self.root / 'corrupt-restore').exists())

    def test_running_worker_delivers_and_schedules_backup(self):
        process = subprocess.Popen([sys.executable, pipeline.__file__, 'work',
            '--database', str(self.database), '--backups', str(self.root / 'scheduled')],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                backups = list((self.root / 'scheduled').glob('backup-*/manifest.json'))
                if backups and self.connection.execute('SELECT delivered FROM outbox').fetchone()[0]:
                    break
                time.sleep(0.1)
            else:
                self.fail('Worker did not deliver and back up without an HTTP request')
        finally:
            process.terminate()
            process.wait(timeout=5)
        self.assertEqual(process.returncode, 0)

    def test_paired_backup_preserves_acknowledgements(self):
        pipeline.deliver(self.database)
        saved = pipeline.backup(self.database, self.root / 'backups')['backup']
        pipeline.restore(saved, self.root / 'restored')
        self.assertEqual(pipeline.status(self.root / 'restored/cec.sqlite')['pending'], 0)
        with contextlib.closing(sqlite3.connect(self.root / 'restored/quant.sqlite')) as quant:
            self.assertEqual(quant.execute('SELECT COUNT(*) FROM records').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
