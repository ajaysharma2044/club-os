# Supabase operational database

Status: runtime deployed on Netlify with Supabase; see task 013 for cutover and verification evidence.

## Storage selection

Set `CEC_STORAGE=postgres` to use Supabase for API reads, writes, sessions, audit,
evidence, messaging, imports and the durable outbox. `DATABASE_URL` alone does not
switch providers. Without the explicit setting, the original SQLite runtime remains
available for offline development and regression tests. PostgreSQL failure never falls
back to SQLite. The original ephemeral-storage refusal remains for SQLite on serverless.

The app uses server-side `pg` connections, not the browser Supabase SDK or publishable
key. Existing password accounts and organization permissions are retained. Database
credentials never use NEXT_PUBLIC_ variables. A private `club_os` schema holds the
application tables; Supabase auth/storage/public schemas are untouched. Tables have
RLS enabled, with no grants to PUBLIC, anon or authenticated. The configured database
role is trusted server infrastructure; the initial migration connection is the project's
postgres role. Provision a dedicated least-privilege runtime role before broad rollout.

## Async runtime and concurrency

Database-dependent domain operations and API handlers now await network calls. Async
collection helpers execute sequentially so side effects, ordering and short-circuit
checks retain their original semantics. No unawaited async filter predicates are used.

Each request pins one checked-out Postgres connection, starts a transaction and sets
its search path locally. A transaction-scoped advisory lock serializes this single-club
runtime across instances. Nested domain transactions use savepoints, preserving atomic
record/history/outbox writes and rollback. This deliberately retains the SQLite
single-writer contract for RSVP capacity, setup, leadership transfer and import retries.
It limits throughput; replace coarse serialization with reviewed per-domain row locks
before a high-concurrency or multi-club rollout. Remote query latency is higher than
local SQLite, especially for operations that issue many sequential queries.

Queries use positional parameters and unnamed statements for the transaction pooler.
A narrow compatibility layer handles placeholders, JSON text extraction, insertion
ordering, SQLite metadata reads and conflict syntax. PostgreSQL migrations install the
complete schema and translated relationship/append-only triggers ahead of deployment.
Legacy lazy module initialization validates known tables instead of creating them.
Migration checksums and transaction advisory locks guard replay. Runtime SQL errors do
not expose database messages, query values or connection credentials to the browser.

## Configuration

Server-only values, in ignored web/.env.local locally or host environment settings:

- `CEC_STORAGE=postgres`
- `DATABASE_URL`: transaction-pooler URI with the actual password, percent-encoded.
- `DATABASE_SSL_CA_PEM`: complete downloaded Supabase root certificate. For local
  development, `DATABASE_SSL_CA_FILE` can point to the certificate instead (relative
  to the process working directory, normally web/). Verification cannot be disabled
  through connection-string SSL parameters.
- `CEC_POSTGRES_SCHEMA=club_os` (default).
- `CEC_ORIGIN`: exact HTTPS deployment origin.
- `CEC_EMAIL_MODE=disabled` until mail delivery is intentionally configured.

Use Node 22.13+ on the Node 22 line as documented for the app. Local validation used
Node 26; remote CI/runtime validation is separately reported. Do not copy a local .data
certificate path into Netlify; use the PEM environment variable there.

## Migration and transfer

Run from web/:

1. Stop application writes and take a pipeline backup of SQLite.
2. `npm run db:check` verifies authentication and TLS without changing records.
3. `npm run db:migrate` installs/checks the private schema in a transaction.
4. Rehearse with `node --env-file=.env.local --experimental-strip-types scripts/postgres-rehearse.mjs BACKUP/cec.sqlite`.
5. `npm run db:import -- BACKUP/cec.sqlite` imports into an empty destination only.
6. Set `CEC_STORAGE=postgres`, restart, verify health and native workflows, then deploy.

Import verifies source integrity and foreign keys, loads accounts/memberships/records
before dependent data, checks every inserted row, and repairs identity sequences.
Any error rolls back the import. It preserves IDs, passwords, memberships, history and
calendar subscription tokens. Sessions and rate limits are not copied, so users sign
in again. Email tokens are omitted and old queued jobs are cancelled with their payloads
cleared. SQLite and its backup remain intact.

The native SQL migration is versioned source. Never edit an applied migration: add a
new file. Rehearsal and database tests create random club_os_test_* schemas, use synthetic
fixtures where appropriate, and remove those schemas. They never clear club_os.

## Workers and analytics

`npm run pipeline:postgres` drains the Supabase outbox into the existing Python quant
engine. Run it on a worker host with Python and an explicitly durable
`CEC_QUANT_DATABASE` path. Claims/retry attempts are committed before execution;
delivery is idempotent, failed work retains retry state and processing preserves order.
The web handler leaves committed outbox work for that worker rather than spawning a
SQLite consumer from a serverless function. The old Python pipeline worker remains
for SQLite deployments only.

The operational data is now remote, but the quant engine still has its own SQLite
store. It has not been converted to Postgres. Legacy Python forecast endpoints need
that worker/store on the host and report unavailable/pending when it is not configured;
Netlify alone does not provide that Python worker. Do not claim hosted analytics is
operational merely because the core app loads. The Node-native app workflows remain
available independently. Back up the quant store on its worker host and use Supabase
backup/recovery for the operational database; the old SQLite recovery command does
not restore Supabase.

The email worker supports the Postgres queue with short claim/completion transactions
and provider calls outside the transaction. Email remains disabled for this rollout.
Provider credentials and the existing encryption key must be configured before enabling
it. This migration does not send messages.

## Rollback and hosting

Keep the pre-migration SQLite backup. Before any post-cutover writes, switching the
explicit storage setting back restores the old local environment. Once Supabase has
new writes, switching back without transferring them would lose those new changes:
stop writes and reconcile/export before rollback. No automatic failover does this.

Netlify can host the operational app after the updated code and server environment
variables are deployed. An old deployment still using SQLite will continue to refuse
storage. Do not disable the guard to hide a missing deployment setting.

## Verification commands

- `npm run test:postgres`: actual TLS, migration replay, RLS/role denial, relationships,
  rollback and concurrent version checks against an isolated Supabase schema.
- `npm run test:postgres-workflows`: native domain operations on Postgres.
- `npm run test:postgres-api`: existing core API, page and organization-boundary suites
  on Postgres, with an isolated outbox/quant worker and temporary analytics file.
- `npm run test:postgres-tools`: imports, prospects, attendance, dashboard and handoff.
- `npm run test:postgres-email`: queue claims, capture delivery, retries and mode isolation.
- `npm run check`: complete existing SQLite regression gate and production build.

References: [node-postgres transactions](https://node-postgres.com/features/transactions),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement).
