# Task: Keep submitted task revisions under officer review

Status: done locally

## Problem and acceptance criteria

The UI exposes Request revision only to officers, but the task.status API currently
allows a member assignee to move submitted work back to accepted. This withdraws work
from review and records a REVISE event without an officer's decision.

- A member assignee's submitted → accepted request returns 403.
- The rejected request leaves task state, version, audit and evidence unchanged.
- An officer can still request revision; the assignee can resubmit and receive approval.
- Initial assigned → accepted remains an assignee action.

## Scope

Server authorization in web/lib/cec/service.ts and HTTP regression coverage in
web/tests/cec-api.mjs. No schema migration or UI change is needed; the interface already
uses the intended permission boundary.

## Verification and review

The new HTTP regression failed before the fix: task.status returned 200 instead of 403
for a member's revision request. Added an officer check before any task mutation for
submitted → accepted. Existing acceptance and officer revision/resubmission paths remain
covered by the same integration suite.

`npm --prefix web run check` passed all six stages (types, pure domain, Python, API/pages,
signals and production build) on Node 26.0.0 / Python 3.14.7. Local evidence is in
`work/verification/2026-09-16T01-42-43.667Z-15364/result.json`.
`git diff --check` passed. Self-review confirmed the guard executes inside the existing
transaction before data, audit, evidence or outbox writes. No UI change or migration.

Changes are local and have not been committed or pushed. Remote CI on Node 22/Python 3.12
has not been run. This fixes one task-review boundary, not every MVP acceptance gate.
