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
- Event drafts/publication, capacity-aware RSVP and waitlist, officer attendance,
  per-event and calendar-wide ICS downloads.
- Recruitment applications, private reviews, acceptance into membership, coffee-chat
  slots with transactional booking and overlapping-time checks.
- Tasks with owner, due time, origin and project links; accept/submit/officer-approve cycle.
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
after mutations and can be retried from The record; there is not yet a background
scheduler or push synchronization.

The published frontend had no configured Convex deployment. This implementation is
an executable **single-server SQLite edition**, not a claimed Convex deployment.
Migrating to Convex or Postgres requires preserving transaction, identity, authorization,
outbox and historical-query invariants. Do not deploy it onto ephemeral serverless
storage or run horizontally against separate local databases.

## Hosting

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
spec. Before broad use, add verified email / SSO, password recovery, account lifecycle
and end-to-end erasure, record-level sharing grants, attachment storage, pagination,
retention policies, backup restore tests, operational monitoring and live connector
workers. There is no automatic room reservation, payment collection, autonomous
outreach, private-message mining or validated prediction of founder success.

The directory shares only member-controlled evidence. It does not implement paid
firm subscriptions or per-firm access grants. Manual shared URLs remain under the
source's own access controls.

### Recommendation feedback loop

Members can explicitly request shared project suggestions on the overview. A versioned binary-token cosine baseline matches declared interests to project text, limits the slate to one project per owner, and suppresses declined projects for 30 days. This is project relevance, not a person or hiring score. Each decision records model/feature versions; visible cards create separate exposures; saves, dismissals, and self-reported collaboration outcomes are separate events. Ownership and current sharing are checked on every feedback request. No trained model, causal uplift, automated outreach, or recruiter eligibility decision is claimed. Before external discovery, add separate firm-specific permissions, retention/deletion workflows, authenticated buyers, and audited access grants; public profile sharing is not consent to selling data.
