# Task: Recoverable local data pipeline

Status: done

## Acceptance criteria

- Queued analytics events retry without user requests, with persisted backoff and a
  bounded attempt count. Crashes release delivery ownership; replay is idempotent.
- Backups use SQLite's online backup API, include WAL contents, and capture the
  application and analytics databases while ingestion is paused.
- Restore validates checksums and integrity, refuses existing destinations, revokes
  sessions, and permits pending event replay. Never test recovery against live data.
- Operators can inspect backlog, exhausted retries, heartbeat and backup timestamp.

## Scope

Single-host Unix/macOS/Linux worker using the existing Python runtime and outbox.
No remote upload, cloud deployment, notification delivery or database migration.
Operational retry/status tables are additive. Web flushes and worker share an OS
lock and delivery implementation. Existing officer retry explicitly resets backoff.
A blocked event holds later events to preserve event order; fix the cause and retry.

## Verification and review

Six focused recovery tests pass using temporary synthetic databases, including an
actual worker process. Final `npm --prefix web run check` passed all six stages:
types, pure suites, Python, API/pages, signals and production build. Evidence:
`work/verification/2026-09-16T02-39-31.631Z-26935/result.json`.
`git diff --check` passed.

Self-review covered queued-event order, retry persistence, crash ownership,
privacy of logs, missing analytics snapshots, no-overwrite restore and revocation
limits. Restore refuses a missing analytics database when acknowledged events exist.
Local worker is running; first backup succeeded, pending=0, exhausted=0.

No UI changed. No browser run required for this operational change. Docker/production
supervision and remote storage were not exercised. Node 26/Python 3.14 local runtimes
differ from CI Node 22/Python 3.12. No off-machine upload, retention pruning, or alert
provider is configured.
Local only; no commit or deployment.
