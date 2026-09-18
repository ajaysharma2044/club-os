# Officer integrations: prototype sequence and acceptance gates

Recorded 2026-09-17. Status: roadmap; CSV imports and subscription calendar publishing
are now implemented in [doc 32](32-officer-workflows.md). Direct provider adapters remain unconnected.
The officer/member pilot and local recovery drill are implemented in task 011.

## Recommendation

Prototype these workflows, one at a time. Start with sponsor CSV import, then a single
club calendar. Existing document links already support an initial Drive/Docs trial.
Test selected-email capture manually before requesting mailbox OAuth. Choose one chat
provider that the pilot club actually uses. Do not build Google and Microsoft adapters
simultaneously before observing which accounts the club can authorize.

| Priority | Workflow | Smallest useful prototype | Pass condition |
| --- | --- | --- | --- |
| 1 / Early | Sheets / CSV | Upload or paste a sponsor list; map columns; preview adds, duplicates and errors; explicitly commit | Re-import creates no duplicates; invalid rows are explained; members cannot import officer CRM data |
| 2 / Next | Google or Outlook Calendar | Publish a Club OS event into one named club calendar; propagate edits and cancellation | Time/location changes update the same external event; retries create no second event; conflicting external edits are surfaced |
| Available now; extend next | Drive / Docs | Attach existing agenda, brief, budget or handoff links; later add file selection | The right document is attached to the right record, source permissions still apply, successor can find it |
| 3 / Next | Club Gmail / Outlook | Officer pastes a selected excerpt and source reference; reviews a proposed sponsor follow-up, room confirmation or receipt record | Nothing saves before confirmation; correct record type/fields; no unselected messages or private-message graph enters analytics |
| 4 / Next | GroupMe / Discord / Slack | Officer previews and sends an announcement to one explicitly connected club channel | Correct channel and event link; failures visible; retries have a provider-specific duplicate policy; no channel-history/DM ingestion |

These are workflow prototypes, not five broad synchronization systems. “Next” describes
priority; it never means “connected.” Outgoing transactional email is separate from
reading Gmail or Outlook.

## Current code we can reuse

- Native contacts, tasks, events, document links, invitations and attendance records.
- Calendar ICS downloads and private meeting subscriptions. A downloaded ICS file is
  not push synchronization; subscription refresh timing belongs to the calendar client.
- `web/lib/cec/integrations/registry.ts`, `oauth.ts`, `status.ts`: provider declarations,
  encrypted token storage, OAuth state/PKCE helpers and status concepts. These require
  route wiring, provider adapters and a fresh scope/lifecycle audit before live reuse.
- Outgoing mail: encrypted durable queue, leases, bounded retries and explicit status.
  Extract shared job mechanics only when a second real transport needs them. Resend's
  idempotency guarantees must not be assumed for chat or calendar providers.
- Ledgly candidates from the earlier review: selected-message import/deduplication,
  email templates and notification-channel patterns. Adapt these to Club OS access
  boundaries and durable jobs; do not port its backend or silent failure behavior.

## Prototype 1: sponsor CSV import

First record type: sponsor contacts. Roster and attendance imports follow after this
review/commit pattern works. The reviewed import workflow is implemented; see doc 32 for its exact limits.

1. Officer selects a file or pastes CSV. Preview is read-only and shows source row numbers.
2. Map name, organization, email, relationship and notes into the existing contact fields.
3. Validate quoted commas/newlines, UTF-8 BOM, missing columns, lengths and email format.
   Preserve text; never evaluate spreadsheet formulas. Keep API requests within the
   existing 64 KiB cap, with at most 100 rows in the first batch implementation.
4. Show proposed additions, existing matches, duplicates within the file and invalid rows.
   No automatic merging based solely on a person's name. Ambiguous matches need review.
5. Explicit confirm performs fresh server-side authorization/validation and commits all
   accepted rows, batch identity and audit provenance atomically. Repeating the same
   batch is safe. If another officer changed matching records, return a conflict preview.
6. Record organization, importer, batch ID, source row ID and imported-at time. Store
   normalized accepted records; do not retain the entire raw file by default.

Later roster import must create proposed roster/invitation entries, not verified accounts
or officer roles. Attendance import must resolve an actual event/member and explicit
attendance outcome; unmatched or missing rows are unknown, not recorded absences.
Source occurrence time and import observation time remain separate.

Acceptance fixtures: valid CSV; quoted comma/newline; repeated batch; duplicate email;
ambiguous match; oversized input; unauthorized member; concurrent change; rollback on
validation failure. Verify imported contacts survive the same backup/restore path.

## Prototype 2: club calendar publishing

Club OS owns its published event fields. Connect one club-owned calendar, visibly named
in settings and registered for officer handoff. Start outbound only; no free/busy or
personal-calendar reads are required for event publishing.

Persist the organization, local event ID/version, provider calendar/event IDs and last
successful version. Enqueue only committed event changes. Coalesce stale pending updates,
preserve cancellations and reconcile uncertain create results before retrying creation.
Store provider version/etag and surface conflicting edits rather than silently overwriting.
Google supports conditional updates using `If-Match` and an etag:
[resource versioning](https://developers.google.com/calendar/api/guides/version-resources).

Test create → reschedule → change room → cancel; repeat each delivery; revoke access;
change a remote event concurrently; rotate officers; restart while a request is in flight.
For Outlook, select delegated calendar permissions for the actual account/tenant scenario:
[Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference).

## Selected-email capture

Start with manually selected text and source references so we can test which record types
save officers time before building mailbox access. Show a review form, provenance and
intended visibility. A sponsor reply may become a CRM follow-up; a room confirmation may
update a specific event; a receipt may become a draft expense pending officer confirmation.
Imported text is untrusted content, never agent instructions. Receipt extraction does not
prove payment or authorize reimbursement. Keep raw threads out of evidence/quant features.

For live access, choose a club mailbox or an explicitly selected message interaction.
Google distinguishes current-message add-on scopes from broad mailbox scopes, including
restricted scopes; choose based on the final UI and data retained:
[Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes).
Outlook access similarly needs a specific delegated mailbox consent and tenant checks.
Never fold mailbox permissions into generic Google/Microsoft sign-in.

## Documents and announcements

Drive links already work without file ingestion. A later Picker integration should select
specific files; Google recommends `drive.file` with Picker for per-file access:
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
Do not change source sharing permissions or claim that attaching a link grants access.
Record ownership/custodian and link recovery for leadership handoff.

For announcements, choose the club's existing channel and start outbound only. Supported
provider mechanisms include [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks),
[Discord incoming webhooks](https://docs.discord.com/developers/platform/webhooks), and
[GroupMe bots](https://dev.groupme.com/tutorials/bots). Store credentials encrypted, bind
the destination to CEC and recheck sender authority at dispatch. Disable broad mentions
by default. Display queued/accepted/failed/uncertain accurately; an ambiguous network
response must follow that provider's safe retry policy, not a blanket replay loop.

## Shared connection contract before production

A connection needs organization, provider, consenting officer, club-owned destination,
granted scopes, encrypted credential reference, last successful check and current error.
OAuth state must expire and be single-use; callbacks and jobs must validate organization
and actor authority. Consent, connection health and data synchronization are separate states.

Disconnect stops jobs and revokes credentials where supported. Losing officer access must
stop that officer's delegation or require authorized reconnection; club-owned records
retain provenance. Audit which records were promoted, not the full private source content.
Each prototype needs durable replay tests, disconnect tests and a documented handoff path.

## Release gate

The local officer/member email pilot and synthetic SQLite recovery drill have passed.
Production hosting/domain, real sender setup, off-machine backup verification and an actual
host restart/restore exercise remain deployment work. Local timing is not a production
recovery target. Start one prototype after documenting its input, output, permissions,
source-of-truth rules, failure behavior and measurable officer benefit.
