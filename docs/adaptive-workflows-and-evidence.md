# Adaptive workflows and episode evidence — executable pilot

Club OS now connects native workflow actions to a visible evidence record. A project,
event, meeting, or standalone task becomes an episode; a task linked to a project
joins that project's episode. This is a single-organization CEC implementation in
the existing SQLite application, not a deployed multi-campus service.

## What a student experiences

1. Open `/cec/intake` for a weekly check-in. Optionally paste your own background,
   correct suggested context, and confirm it. Answer or skip up to three questions.
2. In Workspace → Inbox, select messages and review a meeting suggestion. Confirm
   the date, Eastern time, duration, location, and invitees. The conversation alone
   does not establish that anyone accepted an invitation.
3. Open `/cec/schedule` to accept invitations and create a personal calendar
   subscription. An explicit preference can accept future club invitations automatically.
4. Accept assigned work, submit it, request a revision, or record a blocker.
5. Open The record to see episodes, personal activity, sources, blockers and results;
   add a correction or save a dated snapshot. Club episode records are visible to
   signed-in members. These records are not included in the public directory.

Example: a CEC member accepts a room-booking task linked to a Startup Hours planning
project. A pending university approval becomes a blocker. An officer records its
resolution; the member submits the task and an officer approves it. The resulting
chain retains the assignment, actual acceptance, blocker, resolution, submission,
and review. An episode outcome such as “18 participants planned” is explicitly a
reported result, not attendance verification.

## One event stream, distinct meanings

The operational mutation and corresponding `activity_events` insert occur in the
same transaction. An audit ID supplies an idempotent source key when an existing
workflow has an audit record. Event rows carry organization, episode, actor, subject,
object, family, event time, observation time, source reference, evidence category,
visibility, policy version and context. For native writes, event and observation
time coincide. SQL triggers prevent in-place event edits/deletes.

The schema defines 15 action families: JOIN, INITIATE, COMMIT, EXECUTE, HANDOFF,
COORDINATE, HELP, REQUEST_HELP, DECIDE, COMMUNICATE, REVIEW, REVISE, ESCALATE,
COMPLETE and OUTCOME. Only families supported by actual instrumented actions are
emitted. Defining a family does not claim that every connector or workflow exists.

| Recorded action           | Meaning preserved                                                               |
| ------------------------- | ------------------------------------------------------------------------------- |
| Task assignment           | Responsibility offered/assigned; acceptance remains unknown                     |
| Assignee accepts          | COMMIT; an officer cannot accept on someone else's behalf                       |
| Task submitted            | COMPLETE family, explicitly `submitted_for_review`, self-reported               |
| Officer approves          | REVIEW; counterparty confirmation only when reviewer differs from assignee      |
| Revision requested        | REVISE; does not count as a second accepted commitment                          |
| Blocker reported/resolved | Category, original note, resolver, resolution and elapsed time                  |
| RSVP                      | Registration; no claim of attendance                                            |
| Officer attendance record | Officer-recorded presence/absence, attributed to that officer                   |
| Chat meeting confirmed    | Scheduling coordination with source message IDs                                 |
| Meeting invitation        | Pending; acceptance requires response or prior auto-add preference              |
| Meeting cancellation      | Cancelled plan; does not mean no-show                                           |
| Episode result            | Completed, cancelled or unsuccessful; reported summary and optional metric/unit |

The operational task endpoint prevents status changes through generic edits,
creation as already-completed work, and reassignment of accepted commitments.
Project links remain stable after task creation. Cancelling accepted work and
assigning a new task preserves the change in responsibility.

The graph projection has person, episode and operational-object nodes. Its edges
carry actor, subject, family and exact evidence ID. A reviewer acting on someone's
task is distinguishable from that person acting. These are observed workflow
relations; the projection does not invent friendship, leadership or skill claims.

Corrections append a statement referencing the original event. The original stays
visible with its correction. Tasks with disputed evidence are excluded from the
personal completion summary; the current pilot conservatively leaves them excluded
until a future adjudication workflow exists. A correction is not a silent rewrite
of the underlying task, calendar, or original evidence.

## Mathematical policy that is running

The weekly selector uses a versioned, untrained information-gap proxy:

```text
freshness(age_days) = 2 ^ (-age_days / 28)
gap = 1 if missing, otherwise 1 - freshness
utility(question) = log2(option_count) * gap * relevance - 0.35 * burden_minutes
```

The uniform option entropy is a policy assumption, not learned expected information
gain. Relevance depends on check-in purpose and recent confirmed answers. A launched
project changes the needs prompt; a team-building need increases relevance of
connection, contribution and availability questions. Expired context cannot silently
keep steering later questions. Need/availability refresh after seven days; other
core answers after 28. Weeks start Monday UTC. At most three selected questions
are issued per user/week, including skipped questions.

Selection, visible exposure, answer and skip are separate records. An answer requires
the authenticated user's exposed question; retries are idempotent and other users
cannot answer it. Candidate utilities and the chosen prompt/context are saved with
the policy version. Coverage is the fraction of six configured fields answered;
freshness is average recency weight. Neither measures a person's quality or truthfulness.

This check-in becomes available on a new week's visit. It does not run a background
LinkedIn poll, send weekly messages, or claim to know whether a student's current
work changed without an observation. Background text preview is keyword-based and
requires confirmation. Raw pasted text is not retained; confirmed fields, optional
source URL, provenance and dates are. No LinkedIn page is fetched. Officer access to
these weekly profiles requires the student's separate sharing opt-in.

Users can remove a field's full history or clear their entire adaptive profile.
Field deletion also removes that user's check-in sessions/decision snapshots, which
may contain the old value, while retaining other field facts. This permits restarting
the weekly session after explicit erasure. Clearing this profile does not erase
their account or the club's operational history.

Personal work features are currently descriptive:

```text
eligible = distinct accepted tasks with no disputed evidence
completion_fraction = officer_approved / (eligible - cancelled)
unresolved = eligible - cancelled - officer_approved
```

Zero denominator produces null. In-progress work is unresolved, not a failed trial.
Repeated submissions or revision requests do not inflate acceptance counts.
Club blocker summaries retain open counts and reason categories; median resolution
time uses resolved blockers only, with open observations explicitly censored.
No personality, reliability, employability or universal student score is inferred.

`POST /api/cec/evidence/snapshot` saves the caller's versioned features, source IDs,
input hash, `as_of` and `computed_at`. Both event time and observation time must be
at or before the cutoff. It computes from the historical events, not mutable current
task state. An identical cutoff and evidence set returns the same snapshot. Later
corrections affect later snapshots without rewriting earlier snapshots. The latest
20 saved snapshots appear in the record export and UI.

The existing Python beta-binomial event-attendance forecast and Monte Carlo planner
remain available. Episode features currently run in the TypeScript backend against
the same operational database; they are not yet a trained Python factor pipeline.

## Calendar behavior and limits

Chrono parses explicit date/time candidates from at most 12 selected native channel
messages, referenced to each message's timestamp and Eastern timezone. A small
location matcher recognizes several Cornell venue names; all fields remain editable.
A later ambiguous “7:30” leaves time blank instead of silently borrowing an earlier
AM/PM. Conflicting alternatives remain visible for review. The browser rejects
ambiguous/nonexistent Eastern wall times at daylight-saving transitions.

Confirmation creates one canonical meeting per proposal. The organizer is accepted;
other members are pending unless they explicitly enabled auto-add. Acceptance does
not establish attendance. There is no free/busy lookup, room reservation, email
invitation, native push notification, or direct Google OAuth write.

Personal feeds use a 256-bit bearer token; only its hash is stored. Anyone holding
the URL can read that feed, so keep it private. Rotate/revoke invalidates old URLs.
The feed includes only meetings the user previously accepted, with stable UIDs,
sequence numbers and cancellation tombstones. It contains no chat transcript.
Revocation stops future fetches; it cannot erase copies already downloaded elsewhere.

After HTTPS deployment, users can subscribe in Google Calendar or Apple Calendar.
Calendar clients control refresh timing; updates are not instant. Localhost URLs
are unsuitable for external calendar clients. Production access logs must redact
the feed token query parameter. Cancelling a meeting publishes its cancellation;
rescheduling currently requires cancellation and a new confirmed proposal.

References: [Chrono](https://github.com/wanasit/chrono),
[Google calendar subscriptions](https://support.google.com/calendar/answer/37100?hl=en),
[Apple calendar subscriptions](https://support.apple.com/en-au/guide/calendar/icl1022/mac).

## Extension boundary

The implemented path is workflows → canonical events → episodes → graph projection
→ reproducible descriptive features. Weekly intake also has a separate question
decision/exposure/answer loop. Existing project suggestions retain their separate
recommendation/exposure/action/outcome records.

The broader factor research system needs labelled outcomes and opportunity exposure
before fitting models. Next stages are immutable artifact revisions/review feedback,
meeting action-item proposals, confirmed CRM interactions and economic outcomes,
connector source observation/replay, and a shared research export contract. Then add
context-specific feature definitions, temporal validation, calibration and comparison
against simple baselines. Cohort normalization, hierarchical models, signal tournaments,
causal experiments and sequence learning are not implemented or validated here.

Additional boundaries: no historical task behavior is fabricated during migration;
older objects acquire episodes when the next supported action occurs. No general
voice capture, transcript ingestion, Slack/Docs connector, private-message analysis,
employer access grants, trained source-reliability weights or automated interventions
are active. The organization ID is fixed to CEC; a column alone is not tenant isolation.

Before broad rollout, add pagination, governed operational-data erasure and retention,
attestation adjudication, episode merge/relink tools, incremental graph/feature jobs,
record-level grants, durable connector workers and restore testing. Append-only SQL
triggers are application safeguards, not protection against a database administrator.
Institutional room approval still happens through the university's authorized process.
