# Task: five officer MVP improvements

Status: implemented and verified locally

## Acceptance criteria

- CSV sponsor, roster-prospect and attendance imports provide preview, column mapping,
  errors, duplicates and explicit atomic save; repeat requests do not duplicate records.
- Saved meeting notes lead to officer-confirmed decisions and assigned tasks with owners,
  deadlines and a durable meeting reference; stale or repeated confirmations are safe.
- An officer overview lists overdue work, review requests, upcoming events and sponsor
  follow-ups with links into the real workflows.
- Handoff packets capture commitments/documents/relationships/asset custody; the receiving
  officer acknowledges a checklist and accepts it. Export supports an offline handoff.
- Club calendar subscriptions retain event UID, increment sequence on edits, publish
  cancellation when withdrawn to draft, and revoke/rotate links. Private draft edits must
  never enter cancellation content. External providers refresh on their own schedules.

## Scope and design

Dedicated /clubs/cec/operations UI and officer-tools endpoints. Existing native record
mutation/evidence paths are reused, with composable SQLite savepoints for atomic batches.
Roster imports create prospects, not credentials, verified identities or membership.
Attendance imports require existing registrations and explicit present/absent values.
Handoff review does not transfer roles or credentials. Existing People controls perform
leadership transfer; source-system account access must be changed in the source system.
Calendar delivery uses a subscribable ICS feed, not direct OAuth writes or instant push.
The user asked to skip email; mail configuration is unchanged and remains disabled.

## Verification

All six stages of `npm --prefix web run check` passed: types, pure/domain tests,
Python tests, API tests, signals tests and production build. Evidence:
`work/verification/2026-09-17T23-39-58.813Z-13414/result.json`.

Focused officer-tools tests cover imports, atomic rollback, replay, meeting
linkage/versioning, handoff permissions and calendar updates/cancellation. Extended
API tests cover officer/member boundaries and routing.

Actual browser checks used synthetic accounts and data with email disabled:
- Desktop dashboard, invalid and successful CSV import, and meeting decision/task creation.
- Receiving-officer checklist and acceptance; sender checklist remained disabled.
- Mobile calendar enable/disable, accepted handoff and duplicate import at 320px width.
  Document width was 305px within the 320px viewport, with no horizontal page overflow.
- Repeated contacts were marked duplicates and the zero-row import button was disabled.

Local checks ran on Node 26 / Python 3.14; CI uses Node 22 / Python 3.12.
Live provider subscriptions, container deployment, file-picker upload and export download
were not browser-verified. These checks do not certify physical devices or assistive technology.

## Review

Self-review addressed stale meeting draft versions, stale import previews, private draft
content in calendar cancellation snapshots, import source-row references, sponsor links
opening the Opportunities tab, and receiver-only versioned handoff acceptance.
Fixtures used synthetic accounts and data. Changes remain local and uncommitted;
no push or deployment was performed. Live calendar subscription requires a publicly
reachable URL. The normal local preview was restarted on port 3000.
