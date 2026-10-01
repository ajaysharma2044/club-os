# Task: Demo data and Home spacing

Status: done — demo data and spacing update live

## Acceptance criteria

- Add explicitly synthetic sample events, projects, tasks, people and an Inbox group so the user can test the deployed product.
- Preserve existing accounts and records. Separate demo login has member permissions, never officer access; no external notifications.
- Seed is atomic and repeat-safe. Preserve test edits on repeated execution and record a non-secret batch manifest.
- Home has a visible top inset, controlled card spacing and readable event rows on desktop and mobile.

## Design and implementation

Retain navy #1c2b3a, ink #1a2330, white #ffffff, background #f0f3f8 and blue #0c5fbf; existing Figtree/Bricolage fonts. Left-aligned Home uses a 32px desktop inset and 24px section gaps. Explicit paragraph margins replace browser defaults inside the next-action card. Remove its decorative animated underline. Scope rules to member-dashboard.

Seed CLI requires --apply and configured Postgres. A single database request/transaction creates domain records and a demo.seeded audit manifest. The trusted CLI uses shared entity validators, item/evidence/history/outbox helpers, plus scoped membership updates for newly registered demo accounts. It requires no officer and creates no officer account; no existing roles change. Passwords are random and stored in ignored work/demo/login.txt with mode 0600, never logged or committed. Demo peers have unshared random passwords. Emails are disabled. Private conversation content/relationships are excluded from the manifest.

## Verification

- Isolated real PostgreSQL seed/replay test passed, including a workspace with no officer. Replay preserved the password and IDs, public state exposed the three events but no tasks, task submission history remained valid, and no officer account was created. Test schema dropped in finally.
- Full gate passed: `work/verification/2026-10-01T04-02-00.306Z-22351/result.json` (types, pure suites, Python, API, signals, build; Node 26 locally).
- Browser: empty and populated Home checked; 320/390/768/1440px document widths matched viewport widths. Mobile header measured 64px at all phone/tablet sizes; Home heading started at 88px (24px below header), desktop at 32px. Mobile menu opened without overflow and Events navigation closed it. Screenshots inspected at phone and desktop; desktop screenshots were clipped by the Codex panel, so DOM bounds supplied full-width checks.
- Live seed completed: 3 members, 3 future events, 2 projects, 3 tasks, 1 document, 1 group conversation. Earlier seed attempts rolled back completely before adapting the CLI to work without officer setup. Existing accounts/roles were preserved.
- Production demo member login returned member role with 3 demo tasks and 3 demo events; validation session logged out. No real users were messaged. Demo password is in ignored `work/demo/login.txt`.
- Physical-device and full assistive-technology checks were not performed.

## Limits

Demo records live in the CEC workspace and are labeled [Demo]; this is not a separate tenant. They participate in normal counts and operational evidence. Do not treat them as real club activity. The seed does not reset edited records or refresh dates on replay. The manifest identifies created accounts and items for deliberate later cleanup; retained audit/history should not be deleted casually. No automatic destructive reset is supplied.

Reviewer: self-review.

## Operator commands

From `web/`, with the existing verified TLS/PostgreSQL configuration in `.env.local`:

```sh
node --env-file=.env.local --experimental-strip-types --import ./scripts/register-typescript.mjs scripts/test-demo.mjs
node --env-file=.env.local --experimental-strip-types --import ./scripts/register-typescript.mjs scripts/seed-demo.mjs --apply
```

Create `work/demo/` in the repository first. Credentials are written before database
commit so a lost connection cannot lose access to committed demo records. After a
failed attempt with no committed batch marker, move the unused credential file aside
before retrying. A committed batch replays without changing passwords or records.
The test command creates and drops a random `club_os_test_*` PostgreSQL schema.

## Production delivery

Commit `409137fbea3edd95ac9635d84e816ff60b0895ee` published through [Netlify clean rebuild](https://app.netlify.com/projects/jade-palmier-e20b3c/deploys/6abddc82bbc8a5c303ba82cc). The first attempt failed in the existing Google font loader; retrying without cache succeeded without code changes. Live browser verification found the new dashboard class/spacing, all three demo events and no horizontal overflow. Health returned HTTP 200 with PostgreSQL storage.
