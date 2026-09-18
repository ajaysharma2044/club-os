# Officer workspace: imports, meetings, overview, handoff and calendar

Implementation entry point: `/clubs/cec/operations`, linked from CEC workspace screens
for officers. Each endpoint rechecks current officer membership. Members/applicants
cannot access the dashboard, import data, create packets or change calendar settings.

## Imports

Choose sponsor contacts, roster prospects or attendance; upload/paste CSV; optionally
map source headers; preview; resolve invalid rows; confirm save. Limits are 48 KB and
100 data records per request, within the existing 64 KiB JSON request limit. Standard
quoted commas/newlines, escaped quotes and UTF-8 BOM are supported. Blank records are
ignored; preview numbers identify parsed CSV records, not physical multiline positions.

Contacts require name, organization and email. Optional relationship defaults to Sponsor;
notes are bounded at 2,000 characters. Existing email matches and duplicates within the
file are shown as skipped; no existing contact is merged or overwritten. Roster imports
create prospects visible in the Imports view; an officer uses People to issue invitations.
They never create passwords, grant roles, verify emails or enroll someone silently.
Attendance requires a selected event that has started, an active member already registered
for it, and explicit present/absent. Conflicting existing attendance needs review in the
original event; missing/unmatched rows never become absence evidence.

Preview is read-only. Commit recomputes validation/matches and compares the preview
revision. Changed matches return 409 and require a new preview. Invalid rows block the
whole batch. Canonical native changes, evidence/outbox writes and batch metadata commit
atomically through nested SQLite savepoints. A unique kind/fingerprint makes repeated
commits return the previous result. Raw files are not retained. Formula-like text stays
literal text; this implementation exports no CSV and never evaluates formulas.

Tables: import_batches (actor, fingerprint, result IDs/counts and accepted-row references, timestamp), roster_prospects
(name/email/importer/time). These follow the existing lazy table initialization and CEC
organization-guard pattern. Native contacts/attendance remain in their existing tables.
Batch metadata does not expose raw CSV or private notes to analytics.

## Meeting follow-ups

Save meeting title, time and authorized notes/agenda; choose a saved meeting; review the
confirmed decision; add at most 20 task titles, owners and deadlines; confirm. This is a
human-reviewed workflow, not an AI extraction or recording/transcription service.
Decision update and all assignments commit together. The existing task validation and
assignment/evidence machinery is reused. `meeting_followups` links meeting and request
ID to resulting task IDs; tasks also retain the meeting title in their origin field. Reopening the meeting lists
its assigned follow-ups with task links.
Stale meeting versions fail. Repeating an identical confirmation is safe; reuse of a key
for different decisions/tasks returns a conflict. General notes remain editable in the
original meeting screen. Once tasks are assigned, members accept/submit through Tasks.

## Officer overview

Derived directly from current records: unfinished overdue tasks, submitted work awaiting
review, upcoming published events and open sponsor opportunities. Links return to task
review, Events or Money. Counts are operational facts; they are not hidden scores or
predictions. Records refresh on opening the page and via Refresh officer records. Sponsor links open the Opportunities tab directly.
Continuity checks surface asset-access gaps and roster prospects for review; prospects
who have since become members/officers are excluded.

## Handoff packets

Create a dated packet for another current officer. Promote the incoming officer in People
first, create and review the packet, then transfer/demote the outgoing officer. Keep both
officers authorized until packet preparation is complete. A snapshot preserves open tasks, document links, open sponsor opportunities
and asset-custody records, plus the outgoing officer's notes. All current officers can
review packet contents; only the named receiving officer can check items and accept.
Version checks reject stale edits; accepted packets are immutable through this API.

Checklist: review commitments, confirm document access, verify account/asset custody,
review sponsor follow-ups. Acceptance records acknowledgement, not external permission
changes or proof that credentials were rotated. JSON export includes the snapshot and
review state. Source links retain their original access controls. No credentials belong
in packet notes; use the existing asset register to record custodians and vault locations.
Table: handoff_packets with owner/recipient account FKs, snapshot, checklist, version and
acceptance time. Organization guards and current officer checks protect access.

## Club calendar publishing

Enable a tokenized ICS subscription. Add the URL in Google Calendar or Outlook using
that product's web-calendar subscription UI. Enabling again rotates the link and requires
subscribers to replace the old URL. Disable rejects future feed requests. Only the token
hash is stored; the raw URL is revealed once. The URL grants access only to published
club events, not member calendars, attendance, meetings or private draft content.

Provider guidance: [Google calendar subscriptions](https://support.google.com/calendar/answer/37100)
and [Microsoft subscription refresh behavior](https://support.microsoft.com/en-us/outlook/calendar-sharing-in-microsoft-365).

The feed uses stable event UIDs and native record versions as SEQUENCE. Editing time or
location updates the same event. A previously observed published event returned to draft
becomes CANCELLED, preserving its last published content; new private draft edits are
not exposed. Closed events already included remain historical events. The
club_calendar_events table retains the last published snapshot for cancellation safety.
A feed that has never observed an event need not publish its cancellation.

This is subscription publishing, not direct writes into an existing Google/Outlook
calendar. Polling frequency and cancellation display depend on the subscriber. A URL on
localhost cannot be fetched by Google/Outlook servers; external use needs reachable
hosting. Do not promise immediate propagation. Avoid logging query strings on the
production feed endpoint. Subscription tokens can be rotated without changing event IDs.

## Operations and verification

Take a normal pipeline backup before rollout. Existing backups include the new SQLite
tables; there is no destructive migration. The API initializes them on first use.
Email stays disabled, as requested. No external provider credentials are needed for
local use. Calendar connection through a hosted subscription needs deployment testing.

`npm run test:officer-tools` covers the domain contracts. `npm run test:api` includes
HTTP import/calendar routing and authorization. Full gate and actual browser evidence
are recorded in [task 012](tasks/012-officer-workflows.md).
