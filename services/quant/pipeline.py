"""Single-host outbox worker and SQLite recovery tools. No network credentials needed."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

MAX_ATTEMPTS = 8


def connect(path):
    connection = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=rw', uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


def init(connection):
    connection.execute('''CREATE TABLE IF NOT EXISTS pipeline_retry (
        id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, next_attempt REAL NOT NULL)''')
    connection.execute('''CREATE TABLE IF NOT EXISTS pipeline_status (
        key TEXT PRIMARY KEY, value TEXT NOT NULL)''')
    connection.commit()


@contextlib.contextmanager
def lock(database):
    # OS releases this on crash. Web flushes and workers share the same lock.
    with open(str(database) + '.pipeline.lock', 'a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield handle
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def mark(connection, key, value):
    connection.execute('INSERT OR REPLACE INTO pipeline_status VALUES (?,?)', (key, str(value)))
    connection.commit()


def deliver(database, force=False):
    with lock(database) as owned:
        if not owned:
            return {'busy': True}
        with contextlib.closing(connect(database)) as connection:
            init(connection)
            if force:
                connection.execute('DELETE FROM pipeline_retry')
                connection.commit()
            rows = connection.execute('''SELECT o.*, COALESCE(r.attempts,0) attempts, COALESCE(r.next_attempt,0) next_attempt
                FROM outbox o LEFT JOIN pipeline_retry r ON r.id=o.id
                WHERE delivered=0 ORDER BY o.rowid LIMIT 100''').fetchall()
            delivered = failed = 0
            deadline = time.monotonic() + 5
            for row in rows:
                if time.monotonic() >= deadline:
                    break
                if row['attempts'] >= MAX_ATTEMPTS or row['next_attempt'] > time.time():
                    break
                attempts = row['attempts'] + 1
                # Persist before starting: repeated crashes also consume a retry budget.
                delay = min(3600, 5 * 2 ** (attempts - 1))
                connection.execute('INSERT OR REPLACE INTO pipeline_retry VALUES (?,?,?)',
                                   (row['id'], attempts, time.time() + delay))
                connection.commit()
                try:
                    event = json.loads(row['body'])
                    if event.pop('organization_id', 'cornell-ec') != 'cornell-ec':
                        raise ValueError('Outbox organization mismatch')
                    result = subprocess.run([sys.executable, os.environ.get('CEC_QUANT_SCRIPT',
                        str(Path(__file__).with_name('bridge.py')))],
                        input=json.dumps({'action': 'ingest', 'event': event}),
                        text=True, capture_output=True, timeout=15, pass_fds=(owned.fileno(),),
                        env={**os.environ, 'CEC_QUANT_DATABASE': str(Path(database).parent / 'quant.sqlite')})
                    if result.returncode:
                        raise RuntimeError('ingest failed')
                    json.loads(result.stdout)
                    connection.execute("UPDATE outbox SET delivered=1,error='' WHERE id=?", (row['id'],))
                    connection.execute('DELETE FROM pipeline_retry WHERE id=?', (row['id'],))
                    connection.commit()
                    delivered += 1
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
                    connection.execute('UPDATE outbox SET error=? WHERE id=?',
                        ('Delivery failed; manual retry required' if attempts >= MAX_ATTEMPTS else
                         'Delivery failed; automatic retry scheduled', row['id']))
                    connection.commit()
                    failed += 1
                    break
            mark(connection, 'last_delivery_scan', time.time())
            return {'delivered': delivered, 'failed': failed}


def digest(path):
    with open(path, 'rb') as handle:
        checksum = hashlib.sha256()
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            checksum.update(block)
        return checksum.hexdigest()


def snapshot(source, target):
    with contextlib.closing(connect(source)) as src, contextlib.closing(sqlite3.connect(target)) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')


def backup(database, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    with lock(database) as owned:
        if not owned:
            return {'busy': True}
        staging = Path(tempfile.mkdtemp(prefix='.incomplete-', dir=destination))
        try:
            files = {}
            # Ingestion is locked across both snapshots. Pending events can safely replay.
            for source, name in [(Path(database), 'cec.sqlite'), (Path(database).parent / 'quant.sqlite', 'quant.sqlite')]:
                if name == 'quant.sqlite' and not source.exists():
                    with contextlib.closing(connect(database)) as connection:
                        if connection.execute('SELECT COUNT(*) FROM outbox WHERE delivered=1').fetchone()[0]:
                            raise RuntimeError('Analytics database missing for delivered records')
                    continue
                snapshot(source, staging / name)
                os.chmod(staging / name, 0o600)
                files[name] = digest(staging / name)
            manifest = {'version': 1, 'created_at': time.time(), 'files': files}
            (staging / 'manifest.json').write_text(json.dumps(manifest))
            for file in staging.iterdir():
                with open(file, 'rb') as handle:
                    os.fsync(handle.fileno())
            target = destination / f'backup-{time.time_ns()}'
            staging.rename(target)
            with contextlib.closing(connect(database)) as connection:
                init(connection)
                mark(connection, 'last_backup', manifest['created_at'])
            return {'backup': str(target)}
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise


def restore(source, destination):
    source, destination = Path(source), Path(destination)
    manifest = json.loads((source / 'manifest.json').read_text())
    files = manifest['files']
    if manifest['version'] != 1 or 'cec.sqlite' not in files or set(files) - {'cec.sqlite', 'quant.sqlite'}:
        raise ValueError('Unsupported backup manifest')
    for name, checksum in files.items():
        if digest(source / name) != checksum:
            raise ValueError('Backup checksum mismatch')
    # Restore to a new, offline location; never overwrite an existing directory.
    if destination.exists():
        raise ValueError('Restore requires a new destination directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.restore-', dir=destination.parent))
    try:
        for name in files:
            snapshot(source / name, staging / name)
            os.chmod(staging / name, 0o600)
        with contextlib.closing(connect(staging / 'cec.sqlite')) as connection:
            connection.execute('DELETE FROM sessions')
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='email_tokens'").fetchone():
                connection.execute('UPDATE email_tokens SET used=1')
                connection.execute("UPDATE email_jobs SET status='cancelled', payload='', lease=NULL, lease_until=0 WHERE status IN ('queued','processing')")
            # Retry state may contain stale backoff timestamps from before recovery.
            init(connection)
            connection.execute('DELETE FROM pipeline_retry')
            connection.execute('DELETE FROM pipeline_status')
            connection.commit()
        # mkdir is exclusive, including for an empty destination created concurrently.
        destination.mkdir(mode=0o700)
        for file in staging.iterdir():
            file.rename(destination / file.name)
        staging.rmdir()
        return {'restored': str(destination), 'sessions_revoked': True}
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def status(database):
    with contextlib.closing(connect(database)) as connection:
        init(connection)
        pending = connection.execute('SELECT COUNT(*) FROM outbox WHERE delivered=0').fetchone()[0]
        exhausted = connection.execute('''SELECT COUNT(*) FROM outbox o JOIN pipeline_retry r ON o.id=r.id
            WHERE o.delivered=0 AND r.attempts>=?''', (MAX_ATTEMPTS,)).fetchone()[0]
        return {'pending': pending, 'exhausted': exhausted,
                **dict(connection.execute('SELECT key,value FROM pipeline_status'))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['work', 'once', 'retry', 'status', 'backup', 'restore'])
    parser.add_argument('--database', default=os.environ.get('CEC_DATABASE', '.data/cec.sqlite'))
    parser.add_argument('--backups', default=os.environ.get('CEC_BACKUP_DIR', '.data/backups'))
    parser.add_argument('--source')
    parser.add_argument('--destination')
    args = parser.parse_args()
    os.umask(0o077)
    if args.command == 'restore':
        if not args.source or not args.destination:
            parser.error('restore requires --source and --destination')
        print(json.dumps(restore(args.source, args.destination)))
    elif args.command == 'backup':
        print(json.dumps(backup(args.database, args.backups)))
    elif args.command == 'status':
        print(json.dumps(status(args.database)))
    elif args.command in ('once', 'retry'):
        print(json.dumps(deliver(args.database, force=args.command == 'retry')))
    else:
        stopping = False
        def stop(*_):
            nonlocal stopping
            stopping = True
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        while not stopping:
            try:
                deliver(args.database)
                state = status(args.database)
                mark_time = float(state.get('last_backup', 0))
                if time.time() - mark_time >= 86400:
                    backup(args.database, args.backups)
                with contextlib.closing(connect(args.database)) as connection:
                    mark(connection, 'worker_heartbeat', time.time())
            except Exception:
                # Never log payloads, credentials, or database contents.
                print('Pipeline cycle failed; check database and backup storage.', file=sys.stderr, flush=True)
            for _ in range(5):
                if stopping:
                    break
                time.sleep(1)


if __name__ == '__main__':
    main()
