# Frontend patterns and component guide

Scope: the working CEC pilot. This is a living implementation guide, not a claim
that every legacy screen follows these patterns. Update this document in the same
change that adds or changes a shared component or interaction contract.

## Architecture

Next.js routes render the shared app shell and CEC workspace. Prefer small, module-level
React components with explicit props. Keep presentation separate from network lifecycle.
Do not define stateful component functions inside another component: changing their
identity can remount them and discard focus or form state.

| Module (under web/components/cec) | Responsibility |
| --- | --- |
| Workspace.tsx | Legacy screen composition, generic record editors, non-task workflows |
| useWorkspaceData.ts | Workspace/directory reads, request sequencing, refresh subscriptions, mutations and busy/error/notice state |
| TaskList.tsx | Task filters/counts, empty states, officer assignment/invitation entry points |
| TaskCard.tsx | One task's state, owner/deadline, next actions and dialog snapshot |
| TaskHistory.tsx | Retained submissions, reviews, artifact links and review provenance |
| TaskDialogs.tsx | Submission/resubmission and revision forms; local error/busy state; versioned writes |
| FormPrimitives.tsx | Shared Modal and schema-based Editor |
| taskTypes.ts | Task component boundary types and date formatting |
| UpNext.tsx | Personal upcoming plans/open work and inline responses |
| JoinWithInvite.tsx | Invitation lookup and authenticated claim; lookup race protection/retry |
| MemberManagement.tsx | Officer invitations, membership changes and leadership transfer |

Workspace still contains legacy event/recruitment/CRM/account rendering. Extract those
when changing their behavior; don't treat the task extraction as a full-app rewrite.
The legacy state and generic JSON records still contain `any`; stronger API DTOs are
future work. New task history uses an explicit entry type.

## State and data

- The server owns membership, permissions, status transitions, history and versions.
  Hidden buttons are guidance, never authorization.
- `useWorkspaceData` rejects superseded responses using a request sequence. It refreshes
  on focus, visibility and `cec:changed`, and every 15 seconds in the task workspace.
- A transient background refresh failure preserves rendered data and in-progress forms,
  and displays an error. An initial failure shows retry. Successful signed-out state
  replaces the prior session's data.
- Keep task filters in TaskList; key the list by account and role to reset on identity changes.
- Capture the task snapshot when opening a submission/review dialog. Send that version,
  even if a later poll changes the task. A stale write must fail rather than silently
  applying a draft to newer work. Preserve the draft on errors.
- Task mutations wait for server confirmation. Up next retains its existing optimistic
  RSVP behavior with inline rollback/retry. Do not add optimistic approval or deletion.
- Use existing API paths and centralized routes. Never make API calls from display-only
  TaskHistory. Do not put credentials or private messages in frontend logs.

## Forms and dialogs

Use Modal for CEC overlays. It portals into document.body so animated/transformed page
ancestors cannot change fixed positioning. The portal carries the CEC style scope.

The dialog has a name and aria-modal, focuses the first editable field, traps Tab and
Shift+Tab among enabled controls, closes with Escape, restores the trigger when present,
locks body scrolling and makes background siblings inert. Close callbacks may change
without resetting focus. Task dialogs prevent closing while their save is pending.
One overlay at a time is the supported pattern; nested modals are not supported.

Editor owns draft values. Labels wrap native controls; required fields use native
validation; date-time input accepts local time and converts to ISO on submission.
Display stored deadlines in Eastern Time with an explicit ET label. Optional fields
must be marked optional in copy and schema. Errors must remain visible with role=alert;
never rely on a disappearing toast. A work submission needs a note, link, or both.

## Task UX contract

- Open excludes approved/closed tasks. My tasks shows the user's open tasks.
- Needs review is available to officers. Finished contains approved/closed work.
- Show human-readable statuses, owner, deadline and next action together.
- Show the latest requested revision immediately; keep older history expandable.
- Preserve artifact URLs as links; opening a URL does not archive its content.
- Home must not drop overdue tasks merely because their due date has passed.
- Task hash links reveal all tasks so a completed target isn't hidden by the default filter.

## Styling and responsive behavior

Retain the existing Cornell palette and typography. CEC styles live in cec.css and
should be scoped under `.cec` or a specific component class. Avoid new bare selectors
such as `.panel`: the shared shell already has global styles with those names.
CEC explicitly resets `.panel` to block layout to avoid the shell's two-column grid.
Prefer named classes over repeated inline layout declarations.

Mobile breakpoint: 700px. Task actions move below task content; filters and panel headers
wrap; native controls use 16px text; primary controls have at least 44px height. Dialogs
use a dynamic viewport height limit and scroll internally. Long titles/feedback must
wrap without widening the page. Tabs may scroll horizontally within their own container.
Do not add animation to communicate status; use words and visible keyboard focus.

## Verification and maintenance

For runtime changes run `npm --prefix web run check`; see AGENTS.md for the isolated
database and preview-stop rules. Backend/API tests are not visual acceptance.

For changed pilot surfaces check:
1. 320px narrow phone, approximately 390px phone, 768px tablet and desktop.
2. Join/invite, navigation, assignment, submission, revision, approval and roster access.
3. Empty/error/loading states, long content, role restrictions and stale versions.
4. Keyboard open/close, focus trap/restoration, error recovery and draft preservation.
5. Screenshots and document overflow; inspect actual content, not only page HTTP status.

Record exact coverage in docs/tasks. Browser viewport emulation is not a real iOS/Android
keyboard test, and accessibility-tree checks are not a complete screen-reader audit.
Physical-device and assistive-technology testing remain release follow-ups.

## Email access and delivery UI

`EmailSettings.tsx` owns account verification status, notification preference and request
history; its `EmailInvitation` handles one officer invitation recipient. `EmailLinkForm`
is shared by /verify/cec and /recover/cec. All are module-level components with local
busy/error/status state and labeled native forms. Security links use URL fragments and
require an explicit submit; successful consumption clears the fragment. They never
consume links on page load. Errors preserve form inputs. Provider acceptance is labeled
separately from inbox delivery; capture/disabled modes are visible. Task email links use
the existing workspace #task-ID anchor contract. See doc 30 for API/data/operations.

## Officer workspace

`OfficerTools.tsx` provides the /clubs/cec/operations route with module-level Overview,
Imports, Meetings, Handoffs and Calendar components. Each workflow owns its draft inputs,
error/status messages and busy state. Import preview is invalidated when inputs change;
confirmation uses a server revision. Meeting confirmation uses a stable per-draft request
ID and native meeting version. State refresh follows successful writes and an explicit
Refresh button. This is an officer-only server boundary, not only a hidden navigation link.
Native task cards remain the review surface. Calendar UI explicitly distinguishes polling
subscriptions from direct OAuth synchronization. See doc 32 for data and access contracts.
