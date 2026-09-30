# Task: Resolve frontend audit findings F01–F12

Status: done — implemented and verified locally

## Problem and acceptance criteria

Complete the fixes authorized after the September 30 audit. Populated PostgreSQL messaging and Up next must work; Inbox must offer conversation creation, readable mobile navigation, incoming refresh, and history. Requests must preserve the selected conversation and drafts. Confirmed writes must survive refresh failures. Integration failures need visible retry. Capability, datetime, and shortcut semantics must be honest and accessible.

## Scope

Application and regression coverage for all twelve findings in [the audit](../34-frontend-audit.md). Preserve private-message boundaries, existing club-channel history, and demo routes. No schema migration, provider provisioning, production data changes, or deployment.

## Implementation

- F01: explicit SQL typing for nullable PostgreSQL unread/mention cutoffs.
- F02: keyed conversation components; drafts, send locks, pending state, and send failures keyed by conversation in their parent; no optimistic draft removal before confirmation.
- F03: global Inbox redirects to the messaging surface; workspace Inbox uses it too. Member picker, group creation, channel creation/join and real ambient unread indicator.
- F04: phone list/detail navigation below 700px; flexible tablet/desktop panes.
- F05: focus/interval incoming refresh; backward history and forward catch-up cursors, no offset paging.
- F06: shared commitAndRefresh preserves successful mutation results and warns on failed refresh; avoids the hook's duplicate change-event reload.
- F07: integration setup request identity, inline errors, and explicit retry.
- F08: server capability flags gate forecasts, simulations, synchronization and recovery email requests.
- F09: local datetime serialization and explicit optional number parsing preserve timezone and zero RSVPs.
- F10/F11: navigation-shortcut scope and shared Modal, labeled input, focus containment/restore.
- F12: retained legacy channels have per-channel stable cursor history, accessible from Inbox. Existing scheduler selection remains available.

## Verification

- SQLite messaging suite: 110 original assertions plus populated inbox, null/read cutoffs, Up next, private cursor access, 105-message history, quiet legacy channel and forward catch-up regression checks.
- Supabase messaging suite: the same suite passed in a fresh test schema. Expected uniqueness violations run inside savepoints so tests do not poison the surrounding PostgreSQL transaction.
- Frontend state tests: committed write + failed read, rejected write, Pacific/Eastern/UTC dates around DST, zero/empty RSVP parsing.
- Browser, synthetic Supabase data: first DM, group creation, send, incoming message without reopening, per-conversation draft retention, mobile back/list navigation; widths 320/390/768/1440. No document overflow in measured phone/tablet states; 320px detail pane was 258px wide.
- Browser: forecast unavailable explanation; disabled email recovery; integration setup failure after expiring synthetic sessions displayed “Sign in to continue” and Retry setup.
- Browser: shortcut modal aria-modal/inert background, Escape, and focus restored to Search. Removed autofocus that previously captured the input as the return target.
- First full gate found the intentional Inbox 307 redirect was still tested as a 200. Updated the route contract test to assert redirect status and exact destination, retaining demo route coverage. Full rerun passed (evidence below).

## Limits and review

Self-review only. Browser emulation is not physical-device or complete screen-reader certification. No real provider delivery or hosted analytics worker was provisioned. Drafts persist across conversation switches within Inbox, not reloads. Polling is bounded, not realtime push. Network timeouts after an unknown write result remain distinct from a confirmed-write/read-refresh failure; this change does not add universal mutation idempotency.

## Final results

- Full gate passed: `work/verification/2026-09-30T07-51-02.997Z-81408/result.json` (Node 26 locally): types, pure suites, Python, API/routes, signals and production build. API coverage included 278 core assertions, 56 route checks, 12 organization checks, 76 pilot assertions and 59 email API/page checks.
- Real PostgreSQL suite passed: `work/frontend-audit/postgres-messaging-final.log`, including forward catch-up with 105 messages. Each suite drops its synthetic schema.
- Final browser pass exercised sending while switching DM → group → DM. The DM showed one confirmed message and cleared its draft. API verification counted exactly one matching message in the DM and zero in the group.
- Browser history advanced from 50 to 100 messages, then loaded all 106 messages (105 seeded plus the sent message), with History 0 visible and the older-page button removed. A final check found an older-page click could be ignored during background refresh; it now queues and exposes its pending state. Read-marker updates no longer block pagination. The test used a separate synthetic schema, never production records.
- `git diff --check` passed. No migration or credentials were added. No commit, push or deployment was performed; local preview restored on port 3000.


- Shared Modal imports its scoped styles so shortcut dialogs also work on a fresh non-CEC route. Final production build rerun recorded in `work/frontend-audit/final-build.log`.
- Temporary database schema absence was verified after stopping the audit server.
- Fresh browser `/discover` verified the shortcut overlay is fixed-position, 600px wide at desktop, and aria-modal; Escape closes it. Local preview is running with polling watchers on port 3000.
