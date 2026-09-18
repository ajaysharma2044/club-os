# Club OS coding workflow

## Context

- Read README-CEC.md for runtime facts, docs/23-system-design.md for design direction,
  and docs/24-mvp-system.md for proposed MVP scope. Read relevant code before editing.
- The running product is a single-CEC Next.js/SQLite app with a Python companion.
  Earlier research and Cursor session notes contain superseded stack and product claims.
- Current user instructions take precedence. Do not infer remote publishing authorization
  from an old editor rule reporting another session's standing request.

## Working loop

1. Inspect git status and preserve unrelated changes and local data.
2. Define one bounded outcome and observable acceptance criteria. For substantial work,
   use docs/tasks/TEMPLATE.md; record evidence in that task when finished.
3. Implement the smallest complete vertical slice. Add regression coverage for real
   failure modes. Do not weaken checks to obtain a green run.
4. Run focused checks during iteration, then the applicable verification command below.
5. Review the diff for correctness, access boundaries and missing failure handling.
   Fix actionable findings, rerun affected checks, and review the final diff.
6. Report behavior changed, verification evidence, remaining limitations and local/remote
   delivery status. A failed or skipped check is not a pass.

Use one implementation agent by default. A separate read-only reviewer can be useful
when the user requests delegation; identify self-review honestly otherwise. Concurrent
implementations need separate worktrees, distinct test ports and separate databases.
Do not run a recurring or unattended agent loop unless requested.

## Setup and verification

- Match CI with Node 22.13+ on the Node 22 line (.nvmrc), Python 3.12, and npm.
- Install: `npm --prefix web ci`.
- Initialize development configuration only if absent: run `node scripts/cec-init.mjs`
  from web/. Never print, commit or overwrite existing secrets.
- Targeted checks: existing `npm --prefix web run test:<suite>` commands.
- Fast gate: `npm --prefix web run check:fast` (types, pure suites, Python tests).
- Full gate: `npm --prefix web run check` (fast gate, API/pages, signals, production build).
- Run full verification before declaring runtime, dependency or CI changes ready. Docs-only
  changes need link/content review and `git diff --check`, not application tests.
- Verification logs and a JSON result are written under ignored work/verification/.
- Full verification owns ports 3100/3111 and web/.next build output. Stop this checkout's
  preview before running it, or use an isolated checkout. Do not kill unrelated processes.
- Test runners use synthetic temporary databases. Never point them at a real club database.
- UI changes additionally require exercising the changed flow in a browser, including
  relevant empty/error/permission states. HTTP page rendering is not browser verification.

## Code Review Rules

- Flag authorization based solely on a client-provided ID, stale role, or UI visibility.
  Reads, writes, exports and jobs need server-side checks.
- Preserve atomic state/history/outbox writes, safe retries, RSVP capacity and workflow
  transition invariants. Missing outcomes must not become recorded failures.
- Private messages and their interaction graph must stay out of evidence, features,
  quant, analytics and sensitive logs. Explicit scheduling selection is not blanket consent.
- Person-level external sharing must use authorized evidence, not hidden scores.
  Revocation must affect derived access as well as source visibility.
- Preserve occurred-at versus observed-at semantics and prediction cutoffs. Do not label
  experimental factors as validated or configuration as a working provider connection.
- Flag migrations that can lose data or erase provenance, and deployment changes that
  silently place persistent SQLite state on ephemeral storage.
- Report concrete bugs with file/line, trigger, impact and a remedy; avoid speculative
  findings and formatting complaints already covered by tools.

## Frontend conventions

- Read docs/29-frontend-patterns.md before changing the CEC frontend.
- Update that guide in the same change when adding shared components or changing
  data lifecycle, dialog, form, styling, or responsive interaction contracts.
- Keep stateful components at module scope, use shared dialog primitives, and record
  actual breakpoint/keyboard/browser coverage in the task document. Do not equate
  viewport emulation with physical-device or full assistive-technology certification.

## Documentation for major updates

Every major update must include documentation in the same change: the user-visible
behavior, system/data contracts, configuration and operations, verification evidence,
and known limits. Update the relevant design/frontend/runbook guide and docs index;
record acceptance criteria and actual results under docs/tasks/. Keep README runtime
claims consistent with implementation. Configuration and mocked tests are not proof
of a live provider connection. Never put credentials, tokens or private data in docs.
