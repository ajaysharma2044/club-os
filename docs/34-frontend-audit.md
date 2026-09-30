# Frontend and workflow audit — 2026-09-30

## Remediation status

The subsequent [F01–F12 remediation task](tasks/015-frontend-audit-remediation.md) records fixes and verification. Findings below preserve the audited baseline rather than describing the current implementation.

## Decision

The deployed app is not ready to call frontend-complete. Prioritize correctness and completing existing workflows before adding more features. This audit found 12 actionable issues, including a reproduced PostgreSQL failure affecting messaging and Up next. No fixes or deployment changes are included in this audit.

Baseline: `d84051d`. P1 means a core workflow is broken or can present the wrong conversation; P2 means a significant usability, reliability, or capability gap. “Reproduced” means observed in the isolated audit environment. “Code-confirmed” means a concrete implementation path, not a fault-injected browser reproduction.

## Findings

### F01 · P1 · Populated messaging and Up next return HTTP 500

**Reproduced on real PostgreSQL.** An empty messaging inbox returned 200. After creating a direct conversation and sending one synthetic message through supported APIs, both `GET /api/cec/messaging/state` and `GET /api/cec/upnext` returned 500. The Messages page displayed the generic request error.

- Sources: `web/lib/cec/messaging/conversations.ts:663`, `web/lib/cec/messaging/delivery.ts:218`.
- The nullable cutoff predicate `(? IS NULL OR created_at > ?)` becomes separate PostgreSQL parameters. Executing the actual query produced `42P18: could not determine data type of parameter $3`.
- Fix: explicitly type the nullable parameter or use separate queries for null/non-null cutoffs. Audit other nullable placeholder predicates.
- Acceptance: real-Postgres tests for populated DM/group/channel inboxes, null and non-null last-read timestamps, mentions, and Up next; browser rendering must succeed after sending a message. Empty-inbox or SQLite-only coverage cannot catch this failure.

### F02 · P1 · Conversation requests can overwrite a different conversation

**Code-confirmed; race not reproduced in the browser because F01 blocks populated messaging.** `web/components/cec/Messages.tsx:99` changes the selected ID immediately, retains old messages, and unconditionally applies requests when they finish. Switching A → B while A loads can display A's messages under B. Send completion at line 155 can also overwrite the currently selected conversation. The shared draft is retained across switches, and failure at line 160 can replace newly typed text.

- Fix: key messages, drafts, replies, and pending sends by conversation; discard stale responses using request identity; clear or explicitly load content during switching. Guard repeated sends in the handler.
- Acceptance: delayed A response after B, switching while sending, failed send after typing a new draft, and keyboard submission during a pending send must preserve the correct conversation and draft.

### F03 · P2 · Users cannot start a conversation from Messages

**Browser and source confirmed.** A fresh member's `/clubs/cec/messages` page says conversations appear when someone messages them or they join a channel, but offers no start-DM, create-group, or join-channel action. Those backend operations exist.

- Sources: `web/components/cec/Messages.tsx:170`; creation handlers under `web/lib/cec/messaging/`.
- Global Inbox routes to the separate legacy workspace chat (`web/app/chat/page.tsx:21`), while private conversations use different records and UI. The shell unread count is hard-coded to zero (`web/components/Shell.tsx:56`).
- Fix: choose one clear Inbox entry point and expose supported conversation creation/join flows with permitted member selection and real unread state.
- Acceptance: two fresh members can find Inbox, start a conversation, receive a message, and navigate back to it without an API script or manually entered URL.

### F04 · P2 · Messages has an unusable narrow-screen layout

**Browser reproduced at 390 × 844 before seeding the conversation.** The fixed 240px sidebar leaves a tiny detail pane, wrapping empty-state words into a narrow column. A document-level overflow check does not detect this: document width remained 390px.

- Source: `web/components/cec/Messages.tsx:189` and line 253.
- Fix: use a mobile list/detail layout with a back action, and a flexible desktop split pane.
- Acceptance: readable empty and populated states at 320/390/768px; composer, keyboard, long messages, and back navigation remain usable. Populated mobile verification remains blocked by F01.

### F05 · P2 · Messages does not refresh for incoming messages or expose older history

**Code-confirmed.** Inbox loads on mount and after local actions; there is no polling, subscription, or focus refresh (`Messages.tsx:84–97`). Open conversations request only 100 messages and offer no history control (lines 105 and 153).

- Fix: add bounded refresh/subscription behavior, reconcile the active thread, and cursor-based history loading. Preserve draft and scroll position.
- Acceptance: a message from another browser arrives without reopening the thread; older messages remain reachable after 100 messages.

### F06 · P2 · A successful save can be reported as a failed action

**Code-confirmed.** `web/components/cec/useWorkspaceData.ts:60–79` awaits a state reload inside the same try/catch as a successful POST. If the write commits but the subsequent GET fails, the action rejects, leaving callers unable to distinguish “saved, refresh failed” from “not saved.” Retrying a create can create another record.

- The same action also dispatches `cec:changed`, which triggers a second load in this hook before the explicit load. Other shared state consumers add further requests.
- Fix: distinguish mutation success from refresh failure, reconcile or retain the committed result, and remove redundant refreshes. Add idempotency where a retry could duplicate a create.
- Acceptance: force a successful POST followed by a failed GET; show that the record was saved, retain the draft/result appropriately, and offer refresh rather than repeating the mutation.

### F07 · P2 · Integration setup errors disappear after the list loads

**Code-confirmed.** `web/components/cec/Integrations.tsx:112–127` sets an error when setup fails, but only renders it when there is no list data. After successful initial load, a setup failure therefore leaves the expanded panel without actionable error recovery. A late A setup response can also populate the currently open B panel.

- Fix: separate initial-load and per-integration setup states, render inline errors/retry, and validate request identity before applying results.
- Acceptance: failed setup after successful list load, rapid A/B switching, and close/reopen while loading.

### F08 · P2 · Forecast controls offer work that this deployment cannot complete

**Browser reproduced with hosted configuration parity.** Clicking the seeded event's Forecast action showed “Record synchronization is pending. Retry synchronization first.” The hosted configuration has no quant worker, so retrying cannot supply the missing capability.

- Sources: `web/components/cec/Workspace.tsx:1830`; `web/lib/cec/quant.ts:5` and `:52`.
- In PostgreSQL mode, API flush only clears retry bookkeeping; a separate worker must drain committed outbox rows. Analytics execution also explicitly rejects when no quant database is configured.
- Fix: return capability/readiness information and disable unavailable controls with an honest explanation, or provision the worker before exposing those flows. Keep operational club data usable independently.
- Acceptance: hosted no-worker mode has no futile retry loop; configured mode proves end-to-end processing. Disabled email/recovery flows should receive the same capability review; actual delivery was outside this audit.

### F09 · P2 · Slot suggestions shift default times and discard zero RSVPs

**Code-confirmed.** `web/components/cec/SlotAdvisor.tsx:58` converts a local candidate to UTC, strips its timezone, and puts it in a local datetime field. Line 90 interprets it as local again. Outside UTC, defaults shift by the timezone offset. Line 91 uses `Number(rsvps) || undefined`, discarding a legitimate zero.

- Fix: format local datetime input values without an unintended UTC conversion; preserve zero with explicit empty/invalid handling.
- Acceptance: candidate defaults round-trip correctly in Pacific, Eastern, and UTC timezones, including DST boundaries; zero RSVPs remains zero.

### F10 · P2 · Search promises events/people but only searches static shortcuts

**Browser reproduced.** Searching the existing synthetic event title “Audit Startup Hours” returned “Nothing matches.” The placeholder promises a club, event, or person, but the results filter only static routes and example data.

- Source: `web/components/CommandPalette.tsx:105–115`, `:161`.
- Fix: label it as navigation shortcuts until real authorized record search exists, or implement scoped search for actual records. Keep example data clearly separated.
- Acceptance: the advertised search scope matches results, and private/unauthorized records are never returned.

### F11 · P2 · Search palette bypasses shared accessible modal behavior

**DOM and code confirmed; no screen-reader certification.** The palette has `role="dialog"` but no `aria-modal`, no inert background, and no shared focus containment/restore behavior. The underlying page remains present in the accessibility tree.

- Source: `web/components/CommandPalette.tsx:151–175`.
- Fix: use the shared dialog primitive and give its search input an explicit accessible label. Preserve arrow-key selection and Escape behavior.
- Acceptance: keyboard focus stays inside while open, Escape closes it, focus returns to the trigger, and a screen reader announces a labeled modal/input.

### F12 · P2 · Legacy chat can hide an entire quiet channel's history

**Code-confirmed.** `web/lib/cec/service.ts:196` fetches the latest 100 messages across channels before the UI selects a channel. Activity elsewhere can therefore remove all of a quiet channel's messages from the returned state. There is no older-history control.

- Fix: query authorized messages per selected channel with pagination, ideally while consolidating the two messaging surfaces in F03.
- Acceptance: seed more than 100 messages in another channel; a quiet channel still shows its own history and supports pagination.

## What held up in the sampled checks

- Synthetic officer login and account rendering succeeded against Supabase.
- Published event, assigned task, and officer overview rendered from durable records.
- Task assignment dialog measured 366px at a 390px viewport and 296px at 320px; its controls appeared in the accessibility tree and it closed normally.
- Officer overview had no document overflow at 768px. Desktop navigation and search were inspected at 1440px.
- An applicant received 403 from officer tools, schedule, behavioral self data, messaging, and planning readiness. An accepted member received 403 from officer tools and 200 from the other sampled member endpoints. Officer requests returned 200 before populating messaging.
- Existing shared task dialogs, stale-version handling, and refresh sequencing provide reusable patterns. The newer standalone panels do not consistently follow them.

## Coverage and limits

This was a broad code review plus targeted browser/API audit, not an exhaustive test of every permutation. It used an isolated, randomly named Supabase test schema, three synthetic accounts, one event, one task, and a direct conversation/message. Email was disabled and the quant worker absent to match hosted capabilities. Production records were not changed.

Actual browser coverage: officer sign-in/account, events/forecast failure, empty and failing private Messages, mobile task list/assignment dialog, tablet officer overview, desktop navigation/search. Viewports sampled were 320, 390, 768, and 1440px; each route was not tested at every size. API coverage included 18 role/endpoint probes and populated messaging/Up next failure checks. Local development response times are not production benchmarks.

Not completed: physical iOS/Android devices, multiple browser engines, full keyboard/screen-reader and contrast audit, every task transition, all import/meeting/handoff forms, exports, attachments, real provider OAuth/email/calendar delivery, production load testing, deterministic offline/race fault injection, and populated messaging browser flows blocked by F01. Previous passing automated suites are baseline evidence, not evidence that these newly found bugs pass.

Scratch evidence: ignored `work/frontend-audit/api-probes.json`, `probes.mjs`, `diagnose.mjs`, and `server.log`. Session credentials remain excluded from documentation and version control. The audit server was stopped, the temporary database schema was verified absent, browser viewport restored, and generated Next files restored. No application runtime files were changed.

## Recommended implementation order

1. **Correctness gate:** F01, F02, F06. Real PostgreSQL populated-data coverage and deterministic delayed/failed request tests.
2. **Complete Inbox:** F03, F04, F05, F12. One reachable, responsive, end-to-end messaging workflow.
3. **Honest capability and recovery states:** F07, F08, F09.
4. **Navigation/accessibility:** F10, F11; then finish the broader device and workflow matrix above.

For each batch, update the frontend patterns/runbook and task record, run focused regression tests plus the required full gate for runtime changes, and verify affected browser flows. Do not declare mobile or MVP complete based solely on component extraction or a successful deployment.
