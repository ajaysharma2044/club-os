# Outgoing email: account access, invitations and task notifications

Status: implemented locally; live provider configuration and delivery are not verified.
This is the first officer integration slice. Gmail/Outlook inbox access, calendar sync,
Drive ingestion and message analytics are outside this change.

## Product flows

- Account settings: request email verification, change task-email preference and see
  recent request states. Verification proves mailbox access, not Cornell affiliation.
- Forgot password: generic response whether an account exists. A one-use 30-minute link
  changes the password and revokes all sessions. Membership/roles are unchanged.
- Verification: a one-use 24-hour link, consumed only by an explicit POST button.
- Officer invitations: email an existing active member invitation to an address matching
  its domain restriction. The same invitation/address pair queues once. Sharing its link
  remains possible. Invitation emails remain bearer links, not recipient-bound invitations.
- Assignment/reassignment and revision requests: queue a generic notification to an
  active member/officer with verified email and enabled task emails. Links target the
  task in the workspace. No submission, private message or review text enters email.
- Verification is requested from settings; registration does not automatically send mail.

## Architecture and contracts

Next.js transaction → encrypted SQLite email job → separate Node worker → Resend.
Adapted from Ledgly's outgoing-email/auth concepts; not a wholesale import of its NestJS
or Gmail stack. Club OS adds durable leases, retries and truthful delivery states.

Schema migration 3 is additive: `account_email` stores verification and preference;
`email_tokens` stores SHA-256 token hashes, purpose, account/email snapshot and expiration;
`email_jobs` stores encrypted immutable envelope, eligibility references and retry state.
Existing passwords/memberships are preserved. Task changes and notification insertion
commit together. Disabled email skips task notifications; it does not block normal work.
Misconfigured enabled email fails the transaction rather than silently dropping a job.

AES-256-GCM protects queued recipients, bodies and bearer links. Keep the encryption key
outside the database. Auth links use URL fragments, never request Host or URL query
parameters; link construction uses the configured canonical origin. Raw tokens are never
returned by API, placed in audit/evidence/outbox, or logged by the worker. The UI exposes
only the signed-in user's last ten request summaries. For invitations, that user is the
sending officer. Local captures contain plaintext test mail and are sensitive files.

Worker claims use `BEGIN IMMEDIATE`, a UUID lease and a 60-second lease timeout. Fetch
has a 15-second timeout. Attempts increment before transport. Retries use the same
immutable envelope and provider idempotency key; network failures, 408, 429, 5xx and
concurrent-idempotency conflicts retry with exponential delay (30 seconds to one hour),
up to eight attempts and at most 23 hours after the first attempt. Expired or exhausted
jobs require a fresh user request; there is no unsafe force-resend control.
[Resend idempotency keys expire after 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).

Eligibility is checked immediately before transport: current token validity, task owner,
active membership, notification preference, or current officer and invitation validity.
A revocation concurrent with an already-started provider request cannot retract that mail;
the linked application still checks authorization. Auth tokens themselves enforce expiry.

States: `queued`, `processing`, `captured`, `accepted`, `failed`, `cancelled`.
`accepted` means provider acceptance, not inbox delivery. Terminal jobs scrub payloads
(except decryption failures retained for operator investigation). No bounce/delivery webhook,
mail-worker alerting, automatic retention purge or multi-tenant mail is implemented yet.
Metadata and hashed tokens currently persist; define retention before broad rollout.

## Configuration and local operation

Default: `CEC_EMAIL_MODE=disabled`. No credentials are needed to run the app.
For synthetic local testing set these in a private ignored environment file:

```dotenv
CEC_EMAIL_MODE=capture
CEC_ORIGIN=http://localhost:3000
CEC_EMAIL_FROM=Club OS <test@example.test>
CEC_EMAIL_KEY=<64 random hex characters>
```

Generate the key with `openssl rand -hex 32` and store it privately. Use the same key on
web and worker. From web/, run `npm run email:work` for polling or `npm run email:once`
for one job; both load .env.local if present. Capture writes owner-only JSON under the
DB directory's `mail/` (override CEC_EMAIL_CAPTURE_DIR). Delete synthetic captures when
finished. Capture mode is rejected in production and never calls Resend.

For real delivery: set mode `resend`, HTTPS CEC_ORIGIN, verified CEC_EMAIL_FROM and
RESEND_API_KEY on the web process, and mode/key/API key on the worker. The production
Compose `email` service reads deploy/app.env and the shared persistent DB volume.
Follow [Resend's send API](https://resend.com/docs/api-reference/emails/send-email) and
verify a sender domain before enabling. Restart processes after configuration changes.
A job captures its delivery mode; changing mode cancels old-mode queued jobs.

## Recovery and deployment

1. Take a pipeline backup before applying the additive migration; retain the external key.
2. Deploy web first to create tables, then start the mail worker against the same SQLite file.
3. Inspect account email status and worker errors. Provider errors omit sensitive response
   bodies; use the provider dashboard for delivery investigations.
4. An absent worker leaves jobs queued. Restarting resumes claims/retries without new IDs.
5. Restore invalidates all email tokens and cancels/scrubs queued or processing jobs, as
   well as revoking sessions. This prevents restored links or jobs being replayed.
6. Key rotation: drain or explicitly cancel pending jobs before replacing the key on both
   processes. Back up the old key separately if retained encrypted failure records matter.
   Lost keys cannot decrypt queued jobs; issue fresh requests after configuration repair.

No external email was sent as part of implementation. Container execution and real DNS,
provider acceptance, bounce handling and deliverability require deployment verification.

## Verification

`npm run test:email`: isolated service/worker tests with mocked provider transport.
`npm run test:api`: includes a separate capture-mode email API/page suite.
Python pipeline tests cover token/job invalidation after restore.
Full acceptance evidence and browser coverage: [task 010](tasks/010-outgoing-email.md).

## Local sender setup (2026-09-17)

The user supplied a Resend key for use with Ledgly. It is saved only in ignored,
owner-readable web/.env.local, with a separate queue-encryption key and sender
`Club OS <noreply@ledgly.app>`. Credential validity and sender-domain authorization
have not been verified against Resend. Delivery remains disabled: the current local
HTTP origin does not satisfy the live-email HTTPS requirement. Configure the final
HTTPS CEC_ORIGIN, verify the sender, then enable resend mode on web and worker.
No test email has been sent. Do not copy credential values into this document.
