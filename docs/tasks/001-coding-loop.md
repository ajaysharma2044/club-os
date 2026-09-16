# Task: Establish a repeatable coding and verification loop

Status: done (local setup; remote CI execution not yet verified)

## Acceptance criteria and result

- Repository instructions identify current runtime, workflow and review invariants: met.
- One command runs types, domain, Python, API/page, signal and build checks: met.
- Failures return nonzero and preserve evidence without running later steps: met.
- CI configuration uses the same command and retains logs: configured locally.

## Verification

On 2026-09-16 UTC, `npm --prefix web run check` passed all six stages using local
Node 26.0.0 and Python 3.14.7. CI remains configured for Node 22 and Python 3.12;
this local result is not a claim that a remote CI run has passed.

Evidence: `work/verification/2026-09-16T01-27-47.510Z-11775/result.json` and adjacent logs
(ignored local files, not committed). A separate isolated fixture forced the first check
to exit 23; the runner returned 1, recorded failure, and skipped later checks. Invalid
mode returned 2. Script syntax, documentation links and `git diff --check` passed.

## Review and limitations

Self-reviewed; no independent agent review was performed. Verification uses existing
test suites and is not a full browser audit or proof that MVP acceptance gates are met.
The full command requires exclusive use of this checkout's Next build directory and
test ports. Local preview was stopped for verification and restarted afterward.

The setup is a repo-level working convention with an executable check runner. It does
not launch autonomous coding sessions, configure remote required checks, or enable hosted
Codex review. No changes have been committed or pushed as part of this task.
