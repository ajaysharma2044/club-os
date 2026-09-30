# Task 013: Supabase operational runtime

Status: deployed to Netlify with Supabase; hosted health/state and account-page smoke checks passed.

## Outcome and acceptance criteria

The Netlify frontend could render while its SQLite API refused ephemeral storage.
The app now supports server-side Supabase PostgreSQL for accounts, memberships,
records, sessions, permissions, messaging, evidence, imports and the durable outbox.
Existing SQLite mode remains available for offline development and regression tests.

- Preserve organization boundaries, relationship guards and append-only history.
- Keep domain changes, audit and outbox atomic; maintain safe retries and capacity checks.
- Apply explicit, checksum-verified SQL migrations before serving requests.
- Rehearse and verify data transfer, preserving the original database and backup.
- Exercise actual PostgreSQL API and worker behavior with isolated synthetic schemas.
- Configure and smoke-test the hosted environment before calling the live site fixed.

## Implementation

Database-dependent domain operations and API handlers now await network calls.
Request-scoped connections and transactions use nested savepoints. A transaction-level
advisory lock preserves the existing single-club serialization contract across instances.
The SQL compatibility layer handles parameters, conflict syntax, JSON access, insertion
order and metadata; lazy schema setup validates migrated tables rather than executing DDL.

The initial migration creates 89 tables in private `club_os`, with translated native
relationship/history triggers, RLS and no public/anon/authenticated grants. The browser
never receives database credentials. TLS validates the configured Supabase certificate.
The current connection uses the trusted server postgres role; a dedicated restricted
runtime role remains a rollout improvement.

A Node worker consumes the PostgreSQL outbox and invokes the existing Python engine.
The email worker supports PostgreSQL claim/completion transactions, with provider calls
outside the transaction. Email remains disabled. Quant storage remains SQLite and needs
a durable Python worker host; Netlify alone does not provide hosted analytics.

## Data cutover

The existing SQLite database was backed up, imported into a temporary rehearsal schema,
and verified row by row. The same import then succeeded against the production private
schema: one existing account, organization and membership, plus audit/pipeline/table
metadata. There were no existing club records to transfer. IDs and password hashes are
preserved. Sessions/rate limits/email tokens were omitted; sign in again after cutover.
Queued emails are cancelled by the importer. The original SQLite files remain intact.

Local ignored configuration now selects PostgreSQL. The first migration has been applied
and must not be edited; future schema changes need a new numbered file. Do not switch
back to SQLite after new Supabase writes without reconciling those changes first.

## Verification evidence

- Real PostgreSQL HTTP suite: 278 API assertions, 52 page-route checks and 12
  organization-boundary checks passed; temporary outbox/quant worker included.
- Native PostgreSQL workflows, foundation migration/TLS/permissions/concurrency tests,
  officer tools and email queue regression suites passed using isolated schemas.
- Import rehearsal and actual import passed integrity, relationship and row verification.
- Full six-stage gate passed: types, pure suites, Python, API, signals and production build.
  Evidence: `work/verification/2026-09-30T06-41-46.208Z-68272/result.json`.
- Restarted local app: `/api/cec/health` returned 200 with `storage: postgres`;
  `/api/cec/state` returned 200. Browser account page loaded its sign-in form without
  the workspace error. Existing sessions require sign-in again; the migrated real
  account was not impersonated or given a new password for testing.
- Local PostgreSQL outbox worker started with the existing durable quant path.
- One final gate exposed inherited local quant configuration in the SQLite test harness;
  fixed by always setting the test's temporary quant path. No assertions were weakened.
- Reviewer: self-review. Local Node 26; remote Node 22 CI has not been run.

## Delivery and limitations

The user approved production credential transfer and deployment. Seven server variables
were saved as Netlify secrets for the Production context only; preview, branch and local
contexts were excluded. Email remains disabled. Runtime commits were pushed and the
hosted smoke verification below passed. Global request
serialization limits throughput. Operational backups belong in Supabase; quant backups
remain on its worker host. See [the runbook](../33-postgres-migration.md) for configuration,
commands, backup/rollback boundaries and deployment requirements.

### Hosted deployment progress

- Pushed runtime migration as `9268b5e` to main.
- Netlify compiled and type-checked successfully, then its secret scanner rejected
  the ordinary enum values `postgres` and `disabled`, because the bulk import marked
  them secret. Netlify does not allow changing that classification in the edit form.
- Excluded only `CEC_STORAGE` and `CEC_EMAIL_MODE` from value scanning in netlify.toml.
  Scanning remains enabled for the connection password and application keys.
- Staging the previously untracked SQL migration revealed trailing whitespace in the
  generated file. It is already applied and checksum-verified, so its bytes are retained;
  this is a formatting exception, not a changed or skipped database invariant.

### Hosted verification complete — 2026-09-30 UTC

- Netlify published commit `c2e22cb` after the public-enum scanner exception.
  Deployment: https://app.netlify.com/projects/jade-palmier-e20b3c/deploys/6abcb1652e63c50008df56c2
- Production `/api/cec/health`: HTTP 200, `ok: true`, `storage: postgres`.
- Production `/api/cec/state`: HTTP 200 with workspace JSON and no error.
- Browser `/you`: rendered Welcome back and the sign-in form, with no workspace error.
- Existing account/password preserved; no real user's login was impersonated for testing.
  Authenticated workflows were covered by isolated PostgreSQL integration suites.
- Hosted Python analytics still requires a separately provisioned durable worker; the
  local worker is not a production hosting service. Email remains disabled.
- No database credentials were committed. Production settings are absent from preview
  contexts. Node 22 Netlify compilation and type checking passed; local full regression
  gate evidence remains above.
