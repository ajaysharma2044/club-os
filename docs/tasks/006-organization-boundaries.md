# Task: Explicit organization ownership and membership boundaries

Status: done

## Acceptance criteria

- Backfill one active CEC organization and existing users' memberships without
  losing records, task history, credentials, sessions or versions.
- Separate global account identity from membership role/status. Current CEC role,
  not a supplied/stale role or another organization's role, determines permissions.
- Core records have organization ownership; assignee/project/owner relationships
  and core child-record types are enforced at database write time.
- CEC API reads/writes cannot access a second organization's accounts/records.
- Leaving/suspension removes active access while preserving historical records.
- Migration is versioned, transactional and repeatable; invalid legacy data aborts.

## Scope and implementation

- Physical `accounts`, `organizations`, `memberships`, `records` tables. Existing
  `users` and `items` names are writable CEC-scoped views to keep every existing
  raw query scoped, including public directory, exports and planning queries.
- Core CEC child tables, audit and outbox have explicit fixed CEC ownership.
- Auxiliary tables remain exclusively CEC-owned, recorded in `organization_tables`;
  schema initialization installs membership/record guards on their foreign keys
  and known polymorphic ID fields. New FK definitions reference physical tables.
- No organization switcher or second production organization enabled. Auxiliary
  tables are not multi-tenant storage. Per-organization profile consent, multiple
  recruitment cycles and normalized work-submission tables remain later work.
- CEC-bound analytics carries explicit organization in new/backfilled outbox
  envelopes; the worker rejects non-CEC envelopes before invoking analytics.

## Verification

- Populated legacy migration, idempotency, rollback, foreign-key integrity,
  cross-org parent/assignee rejection and lazy-table guards tested against SQLite.
- HTTP tests exercise two organizations, different roles per membership, foreign
  reads/updates, organization spoofing and immediate suspension enforcement.
- Full gate: all six stages passed. Evidence:
  `work/verification/2026-09-16T02-54-47.123Z-34111/result.json`.
  Includes 278 existing API assertions, 52 route checks, and 12 new HTTP isolation checks.
- Additional final targeted checks passed: organization migration/isolation suite
  and seven pipeline tests, including refusal to ingest a foreign organization.
- Upgrade rehearsal on restored synthetic workflow database: 2 memberships, 8
  records, no foreign-key errors. Browser sign-in retained officer permissions;
  both submissions, revision feedback, and approval of submission 2 remained visible.
- Normal local database upgraded to version 1, foreign-key check clean. Preview
  and worker restarted. A post-migration snapshot was also created.
- `git diff --check` passed. Local Node 26/Python 3.14 used; CI runtime not run here.
- A pre-migration snapshot of the local database was created at
  `web/.data/backups/backup-1789526819806230000`.

## Review

Self-review. Local only; no commit or remote deployment. Core payloads remain JSON,
with relational invariants enforced by triggers. General cross-club hosting still
requires scoped auxiliary tables and routes; this step makes the CEC boundary explicit.
