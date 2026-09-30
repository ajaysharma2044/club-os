# Task: Simplify member navigation and the Home next action

Status: done — deployed and verified in production

## Acceptance criteria

- One primary list: Home, Events, Tasks & Projects, Inbox, People.
- Profile/preferences are reached through the account avatar (or a clear sign-in link).
- Officers find finances, membership, integrations, planning and operations through Manage club.
- Home prioritizes personal work and upcoming events, with direct task links.
- Old routes remain valid; secondary resources remain reachable. Mobile navigation must fit at 320px and close after navigation.

## Design direction

Use the existing Cornell product identity: ink #1a2330, navy #1c2b3a, paper #ffffff, background #f0f3f8, blue #0c5fbf, and Cornell red #b31b1b. Retain Figtree body and Bricolage headings. A single 204px desktop rail replaces nested rails for CEC. On narrow screens, the menu presents a two-column list of labeled destinations above quieter resource links. Home uses one next-action section followed by upcoming events; remove the redundant club navigation card and task sidebar.

The focus is information hierarchy and consistent labels, not decorative redesign. Demo club pages retain their existing club-specific rail. Shared navigation metadata keeps the primary menu and shortcut palette aligned.

## Implementation

- `navigation.ts`: common primary/management destinations, active-route matching and personal task selection.
- `Shell`: single connected navigation rail, officer-only Manage club link, secondary resources, mobile account access.
- `ConnectedDashboard`: one next action, task anchors, human-readable status, safe missing due dates, upcoming events and weekly-update prompt. Both `/` and `/clubs/cec` use this dashboard.
- `OfficerTools`: Manage club heading and links to related officer workflows; server-side authorization remains unchanged.
- Workspace headings, breadcrumbs, footer and shortcut labels align with the primary navigation.

## Verification and limits

Regression tests cover navigation labels/active routes and personal task sorting/exclusion. Browser and full gate results are recorded below after completion. Use isolated synthetic PostgreSQL records; no production changes. A real first-time-member usability session remains a follow-up: ask someone to find an event, accept a task and message a member without guidance. Agent browser checks are not a substitute for that study.

### Browser evidence

- Signed out: 320px menu showed the five primary entries with secondary resources; no competing CEC/Home/Discover primary entries.
- Member: 390px Home showed the assigned task and readable status; View task opened its exact anchor and revealed Accept/Decline. Accept succeeded (HTTP 200). Inbox navigation closed the menu. Manage club was absent.
- Tablet: Inbox fit at 768px; 900px shell retained full-width content at its mobile breakpoint.
- Officer: desktop 1440px displayed the single rail and Manage club hub; membership, money, integrations and planning destinations appeared above operations.
- Officer at 320px: management links stacked at 281px wide; document width stayed within viewport. Events remained reachable through the same menu.
- Existing routes were preserved, including CEC Home as an alias for the main dashboard; no production data was modified.

Reviewer: self-review. Initial verification was local; deployment was subsequently authorized by the user.

### Final verification

Full gate passed: `work/verification/2026-09-30T18-47-19.329Z-89279/result.json` (types, pure regression suites, Python, API/routes, signals, production build; local Node 26). `git diff --check` passed. Synthetic test schema removal was verified, viewport restored and test tab closed. Local preview restored on port 3000.

### Production deployment — September 30, 2026

- Runtime commit: `b64984cf03a28481c6704945c499388a5b552734`.
- [Netlify published deployment](https://app.netlify.com/projects/jade-palmier-e20b3c/deploys/6abd915d3009490008198827); building, deploying and post-processing completed.
- [Production](https://jade-palmier-e20b3c.netlify.app/) refreshed successfully in the browser. Home displays “Your next events”; the mobile menu displays Home, Events, Tasks & Projects, Inbox and People, with secondary resources below.
- `/api/cec/health` returned HTTP 200 with `ok: true` and `storage: postgres`. `/api/cec/state` returned HTTP 200 without an error. Email and analytics remain disabled as configured.
- Production verification was read-only; authenticated mutations were verified against the isolated test schema before deployment.
