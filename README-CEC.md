# Club OS — connected Cornell Entrepreneurship Club workspace

The CEC backend is integrated into the main Next.js frontend at `/clubs/cec`.
Home, Inbox, Discover, Join, and You use real CEC account and club data. Events,
Workspace, People, Money, and Settings open inside the shared club layout.
Old `/cec/*` links redirect to their corresponding screens. Other clubs remain
explicitly labeled demos. See [frontend routes and runtime](web/README.md).
See [Cornell research](docs/cornell-research.md) for sources and factual boundaries.
See [adaptive workflows and evidence](docs/adaptive-workflows-and-evidence.md) for the
weekly intake policy, chat scheduling, personal calendar subscriptions, episode schema,
feature math and current limits.

## Working workflows

- Weekly adaptive check-ins, confirmed background context, answer history, freshness,
  separate officer-sharing consent, and personal removal controls at `/clubs/cec/intake`.
- Selected chat messages → editable meeting proposal → confirmation → invitations.
  Accept/cancel meetings and manage a private calendar subscription at `/clubs/cec/schedule`.
- Episode evidence for task/project/event/meeting actions, blocker reporting and
  resolution, reported outcomes, visible correction history and dated feature snapshots.
- Password accounts, expiring HttpOnly sessions, officer/member/applicant permissions.
- One-time protected officer setup; subsequent signups start as applicants.
- Password-authenticated member invitations and officer membership controls, including
  role changes, session-revoking removal, restoration and atomic leadership transfer.
- Event drafts/publication, capacity-aware RSVP and waitlist, officer attendance,
  per-event and calendar-wide ICS downloads.
- Recruitment applications, private reviews, acceptance into membership, coffee-chat
  slots with transactional booking and overlapping-time checks.
- Tasks with owner, due time, origin and project links; accept/decline, submit work,
  officer revision feedback and approval, with retained submission and review history.
- Projects with stage, artifact links and explicit sharing; document links; meetings
  with agendas and confirmed decisions; learning assignments and reviewed submissions.
- Native club forms with required answers, duplicate prevention and immutable question
  structure after the first response; club channel messages stored server-side.
- Officer CRM contacts/opportunities and a simple money register (not payment processing
  or double-entry accounting).
- Current record export, officer audit, and a public directory that requires both
  profile and project opt-in. Recruitment reviews and messages are never public.
- A transactional outbox feeding the Python quant engine. Retry is idempotent. Forecasts
  refuse to run when synchronization is pending. Monte Carlo planning is available
  alongside a versioned beta-binomial attendance baseline.

### Task submission and review

Members submit a completion note, an HTTP(S) artifact link, or both. Officers can
approve or request a revision with required feedback. Each review references the
submission reviewed; resubmission retains earlier work and feedback. General task
edits cannot replace this server-owned history. Existing tasks remain compatible;
reviews of legacy submissions explicitly indicate when no work record exists.

`task.status` requires the current task `version` when submitting or reviewing work.
Stale submissions/reviews return HTTP 409 without changing the record. Submission
fields are `submission_note` and `artifact_url`; revision feedback is `revision_note`.
History, task state, audit evidence and outbox records are written transactionally.
Artifact links are references, not uploaded or archived copies of external files.

## Local setup

Requires Node **22.13+**, Python **3.9+**, and npm. A server filesystem is required.

```sh
cd web
npm ci
node scripts/cec-init.mjs
npm run dev
```

Open `http://localhost:3000/clubs/cec/settings`, choose **Officer setup**, and supply the
random setup key from `web/.env.local`. This creates the initial officer. No hardcoded
user, password, roster or real event exists. Do not share or commit the setup key.
Future participants register normally and can apply for membership.

The init script refuses to overwrite an existing `.env.local`. Set `CEC_ORIGIN` to
the exact browser origin. The server rejects state-changing requests from other
origins. Sessions last seven days; signing out revokes the current session.

## Run the checks

```sh
cd web
npx tsc --noEmit
node scripts/cec-test-server.mjs
npm run build
cd ../services/quant
python3 -m unittest discover -s tests -v
```

The HTTP test runner uses a fresh temporary database and random credentials. Do not
point `tests/cec-api.mjs` at real club data. It tests access control, private recruitment
notes, RSVP capacity, real quant delivery, task approval, booking conflicts, form
validation, sharing revocation, CSRF, calendar output, adaptive question selection,
weekly rollover, subscription revocation, episode evidence, corrections, snapshots
and logout. It also checks connected page rendering, old-link redirects and the
CEC-only route boundary. All fixture people and data are synthetic.

## Organization boundaries

Accounts and organization memberships are separate. Existing data migrates into
CEC; roles are resolved from current CEC membership. Core records carry organization
ownership and database guards enforce same-organization relationships. Existing
CEC routes use scoped views, so another organization’s records cannot appear in
their queries. Auxiliary modules remain CEC-only. See the
[organization schema and migration notes](docs/27-organization-schema.md). This
is not yet a general multi-club deployment.

## Architecture and storage

`web/lib/cec/db.ts`: SQLite schema and durable transactions.
`web/lib/cec/service.ts`: authenticated domain actions.
`web/app/api/cec/[...path]/route.ts`: HTTP boundary and origin protection.
`web/lib/cec/quant.ts`: trusted subprocess interface and outbox replay.
`web/lib/cec/adaptive.ts`: weekly question policy and confirmed context history.
`web/lib/cec/scheduling.ts`: chat proposals, invitations and private ICS feeds.
`web/lib/cec/evidence.ts`: transactional episode events, blockers and feature snapshots.
`services/quant/bridge.py`: existing quant service integration.

Application data is in `web/.data/cec.sqlite`; the derived quant record is in
`web/.data/quant.sqlite`. Both databases and their WAL files require a persistent
volume and coordinated backups. No user data belongs in git. Outbox delivery occurs
after mutations and can be retried from The record. A separate Python worker adds
automatic retries, bounded backoff, status reporting and daily SQLite backups.
Start it with `npm run pipeline:work` from `web/`; it is not started by Next.js.
See [pipeline operations and recovery](docs/26-pipeline-operations.md). Push
synchronization and notification workers are not yet implemented.

The published frontend had no configured Convex deployment. This implementation is
an executable **single-server SQLite edition**, not a claimed Convex deployment.
Migrating to Convex or Postgres requires preserving transaction, identity, authorization,
outbox and historical-query invariants. Do not deploy it onto ephemeral serverless
storage or run horizontally against separate local databases.

## Hosting

A portable Compose deployment now includes HTTPS, a restarted worker, encrypted
off-machine backup jobs and operational webhook alerts. It is prepared but has not
been deployed or container-tested locally. See [pilot launch runbook](docs/28-pilot-launch.md)
for configuration, retention, recovery drills and remaining provider setup.


A Dockerfile is provided for a Node + Python server. Build from the repository root.
Set `CEC_ORIGIN=https://your-host`, a random `CEC_BOOTSTRAP_TOKEN`, and
`CEC_DATABASE=/data/cec.sqlite`; mount a persistent `/data` volume. Serve behind HTTPS.
Production sessions use Secure cookies, so plain HTTP is not an authenticated
production deployment. Container packaging is supplied; container execution must be
validated in the deployment environment.

## Integration status and remaining production work

**Working:** native workflows, document links, public calendar export, private meeting
subscriptions, weekly intake, episode evidence and quant outbox.
**Not connected:** Google OAuth, Slack, Canvas, Cornell SSO, email delivery, payments.
The interface says "not configured" for these; it never fabricates connected status.
Credentials, approved scopes and university agreements cannot be supplied by code.

This is a functional pilot, not the full multi-campus platform from the long-term
spec. Email verification/recovery is implemented but needs a live sender (doc 30).
Before broad use, add institutional SSO, account lifecycle
and end-to-end erasure, record-level sharing grants, attachment storage, pagination,
retention policies, off-machine backups, production recovery drills, alerting and live connector
workers. There is no automatic room reservation, payment collection, autonomous
outreach, private-message mining or validated prediction of founder success.

The directory shares only member-controlled evidence. It does not implement paid
firm subscriptions or per-firm access grants. Manual shared URLs remain under the
source's own access controls.

### Recommendation feedback loop

Members can explicitly request shared project suggestions on the overview. A versioned binary-token cosine baseline matches declared interests to project text, limits the slate to one project per owner, and suppresses declined projects for 30 days. This is project relevance, not a person or hiring score. Each decision records model/feature versions; visible cards create separate exposures; saves, dismissals, and self-reported collaboration outcomes are separate events. Ownership and current sharing are checked on every feedback request. No trained model, causal uplift, automated outreach, or recruiter eligibility decision is claimed. Before external discovery, add separate firm-specific permissions, retention/deletion workflows, authenticated buyers, and audited access grants; public profile sharing is not consent to selling data.

## Outgoing email

Verification, password recovery, officer invitation emails and verified-member task
notifications use an encrypted durable queue and a separate Node worker. Delivery is
**disabled by default**; local capture and mocked-provider tests do not establish a live
connection. See [email setup and operations](docs/30-outgoing-email.md), including sender
configuration, truthful delivery states and restore behavior. From web/ use
`npm run email:work`; production Compose includes a separate email service.

## Pilot validation and upcoming integrations

The email API suite includes a complete separate-officer/member workflow and a paired
SQLite backup/restore drill with application reopen and safe analytics replay. Run it
from web/ with `node scripts/cec-test-server.mjs --email`. This uses temporary synthetic
data and local email capture. See [prototype sequence](docs/31-integration-prototypes.md)
for CSV imports, calendar publishing, selected-email capture, document selection and
channel announcements; these provider prototypes are not yet connected.

## Officer workspace

Open `/clubs/cec/operations` from the Officer workspace link. Includes reviewed CSV
imports (contacts, roster prospects, registered-member attendance), meeting decisions
with linked task assignment, action overview, handoff packets/acceptance/export and a
revocable club calendar subscription. See [workflow guide](docs/32-officer-workflows.md).
Calendar publishing uses ICS polling, not direct Google/Outlook writes; external clients
need a reachable hosted URL. Email remains disabled while domain setup is deferred.
