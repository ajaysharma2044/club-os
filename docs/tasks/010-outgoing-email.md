# Task: durable outgoing email for the CEC pilot

Status: ready for review (implemented locally)

## Acceptance criteria

- Verification and recovery work through explicit one-use actions; password recovery
  revokes sessions without granting membership or officer access.
- Officers can queue existing invitations; verified members receive assignment/revision
  notifications when their preference permits. Invalidated jobs cancel before transport.
- Durable encrypted jobs survive interruptions, deduplicate, retry with bounded provider
  idempotency and show truthful states. Disabled/capture modes never send real email.
- Major-update documentation accompanies implementation, frontend contracts and runbook.

## Scope and verification

Schema 3, Next.js email endpoints, module-level email UI, Node worker, production Compose,
restore invalidation. Ledgly outgoing-mail concepts adapted; mailbox ingestion deferred.
Pure/service and API tests, Python restore tests, full gate and browser coverage required.
No production sender configured and no external email sent.

## Review

Self-review. Corrected task deep links to existing #task-ID contract; bounded provider
retries below its 24-hour idempotency lifetime; restore cancels pending mail and tokens.

## Final verification evidence

- `npm --prefix web run check`: all six stages PASS (types, pure/service suites,
  Python, API/pages, signals and production build).
- Report: `work/verification/2026-09-17T03-19-49.386Z-89642/result.json`.
- Email HTTP suite: 30 checks, including actual assignment/revision hooks, invitation
  deduplication, verification, password recovery and session revocation.
- Pure email suite: encryption, purpose/expiry/one-use validation, atomic rollback,
  preference and membership cancellation, revoked invitation, mode isolation, lease
  expiry/recovery, immutable provider idempotency, transient/permanent failures and retry bounds.
- Python: 30 tests pass, including restore invalidating tokens and cancelling mail.
- Browser: isolated synthetic database on port 3120, local capture only. Desktop account
  settings and verification; 320×740 recovery request by keyboard, successful password
  change, consumed-link error, signed-out state, new-password login and invitation queue.
  Recovery and invitation pages both measured 320px document width at 320px viewport.
  Viewport emulation is not physical-device or assistive-technology certification.
- Local Node 26/Python 3.14; CI targets Node 22/Python 3.12. Docker/container execution
  and live Resend delivery were not tested. No external messages were sent.
- `git diff --check`: PASS. Self-review, not an independent reviewer.

Acceptance criteria implemented. Live sender/domain setup remains deployment work;
email defaults to disabled. No credentials were added to the repository. Changes are
local and uncommitted; no push performed for this update. Normal port-3000 preview
restarted after verification.
