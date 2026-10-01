# Navigation and action hierarchy

Status: implemented and verified locally.

## Outcome

Reduce repeated navigation and equally prominent actions. Keep five primary destinations,
move Jump to search beneath the brand, group Club links, and put profile/settings/sign-out
in a shared account dialog accessible on desktop and mobile. Preserve all workflows.

## Design

Retain navy #1c2b3a, ink #1a2330, white #ffffff, background #f0f3f8, blue #0c5fbf
and existing Figtree/Bricolage typography. Left-align compact navigation; the primary
workflow remains the page's visual focus. Search is a narrow grouped list, not a second
full-size page. Avoid adding new cards or decorative treatments.

## Acceptance

- Keyboard search opens with Command/Ctrl K, filters real connected destinations,
  supports arrows/Enter/Escape and restores focus.
- Account and officer groups follow current identity. No example inbox entries.
- Mobile retains reachable account actions and no horizontal overflow.
- Remove repeated bottom shortcut strips; retain destinations through search/navigation.
- Calendar download is a quiet link; task status filters use an understated underline treatment. No backend or data migrations.

## Verification

- Final full gate passed all six steps after review fixes (task-filter CSS conflict and preventing nested search dialogs). Evidence: `work/verification/2026-10-01T05-56-56.257Z-41155/result.json`.
- Browser: guest search empty state and Enter navigation; synthetic officer login, role-specific relationship result, Escape return focus, account dialog and successful sign-out. No production data was changed.
- Search viewport widths 320/390/768 matched document width; desktop 1440 screenshot reviewed. Narrow search stayed within the viewport. Temporary viewport reset and isolated Postgres test schema removed.
- Browser screenshots reviewed at desktop and 320px. This is viewport emulation, not physical-device or full screen-reader certification.
- Reviewer: self-review. Preview changes remain local; no deployment requested in this turn.
