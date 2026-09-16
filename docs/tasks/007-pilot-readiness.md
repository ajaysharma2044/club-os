# Task: Pilot onboarding, membership and deployment preparation

Status: local implementation complete; live deployment awaiting host configuration

## Acceptance criteria

- An invitation cannot authenticate an existing account without its password.
- Claims are transactional, capacity-limited and idempotent; member invitations
  cannot grant officer rights or bypass removed/suspended membership.
- Officers can invite, promote/demote, remove/restore, and transfer leadership.
  Mutations require fresh password proof, current membership versions, officer
  authorization and a remaining active officer. Audit history survives departure.
- Complete officer setup → invitation → join → task assignment/submission → revision
  → resubmission → approval through the real HTTP API.
- Prepare durable single-host deployment, process restarts, encrypted off-machine
  backups, retention, health checks and operational alerts; record external blockers.

## Scope and validation

- Versioned migration 2 for membership versions and last-officer protection.
- Added pilot API suite to the full gate; initial run passed all pilot assertions.
- Operations unit tests cover stale health, privacy-safe alert codes, deduplication,
  recovery notices, failed-backup no-prune behavior, retention and checksum refusal.
- Browser: officer creates invite; wrong existing-account password rejected; new
  member joins; last-officer demotion rejected; member removal and restoration;
  leadership transfer immediately removes outgoing officer controls.
- Final full gate evidence:
  `work/verification/2026-09-16T04-05-09.283Z-42700/result.json`.
  API stage passed 278 existing assertions, 52 route checks, 12 organization
  isolation checks, and 76 pilot assertions. All six stages passed.
- Deployment YAML parsed; internal web port and worker restart configuration
  checked. Container smoke script passed shell syntax checking. Runtime smoke
  added to CI, not executed here because Docker is absent.
- Final self-review retained account-created audit records for invitation joins,
  normalized/validated invite limits and domains, checked last-officer transactions,
  and verified restore/removal cannot silently restore officer rights.
- `git diff --check` passed. Local Node 26/Python 3.14 differ from CI Node 22/Python 3.12.
- Pre-change local snapshot: `web/.data/backups/backup-1789530444755599000`.

## Review and delivery

Self-review. Local only, no commit/push/deployment. Missing host/domain, backup and
alert credentials prevent live production activation. Docker/restic/Caddy absent
locally; Compose YAML/service structure and shell syntax can be checked, but cannot
substitute for runtime checks. Deployment instructions: `docs/28-pilot-launch.md`.
Email verification and password recovery remain unconfigured and are stated in UI.
