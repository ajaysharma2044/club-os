# Task: Reviewable task submissions

Status: done

## Problem and acceptance criteria

The workflow audit found that task completion had no submitted work, revision
feedback disappeared, and members could not visibly decline assignments.

- Submission requires a note or an HTTP(S) artifact link.
- Submissions and officer feedback remain visible after resubmission and approval.
- Revision requires feedback; review records identify the submission reviewed.
- Only officers review; only assignees submit. Members can decline assigned work.
- Stale submission/review versions fail without mutations.
- General edits cannot forge or erase work history.

## Scope and compatibility

Task status service, server-owned task JSON history, evidence capture, Workspace,
Up next actions, and API/signal/Up next regression tests. No schema migration or
new dependency. Legacy tasks have empty history; legacy reviews have a null
submission reference, explained in the UI. Artifact URLs do not archive content.

## Implementation and verification

- Work and review records append within the existing mutation transaction.
- Up next accept/decline now call the existing task.status endpoint; submitting
  opens the workspace to collect work instead of invoking a nonexistent action.
- Focused API run: 278 assertions and 52 frontend route checks passed.
- Browser, isolated synthetic database: decline; accept; empty submission error;
  note-plus-link submission; officer feedback; member sees feedback; URL-only
  resubmission; approval referencing submission 2; all history retained.
- Browser: Up next decline and accept persist; Submit work navigates to the task
  workspace with its submission action available.
- `npm --prefix web run check`: all six stages passed (types, pure suites, Python,
  API/pages, signals, production build). Evidence:
  `work/verification/2026-09-16T02-26-13.355Z-20952/result.json`.
- Local verification used Node 26.0.0 and Python 3.14.7; CI's Node 22/Python 3.12
  environment was not run here. `git diff --check` passed.

## Review and completion

- Reviewer: self-review.
- Reviewed authorization, stale writes, history preservation, safe URL validation,
  atomic evidence capture, and legacy compatibility.
- Local changes only; no commit, push, or deployment.
- Acceptance criteria satisfied. Artifact content remains externally hosted;
  older tasks do not gain retroactive submission evidence.
