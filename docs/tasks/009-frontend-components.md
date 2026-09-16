# Task: Extract pilot frontend components and document patterns

Status: done

## Acceptance criteria

Task list/card/history/submission/revision boundaries are extracted; network lifecycle
has a dedicated hook; dialogs preserve focus and versioned drafts; narrow/tablet/desktop
pilot surfaces are checked; frontend patterns live in a maintained repository guide.

## Scope

CEC task components, shared forms/dialogs, workspace hook, responsive corrections,
and docs/29-frontend-patterns.md. No schema or provider changes. Preserve prior work.

## Verification

Browser checks on isolated work/pilot-ui/cec.sqlite:
- 320×740: assignment form, long-title task, keyboard focus, invalid/valid assignment,
  submission error and draft preservation; join form and expanded mobile navigation.
- 390×844: invitation creation and roster; detected 3px document overflow, fixed by
  stacking membership rows; confirmed document width equals viewport width.
- 768×1024: submission/revision dialogs, resubmission/approval; join document width.
- 1280×900: finished task layout and wrapped long title.
- First-field focus; Shift+Tab wraps to final button; Tab wraps to close; Escape closes
  and restores trigger; background removed from AX tree while dialog is open.
- Synthetic concurrent task version change: polling keeps focus/draft, stale submit
  returns 409 and retains text; reopening on current task allows submission.
- Browser assignment → acceptance → submission → revision → resubmission → approval.
  Member sign-in hides officer actions; decline yields the open-task empty state.
- Existing API suite checks permissions and task history. Full verification report:
  work/verification/2026-09-16T20-35-49.746Z-69375/result.json All six stages passed (types, pure suites, Python, API/pages, signals, build).
  git diff --check passed.

Physical iOS/Android keyboards and a full screen-reader audit were not tested.

## Review

Self-review found and fixed transformed-ancestor dialog positioning, focus resets,
mobile menu contrast and membership-row overflow. Request sequence guards retained;
refresh failures preserve drafts; task dialogs keep their opening version.
Workspace reduced from 2,718 to 2,330 lines; non-task legacy screens still remain there.
No commit/push/deployment. No real club records used in browser tests.
