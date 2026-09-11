# Club OS quant backend — first executable foundation

An isolated, dependency-free Python backend for the Cornell Entrepreneurship Club pilot.
Built from the Club OS specifications, then checked against frontend commit
`c5dd682e7e3322fa685a91e3de08f5f81ca4e86e`.
This is a local development service, **not a deployed production system**. The GitHub
snapshot initially contained research/specifications only. Cursor's Next.js frontend
appeared during implementation and was inspected before this additive change. Its
local checkout was not available.

## Run and verify

Requires Python 3.9+. No package installation is needed.
From this directory (in GitHub: `services/quant`):

```sh
python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 examples/demo.py
```

The demo is entirely synthetic, uses an in-memory database, and exercises event
publication, RSVPs, attendance, tasks, recruitment, coffee chats, a saved forecast,
outcome evaluation, the evidence graph, and a project-duration scenario.
`examples/demo-result.json` is one captured run, not empirical club performance.

Create a private credential file locally; the command does not print the token:

```sh
python3 - <<'PY'
import json, os, secrets
credential = {secrets.token_urlsafe(32): {
    'club': 'cornell-ec', 'subject': 'pilot-officer', 'role': 'officer',
    'sources': ['native']}}
fd = os.open('credentials.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(credential, stream)
PY
python3 -m club_quant --credentials credentials.json --database club-os.sqlite3
```

The server binds **127.0.0.1 only**. Configure a local API client with the token
from your credential file in `Authorization: Bearer TOKEN`. Never place this token
in a public browser application. The frontend needs its own user authentication
and a server-side integration layer before real users can use this service.
Credentials and local database files are git-ignored. Restart to rotate credentials.

## Implemented API

All routes require a server-configured principal. The club is derived from the
credential, never a client-provided tenant header. `officer` can read and ingest;
`researcher` can read permitted sources and run analysis. Other roles, including
external VC/employer roles, are rejected. These are service accounts for the pilot;
member self-service and advisor permissions are not implemented.

| Method | Route | Behavior |
|---|---|---|
| POST | `/v1/sources` | Enable/disable a source within the credential's source allowlist |
| POST | `/v1/records` | Validate and append a versioned operational observation |
| GET | `/v1/records` | Authorized history; optional `valid_at` and `known_at` |
| GET | `/v1/snapshot` | Latest valid facts from authorized history |
| GET | `/v1/graph` | Evidence-backed current relationships with source pointers |
| GET | `/v1/models` | Version, feature definition, prior, target and limitations |
| POST | `/v1/forecasts` | Save a reproducible RSVP attendance forecast |
| GET | `/v1/predictions/{id}` | Retrieve only if its evidence is still authorized |
| POST | `/v1/evaluations` | Evaluate a frozen forecast cohort against explicit outcomes |
| POST | `/v1/plans` | Simulate a dependency graph using declared duration estimates |
| POST | `/v1/erase-subject` | Remove subject/actor facts, suppress reimport, invalidate club predictions |

Read endpoints are deliberately unpaginated for this local pilot. Add bounded
pagination and resource limits before exposing the API beyond local development.

Configure the initial source with `{"source":"native"}` at `/v1/sources`.
Example body for `/v1/records`:

```json
{
  "source": "native",
  "external_id": "form-response-001",
  "fact_key": "rsvp:member-001:startup-hours-001",
  "kind": "rsvp",
  "subject": "member-001",
  "object_id": "startup-hours-001",
  "occurred_at": "2026-09-10T18:00:00Z",
  "payload": {"status": "yes"}
}
```

`known_at` and actor identity are assigned by the service. Occurrence cannot be
in the future. Scheduled timestamps belong in the payload. IDs for subjects and
objects use letters, numbers, `.`, `_`, and `-`. Prefix IDs by entity type to avoid
collisions in graph nodes. `fact_key` must be exactly `kind:subject:object_id`.
The same fact cannot silently change identity or source.

Supported exact payload schemas are declared in `club_quant/store.py`: membership,
event, RSVP, attendance, task, application, coffee chat, artifact, decision and
opportunity. This first version records their state history; it is not yet a full
forms builder, workflow transition validator, document editor or financial ledger.

For a normal status change, send the same fact key with a new external ID and
occurrence time. A correction additionally supplies `supersedes` (record ID) and
`reason`, and must retain the original identity and occurrence time. Retrying an
external ID with identical content returns the same record; changed content is
rejected. Historical replay applies only corrections known at the query cutoff.

## Quantitative behavior

The baseline estimates attendance **among current affirmative RSVPs**, not total
event attendance or walk-ins. Training uses pre-start RSVP cohorts from closed
events and explicitly recorded present/absent outcomes. Missing labels are reported
and excluded, never converted into no-shows. Historical RSVP features are restricted
to what was known before each event began.

With `s` present and `f` absent observations:

- Prior: Beta(1, 1), explicitly a starter assumption.
- Posterior: Beta(1+s, 1+f).
- Predictive count for `n` current RSVPs: beta-binomial(n, 1+s, 1+f).
- Mean: n * alpha / (alpha + beta).
- Equal-tail 90% predictive interval from the exact discrete distribution.

The shared probability uncertainty induces overdispersion relative to a plug-in
binomial. This does not model all social/event correlations. Predictions carry
model and feature versions, inputs, cutoff, posterior, interval and evidence IDs.
Cold start is marked `prior_only`; observed-history runs are `baseline_unvalidated`.
There is no claim of calibrated predictive performance on real Cornell data.

POST `/v1/forecasts`: `{"event_id":"startup-hours-001"}`. A published future event
must exist in the record. Optional `cutoff` supports historical replay. The default
persists the forecast; `persist:false` performs a read-only historical calculation.

POST `/v1/evaluations`: `{"ident":"PREDICTION_ID"}`. Evaluation requires a closed
event and explicit labels for every member of the frozen forecast cohort. It
returns MAE for that event, individual-outcome Brier/log loss, interval coverage,
and outcome evidence. Evaluation responses are not yet persisted in a registry.

Project simulation (`/v1/plans`) uses a DAG, triangular task-duration estimates,
a deterministic seed and Monte Carlo draws. Serial dependencies accumulate while
independent tasks run in parallel. Missing dependencies and cycles are rejected.

```json
{
  "tasks": [
    {"id":"draft", "dependencies":[], "optimistic":1, "likely":2, "pessimistic":4},
    {"id":"review", "dependencies":["draft"], "optimistic":1, "likely":1, "pessimistic":3}
  ],
  "deadline_days": 5,
  "draws": 2000,
  "seed": 42
}
```

This is a scenario model with independent durations and unlimited parallel capacity;
it does not yet enforce member availability, working calendars or staffing constraints.

## Integration boundary

Provider identifiers exist for native, Google Workspace, Slack, Canvas and calendar.
**No OAuth connection or live external synchronization is implemented.** A trusted
adapter will map authorized external records into the strict observation schema.
The source registry is an access switch, not evidence that a provider is connected.

Adapters must eventually handle scopes, stable object/revision IDs, webhook
verification, cursors, backfill, retries, deletion, source permissions and conflict
resolution. Knowledge time must remain the actual receive time. AI extractions
require a review workflow before becoming confirmed operational facts. Private
message bodies, arbitrary form answers and grades have no event schema here.

## Storage and deployment decision

The executable adapter uses SQLite WAL to make the first semantics and tests run
locally without credentials or installed infrastructure. This is a deliberate
**development adapter**. Older specs propose Postgres; the newly published Cursor
rules select TypeScript/Next.js/Convex. This package does not replace that app stack
or settle the production persistence choice. It isolates numerical research and
replay semantics behind an HTTP boundary.
All writes use transactions; records have a sequenced append log and update guard.
Read projections are replayed from that log instead of maintaining dual-write state.

Before a hosted pilot: integrate with the application's authoritative backend
(Convex per the current Cursor rules), or explicitly settle the older Postgres
proposal. Run these invariants against the selected persistent adapter and add real membership authentication and
record-level access, deployment/TLS, pagination, audit logging, backup/restore,
connector workers, fine-grained sharing grants and retention controls. Database
administrators can bypass application controls; protect filesystem/database access.
The stdlib WSGI server is for local development only.

Source revocation immediately excludes source records from reads, features and
saved prediction retrieval. It does not delete source records. Subject erasure
physically deletes the subject's facts and facts attributed to that actor, removes
all club predictions and blocks subject re-ingestion. This intentionally sacrifices
historical reproducibility for erased records. Erasure of names embedded in titles,
external linked files, exports or backups requires additional retention infrastructure;
do not ingest real sensitive data into this development adapter.

## Next implementation slices

1. Integrate with Cursor's actual app and agree on stable entity identities.
2. Authoritative Convex/app integration or agreed production storage adapter, authentication, record ACLs and persistent entities.
3. Native forms/events/recruitment write paths through this service.
4. Approved Google/calendar/Slack adapters with ingestion contract tests.
5. Task dependencies and reviewed artifacts stored as first-class linked records.
6. Persisted evaluation/hypothesis registry, walk-forward reports and deployment gates.
7. Only then: hierarchical models, experiments, opportunity matching and approved external evidence sharing.

The backend does not compute personal reliability, employability, personality,
leadership potential, sensitive attributes, or hidden external profiles. These are
not implied by the existence of a graph or source integration.

## Compatibility with the current frontend

The inspected `web/package.json` uses Next.js 15 and React 19. `web/lib/data.ts`
contains static demo records without stable member/event/task IDs.
`web/lib/integrations.ts` contains illustrative connected states; those are not
live authorizations and must never provision this service automatically.

Keep the browser talking to the app's authenticated server/Convex layer. That layer
must verify membership, mint/map stable IDs, and dispatch only permitted events to
this service with a scoped server credential. Do not send a browser-selected club
ID with a global privileged token. Real events should originate in authoritative
server mutations, with an outbox/retry mechanism, not optimistic UI callbacks.

The numerical service is an isolated Python companion to the TypeScript app; no
frontend files, package manifests, existing routes or Convex decisions are changed
by this PR. Forecasting remains off until explicitly called.
