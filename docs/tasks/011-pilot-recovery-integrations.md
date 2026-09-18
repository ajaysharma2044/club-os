# Task: prove the officer/member workflow and scope integration prototypes

Status: completed locally; deployment pending host configuration

## Acceptance criteria

- Separate officer and member accounts complete email invitation → join → verification
  → task assignment → submission → officer revision → resubmission → approval.
- Captured notifications target the member and correct task; private work/review content
  stays out of notification bodies. Member cannot email invitations or approve revisions.
- Back up the actual synthetic application/quant SQLite databases, restore into a new
  location, reopen using application initialization, and preserve task/audit history.
- Sessions and email tokens are invalidated; queued/processing mail cannot replay.
  An interrupted analytics acknowledgement replays without duplicate quant records.
- Document integration prototype order, reusable code and boundaries; distinguish local
  validation from production deployment and live provider operation.

## Implementation

Extended `web/tests/cec-email-api.mjs`, run by the existing isolated test-server harness.
Uses the same HTTP routes as the UI and the real local-capture email worker. The drill
calls the production pipeline backup/restore/once/status CLI against synthetic data only.
No real club data, account, mailbox, chat channel or provider is changed.

Prototype scope is in doc 31. No additional connectors or CSV importer are implemented
by this task. Provider documentation was checked for permission and transport choices.

## Verification

- `node scripts/cec-test-server.mjs --email`: PASS; 49 HTTP/page checks plus workflow,
  recipient/body, task history, authorization, snapshot integrity, foreign-key, session/token,
  pending-mail cancellation and analytics replay assertions.
- Output: `work/verification/pilot-integrations/pilot.log`.
- Paired backup → restore → replay → fresh application DB initialization: PASS in 415 ms
  for this tiny synthetic dataset. This is not a production recovery-time objective.
- `git diff --check`: PASS. Reviewed all newly introduced documentation links.
- Provider/reference checks: official Google Workspace, Microsoft Graph, Slack, Discord
  and GroupMe documentation linked directly from doc 31.

This task changes tests and documentation, not application runtime/UI.
The prior full gate remains recorded in task 010; the extended email suite is the relevant
check for this change. No new browser coverage is claimed.

## Deployment constraints

No deployment target/domain has been supplied; requested asynchronously. Docker and
restic are unavailable on this local host. No production deployment, container test,
off-machine recovery drill or real email delivery is claimed.

Reviewer: self-review. Changes remain local and uncommitted.
