# Club OS task workflow audit

Date: 2026-09-15 (America/Los_Angeles)

## Verdict

The assignment/review state machine works in the tested flow, but the workflow does not
yet preserve the submitted work or the reviewer's requested changes. It is usable as a
status tracker; it does not yet meet the MVP's complete work-and-evidence handoff.

## Scope and method

Audited the existing local checkout, including the previously implemented officer-only
revision guard. Used an isolated SQLite database and Next development server at
127.0.0.1:3120, with synthetic Audit Officer and Audit Member accounts. No real club data
was used. Account setup and membership approval were fixture preparation through the API,
not audited onboarding flows.

Browser sequence: officer sign-in → empty Tasks screen → assign “Audit: prepare sponsor
briefing” → member sign-in → accept → submit → officer sign-in → request revision →
member resubmission through API → browser reload → officer approval. Final task state
and approval evidence were independently read back through the API.

This audit does not cover meeting creation, event attendance, notifications, deployment,
mobile layout, cross-club isolation or every possible permission combination. It is an
interactive workflow audit plus focused API probes, not a claim that all MVP gates pass.

## What passed

| Check | Result |
|---|---|
| Empty Tasks screen | Clear assignment prompt for officer |
| Officer assigns a task | Owner, deadline and free-text origin persist |
| Member accepts | Status becomes accepted; commitment evidence recorded |
| Member submits | Status becomes submitted; self-reported transition recorded |
| Officer requests revision | Status returns to accepted; REVISE event recorded |
| Member resubmits | API accepts transition back to submitted |
| Officer approves | Browser shows completed; API read confirms persistence |
| Approval provenance | task.completed has counterparty_confirmed evidence |
| Anonymous completion attempt | HTTP 401 |
| Member approval attempt | HTTP 403 |
| Member revision attempt | HTTP 403 |
| Denied actions | Task record and version remain unchanged |
| Member declines unaccepted assignment via API | HTTP 200; task becomes cancelled |

## Findings

### 1. High MVP priority: submission contains no work product or completion note

**Reproduce:** accept a task as its member assignee, then click Submit. The task immediately
becomes submitted. There is no dialog for an artifact URL or explanation. Sign in as an
officer: the card shows the original title, owner, deadline and origin, plus review buttons.
There is no submitted material to inspect from that card.

**API confirmation:** a resubmission request containing additional artifact_url and
submission_note fields succeeds, but neither field appears in the persisted task or its
submission evidence. These are not supported fields; adding them to the request cannot
complete the missing workflow.

**Impact:** a document-producing task can reach officer-approved completion while the
actual document remains outside the task record. A future leader can see that someone
approved it, but cannot discover what was submitted from that record alone.

**Implementation locations:** web/components/cec/Workspace.tsx:1207;
web/lib/cec/service.ts:340; web/lib/cec/evidence.ts:272.

**Recommended change:** a Submit work dialog with completion note and optional artifact
URL. Require a meaningful note or artifact; allow non-document work to use a note. Store
each submission revision with actor/time, preserve previous revisions, and present the
latest submission to the reviewer. A URL is a reference, not proof that the source is
accessible or verified. Keep source sharing permissions intact.

### 2. High MVP priority: requesting revision records no actionable feedback

**Reproduce:** as an officer, click Request revision on a submitted task. Its status
immediately becomes accepted. No feedback field appears. The resulting REVISE evidence
contains the status transition but no explanation of what the member should change.

**Impact:** the member must ask elsewhere why their work was returned; the reasoning
does not survive in the task record. Revision history cannot explain the actual review.

**Implementation locations:** web/components/cec/Workspace.tsx:1255;
web/lib/cec/service.ts:340; web/lib/cec/evidence.ts:272.

**Recommended change:** collect a required revision reason, store it with reviewer,
timestamp and the submission revision being reviewed, and display it beside the task's
resubmission action. Preserve it after resubmission and approval.

### 3. Medium MVP priority: members cannot decline through the Tasks interface

**Reproduce:** open an assigned task as its member assignee. Accept is the only task
action. Cancel is rendered only for officers. An API call from that member to move the
same unaccepted assignment to cancelled succeeds, confirming that the backend supports
declining but the Tasks interface does not expose it.

**Impact:** members who cannot take the work must ignore the assignment or contact an
officer elsewhere. The opportunity ledger's distinction between refusal and officer
withdrawal is harder to capture through normal use.

**Implementation locations:** web/components/cec/Workspace.tsx:1194 and :1264;
web/lib/cec/service.ts:331.

**Recommended change:** add Decline next to Accept for the assigned member while the task
is assigned. Retain the existing API distinction between member decline and officer
withdrawal. Do not extend this to unrestricted cancellation of accepted work.

## Recommended next coding slice

Implement submission evidence and reviewer feedback together, then expose Decline.

Acceptance criteria:

1. A member submits a note/artifact; refresh preserves it and the officer can inspect it.
2. A revision request includes a reason visible to the member.
3. Resubmission retains earlier work and feedback; approval identifies the reviewed version.
4. Unauthorized actions and stale reviews cannot overwrite a newer submission.
5. Decline is available only to the intended member on unaccepted work.
6. API regression tests and a repeat browser run demonstrate all of the above.

## Evidence and delivery status

Synthetic task ID: 8ce31152-303c-4a2f-a81e-489ddb753f0f.
Local structured probe results: club-os/work/workflow-audit/results.json.
Probe script: club-os/work/workflow-audit/probe.py (reads ignored local test credentials).
These are local audit artifacts and must not be committed with credentials or databases.

No product code was changed during this audit. Findings are verified gaps and proposed
fixes, not completed implementation. Browser date entry needed a native accessibility
action after a Playwright fill failed; that automation issue is not counted as a product
bug. The audit server was stopped after collecting evidence.
