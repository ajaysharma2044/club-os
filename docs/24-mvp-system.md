# Club OS — MVP system scope

Status: proposed scope, 2026-09-15. Assumption: first prove the product with CEC on one
campus in a single-club deployment. This is a design recommendation, not an assertion
of launch readiness or a committed delivery schedule.

See [System design](23-system-design.md) for the broader architecture.

## 1. The MVP promise

An officer can run a weekly meeting and an upcoming event, members know what they owe,
completed work has a durable record, and the next leadership team can take over.

The smallest complete loop is:

1. An officer sets up the club and invites members.
2. The officer records meeting notes and confirms decisions.
3. A decision becomes a task with an owner and due date; the owner accepts it.
4. The member sees the task in Up next, completes it and links the result.
5. An officer reviews the result and the history preserves what happened.
6. Members RSVP to an event; organizers record attendance and an outcome.
7. A successor receives authority, open work, key documents and asset ownership records.

Meeting capture starts with manual notes or a pasted transcript that the contributor is
authorized to share. Automated recording/transcription is a later, separately consented
extension. The MVP must be useful without an AI service or live Google integration.

## 2. Required product surface

| Surface | MVP requirement | Repository starting point |
|---|---|---|
| Account and membership | Join, sign in, recover access, clear officer/member boundaries | Password sessions and invite/application flows exist; recovery and verified identity remain gaps in README-CEC |
| Home | Actions due, upcoming events, changed time/place, blockers | Up next is implemented |
| Meetings and work | Notes, confirmed decisions, project/task links, accept/submit/review, artifact URLs | Native meetings, projects and task workflow are documented as implemented |
| Events | Publish, RSVP/waitlist, calendar export, attendance, correction | Native workflows exist |
| Communication | In-app action visibility plus a reliable way to notify inactive users | Outgoing email flows/worker implemented (doc 30); live sender unconfigured |
| Continuity | Club-owned history, documents, asset custodian, role handoff, export | Asset register and export exist; end-to-end handoff needs explicit verification |
| Data controls | Explain visibility; support correction, revocation and deletion | Partial controls exist; full lifecycle remains a documented gap |

Existing money, recruitment, coffee-chat and CRM functions can remain available, but do
not expand them as prerequisites for this loop. An asset register records custodians and
handoff status; it is not a place to store bank or social-account passwords.

These status statements come from README-CEC.md and targeted code inspection, including
db.ts, quant.ts and upnext.ts. No application tests or live deployment were run for this
document; implementation presence is not an acceptance result.

## 3. Minimum runtime

- One Next.js application and its domain modules.
- One persistent SQLite application database; keep the existing derived quant database
  if retained, with coordinated recovery. Python remains required by existing wiring.
- A durable worker for notifications and retries, initially backed by a database jobs
  table or a carefully extended outbox. Run one supervised worker in the pilot topology.
- One transactional email delivery integration for verification, recovery and action
  notifications. This requires a configured provider and sender domain before launch.
- HTTPS, environment-managed secrets, error reporting, health checks and protected backups.
- Links to existing documents/artifacts. File hosting and automatic ingestion can wait.

Job records need kind, payload version, idempotency key, status, attempt count, next-run
time and a bounded error summary. Use atomic claims and expiring leases so a crashed
worker does not strand work. Bound retries and make terminal failures actionable.

Keep the user-facing product functional when analytics is unavailable. Do not add Kafka,
a graph database, a vector database or separate domain microservices for this scope.

## 4. Launch-critical system work

### A. Access and account lifecycle

- Verify account ownership and implement expiring, single-use recovery tokens.
- Enumerate and test officer/member/applicant permissions for every exposed object/action.
- Recheck role changes on subsequent requests and invalidate sessions where appropriate.
- Provide a handoff flow that cannot accidentally leave the club without an officer.
- Bound abusive login, recovery and invitation attempts without leaking account details.

### B. Reliable actions and notifications

- Verify that core state transitions and required history/outbox writes commit together.
- Ensure repeated submissions cannot duplicate tasks, attendance or deliveries.
- Send notifications for assignments, approaching deadlines and changed event time/place;
  provide preferences and avoid including private source material in email.
- Exercise provider failure, retry, worker restart and revoked-access cases.

### C. Recovery and operation

- Add versioned schema migrations and a documented deployment/rollback procedure.
- Back up both relevant SQLite stores safely, including WAL consistency; test restoration.
- Monitor request errors, job backlog/age, terminal delivery failures and backup freshness.
- Add pagination and bounds on list endpoints and payloads used by the pilot.
- Assign an operator and document how members report lost access or incorrect records.

Proposed pilot targets: at most 24 hours of data loss after a disaster and restoration
within four hours during staffed support. These are targets to verify and revise before
launch, not current guarantees. Measure interactive latency against the actual pilot
roster and expected event check-in burst before setting a performance commitment.

### D. Data lifecycle and trust

- Publish a simple inventory of collected data, who sees it and why it is retained.
- Implement export and an end-to-end deletion/revocation path covering derived records.
- Define backup expiry and ensure restores cannot resurrect revoked access or erased data.
- Preserve corrections without treating missing outcomes as failures.
- Keep private messages outside evidence and analytics, including job and log payloads.

## 5. Single-club versus multi-club MVP

The current users table has a global role and core records do not consistently carry
club ownership. It is a single-club pilot, not a shared multi-tenant service.

For the first CEC pilot, enforce that boundary explicitly. Before onboarding another club
into a shared deployment, add club entities, memberships, role assignments and club-scoped
records; migrate existing CEC data; and test cross-club isolation on reads, mutations,
exports, invitations, background jobs and derived results. Never accept a browser-provided
club ID as sufficient authorization.

If the initial launch must include several clubs in one product, this becomes launch-critical
work rather than a later phase. Separate single-club deployments can provide temporary
isolation, but do not implement shared identities or a cross-club graph.

## 6. What waits

- Automatic meeting recording, transcription and AI task extraction.
- Full bidirectional Drive, Calendar, Slack, Canvas and SSO synchronization.
- Employer, sponsor, vendor and VC marketplaces; payments and contracting.
- University and national administrator dashboards.
- Cross-club profiling, learned ranking, causal optimization and advanced predictions.
- Native document editing, large attachment storage and a full accounting system.

Existing experimental intelligence may remain opt-in, but it is not a dependency for
the MVP promise and does not count as validated product value.

## 7. Acceptance gates

Before inviting the pilot cohort, demonstrate these with synthetic accounts and then
repeat the operational loop with consenting pilot users:

1. Officer invites member; member can regain access without developer database edits.
2. Meeting decision → accepted task → submitted artifact → approval works end to end.
3. Event publication, concurrent capacity-limited RSVPs, check-in and correction work.
4. Unauthorized users cannot access private records through guessed IDs or exports.
5. Failed delivery retries after restart; repeated requests do not duplicate effects.
6. Officer handoff preserves records and removes the former officer's authority.
7. Backup restores to an isolated environment with expected records and access rules.
8. Revocation/deletion blocks access and invalidates affected derived data.
9. The core weekly workflow succeeds while the quant service is unavailable.

Run the repository's existing type, API, pure-domain, build and Python checks when
implementing these changes. Add focused tests for the failure modes above; do not infer
launch readiness from the presence of test files.

## 8. Prove use before expanding

Measure club setup completion, invitation acceptance, weekly officer and member actions,
accepted tasks reaching reviewed outcomes, events with recorded attendance, and whether
officers can run their next meeting from the stored record. Count explicit operational
actions; do not mine messages. Collect short qualitative feedback about duplicate work
and missing information.

Use the first four weekly cycles as an initial product checkpoint, not evidence of
semester retention. A simulated handoff tests mechanics; a real term transition tests
whether the continuity promise holds. Agree on numeric adoption thresholds with the
pilot club before evaluation rather than inventing success after seeing results.

## 9. Build sequence

1. Exercise the existing weekly loop and inventory concrete failures against these gates.
2. Close account, permission and handoff gaps.
3. Add durable jobs and one notification channel.
4. Complete backup/restore, migrations, monitoring and data lifecycle controls.
5. Run the CEC pilot, fix friction and observe repeated use.
6. Add shared multi-club tenancy before expanding within a single deployment.
7. Choose the next integration or intelligence experiment from demonstrated needs.

The immediate objective is a dependable operating loop. The repo already has enough
feature breadth to test that premise; new marketplaces are not the next constraint.
