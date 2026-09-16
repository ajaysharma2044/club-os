# Pipeline operations: single-host pilot

## Run

Run from `web/` with the same exported `CEC_DATABASE` as the app. Python does not
load Next.js `.env.local`; explicitly export any custom database path. With no
configuration both use `web/.data/cec.sqlite`.

```sh
npm run pipeline:work
npm run pipeline:status
npm run pipeline:backup
```

Run the worker alongside Next.js under a process supervisor in production (restart
on failure). It checks every five seconds, retries with exponential backoff starting
at five seconds, and stops after eight attempts. Attempts survive restarts. A failed
head event holds later events to preserve ordering. Fix the cause, then use the
existing officer Retry synchronization button or, on the trusted server:

```sh
python3 ../services/quant/pipeline.py retry
```

The web request retains a bounded opportunistic delivery pass; a delivery failure
never rolls back a committed user action. The worker makes retries independent of
web traffic. OS file locks prevent concurrent ingestion and release on process exit.
Delivery uses the existing stable event IDs for idempotent replay after a crash.
This uses local Unix locks: run on one host, not independent replicas or NFS.

## Backups

The worker creates a snapshot on its first cycle and every 24 hours after a successful
backup. Set `CEC_BACKUP_DIR` to protected backup storage; default `.data/backups`.
A failed backup is retried on the next cycle and logged without data payloads.
SQLite online backup includes committed WAL contents. Ingestion pauses across the
application and analytics snapshots; normal application writes remain possible.
Snapshots have an integrity check, SHA-256 manifest and owner-only files/directories.
Incomplete snapshots are hidden and never published as successful backups.

These are whole-database backups containing private data and password hashes.
Restrict storage access and use encrypted storage. Local snapshots protect against
some application mistakes, not disk/host loss. Configure off-machine storage,
encryption and retention/expiry before launch. This implementation does not upload
or automatically delete backups; monitor capacity and apply an explicit retention
policy. Monitor worker heartbeat age, pending/exhausted counts and backup freshness
with `pipeline:status`; alert delivery is not configured.

## Recovery drill / incident

Restore into a new offline directory, never over a running database:

```sh
python3 ../services/quant/pipeline.py restore \
  --source /protected/backups/backup-TIMESTAMP \
  --destination /new/recovery-directory
```

The command verifies checksums and SQLite integrity and refuses existing targets.
It restores both databases when present, removes sessions, and resets retry state.
Keep both database files together; the analytics file is always `quant.sqlite`
beside the configured application database. Pending outbox entries replay safely.
If delivered events exist but the analytics database is missing, backup fails rather
than silently producing an incomplete recovery set.

Before switching production, stop the app and worker, inspect the restored records,
reconcile deletions/consent revocations since the backup, and configure both services
with `CEC_DATABASE=/new/recovery-directory/cec.sqlite`. Restart and inspect pipeline
status. Users must sign in again. Backup restoration can resurrect older data and
permissions; session revocation alone does not reconcile later erasure/revocation.
Do not expose a restored copy before that review. Preserve the old files until the
recovery is verified. Changes after the snapshot are not recoverable from that copy.

## Automated drill

`python3 -m unittest discover -s services/quant/tests -p test_pipeline.py -v`
from the repo root exercises failures/backoff/exhaustion, manual retry, crash-window
idempotency, lock release, WAL snapshots, paired recovery, checksum rejection,
no-overwrite behavior, session revocation and a live worker delivering/backing up
without an HTTP request. The shared project check includes these tests.
