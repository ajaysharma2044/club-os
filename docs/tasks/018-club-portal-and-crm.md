# Task: Club information, profiles, requests and relationship follow-up

Status: verified; deployment pending

## Accepted scope

Richer self-managed profiles; searchable People; editable club information, leadership,
recruitment information, FAQs, announcements and resources; member requests with an
 officer review queue; private CRM follow-up history for members and external contacts.
Seed ordinary club examples in the live workspace. No cohorts, onboarding programs,
pledging, fraternity features, merit opportunities, credits or participation scoring.
Existing commercial sponsorship pipeline remains separate from member activities.

## Acceptance criteria

- Guests read only published public information. Members see club resources and only
  their own requests. Officers review requests and maintain club information/CRM.
- Profile owner controls detailed profile visibility; private Inbox content never enters CRM.
- Every write checks current server permissions and organization; updates use versions.
- Request creation is idempotent, decisions/history atomic, reviewer feedback visible,
  cancellation/resubmission supported; approval does not imply payment or reservation.
- New additive Postgres migration and matching SQLite tables; foreign keys retain scope.
- Search/filter and empty/error states; mobile forms and keyboard-accessible dialogs.
- Repeat-safe demo data with no real account modifications or external messages.

## Design

Retain navy #1c2b3a, ink #1a2330, white #ffffff, background #f0f3f8, blue #0c5fbf;
Figtree body/Bricolage headings. Keep five primary navigation entries. Secondary Club
info and Requests links lead to scoped pages. People uses searchable profile cards;
requests and follow-ups use dated records with explicit status, owner and next action.
Reuse existing modal/editor primitives; add module-level components and one data hook.

## Verification

- SQLite and isolated PostgreSQL portal suites passed: detailed-profile privacy, public/draft visibility, current-role authorization, version conflicts, request replay, ownership, self-review rejection, request history and private CRM.
- Extended demo seed passed in an isolated PostgreSQL schema, including replay with unchanged IDs and public/member projection checks.
- Full gate passed: `work/verification/2026-10-01T04-51-54.226Z-31603/result.json` (types, pure suites, Python, API, signals and production build; local Node 26). A prior type check caught the FormEvent generic required for FormData; it was corrected.
- Initial browser pass: guest information at 390px; member reimbursement submission ($18.75), profile update, skills search, invalid HTTPS-link draft preservation and Escape focus restoration; officer approval/filter/history and relationship creation. At 320px People/relationship pages had no document overflow.
- Browser findings fixed: missing native date value at submit (shared Editor now serializes named native controls), duplicate People h1, ambiguous initial relationship selection. Native date recheck passed: 2026-10-10 17:00 local persisted and displayed 20:00 ET. Officer information publication passed with category, visibility and status preserved. Information page widths matched 320/390/768/1440px viewports; viewport restored.
- Production migration 002 applied/verified alongside immutable 001. Live seed created 7 information entries, 6 CRM records (5 contacts and 1 sample deal), 5 requests, 1 historical follow-up and 3 detailed profiles. No actual accounts or roles were changed.

Reviewer: self-review.

## Delivery limits

Profile photos/documents use HTTPS links; uploads are not part of this update. Reimbursement
approval does not send payments; other requests record decisions and require the actual
club action separately. Follow-up reminders are in-app, without outgoing mail. The live club
had no officer at implementation time; a question about granting the user’s account admin
access is separate from feature implementation and no role changes are assumed.
