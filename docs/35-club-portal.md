# Club information, member profiles, requests and CRM follow-up

## Product scope

The CEC pilot has a club information hub (`/clubs/cec/info`), detailed self-managed
profiles (`/clubs/cec/profile`), a member directory within People, requests
(`/clubs/cec/requests`) and officer relationships (`/clubs/cec/relationships`).
There are no cohorts, onboarding programs, merit activities, credits or fraternity
features. Existing task workflows and commercial sponsorship deals are unchanged.

## Visibility and ownership

- Published public information is guest-readable; published club information requires
  active member/officer access. Officers can see drafts and archived information.
- Detailed profiles default to private. The owner may share with current club members.
  Even officers cannot read another person's private profile details. Names and membership
  roles still follow the existing roster policy. These details never enter the public directory.
- Applicants can maintain their profile but cannot browse the member directory or submit requests.
- Members read their own requests; officers read and review all club requests. Another officer
  must review an officer's own request. Archived/removed memberships cannot retain access.
- CRM contacts, notes and follow-ups are officer-only. They are manually recorded and never
  populated from private Inbox messages. Existing contact/deal creation stays in Money & sponsors.
- Alumni are external contacts with relationship Alumni; this does not reactivate departed accounts.

## Data/API

`002-club-portal.sql` adds portal_profiles, portal_content, portal_requests and
portal_followups. All are CEC-scoped with membership foreign keys; contact links are
restricted to contact records in CEC. PostgreSQL RLS is enabled with no public client
policies; requests use the existing trusted server connection. SQLite has matching tables
and guards. Do not edit the applied 001 migration.

`GET /api/cec/portal/state` returns only authorized views. `POST /api/cec/portal/*`
uses the existing origin, body-size, session and rate-limit boundary. Profile/content/
follow-up changes require the current version (0 for creation). Current roles are reread
server-side. Profile writes always target the authenticated account.

Request creation uses an owner-scoped request key and payload fingerprint. Replaying
an identical request returns its ID; reusing the key with other data returns a conflict.
Requests start submitted. Officers may move open requests to in_review, needs_info,
approved or declined. Owners may cancel open requests or answer needs_info by resubmitting.
Every transition stores feedback, actor, timestamp and history in the same transaction.
Closed requests cannot be reopened. Stale versions return 409 without modifying history.
The accessible-record export includes the same authorized portal projection.
Request details and CRM note text are not copied to the general audit log; audit entries
contain only identifiers, transition/version metadata. They do not feed quant outbox features.

## Operations

Apply `npm run db:migrate` from web/ before deploying the new server. The migration is
additive; older deployed code can continue running while it is applied. New tables are not
populated by schema migration. Reimbursements use USD amounts with two decimal places;
approval is a decision only, not payment execution. Equipment/attendance/event requests
require officers to carry out the corresponding action separately.

Member photos and supporting documents are HTTPS links. File uploads, cloud-drive OAuth,
email delivery, recurring reminders and payment processing are not included. Follow-up
reminders are an in-app list; contacts require current officer ownership on new follow-ups.
Basic profile names/public sharing settings stay in Account; detailed profile visibility is separate.

## Demo data

After the base demo batch, run from web/:

```sh
node --env-file=.env.local --experimental-strip-types --import ./scripts/register-typescript.mjs scripts/seed-portal.mjs --apply
```

This explicit trusted operator seed writes 7 information entries, 5 external contacts,
1 sample sponsorship lead, 5 requests, 1 historical completed follow-up, and up to 3
profiles for original demo identities. It never overwrites an existing detailed profile,
changes a password/role, or sends mail. All sample titles are marked [Demo], addresses use
reserved example domains, and the original demo member login remains valid. A batch manifest
in audit makes reruns no-ops and identifies created rows for deliberate later cleanup.
The historical follow-up's owner is a demo member; a real follow-up may similarly retain
an owner after that officer leaves office. Editing requires reassignment to a current officer.
Demo data affects normal counts; it is not evidence of real club activity.

## Verification

`npm run test:portal` exercises SQLite; `npm run test:postgres-portal` runs the same
permissions/workflow checks in a disposable PostgreSQL schema. `scripts/test-demo.mjs`
checks seed replay, profiles/requests, and public visibility in isolated PostgreSQL.
Full gate and browser evidence are recorded in task 018. No third-party site member data
was copied into this implementation or its demo fixtures.
