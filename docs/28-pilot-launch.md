# Pilot launch: onboarding, membership and operations

## Implemented locally

- Invite claims authenticate existing accounts with their password. New members
  choose a reusable password. Invitation capacity/claim/account/session writes
  are atomic; retrying a claim does not consume another seat.
- Member invitations cannot grant officer access. Older officer invitations are
  refused. A removed/suspended member cannot use an invitation to restore access.
- Officers manage invitations and roles at **People → Roster**. Promote, demote,
  remove, restore and transfer require the officer's current password. Optimistic
  versions reject stale edits. The last active officer cannot be removed/demoted.
- Transfer promotes the selected member and demotes the outgoing officer atomically;
  other officers keep their roles. Removal revokes sessions and preserves history.
- Schema migration 2 adds membership versions and a last-officer database guard.
- `npm --prefix web run test:pilot` runs the complete officer setup → invitation →
  member join → assignment → submission → revision → resubmission → approval flow,
  plus account takeover, stale edits, access removal, transfer and concurrent claims.

Email ownership/affiliation is not verified. Password reset/email recovery is not
configured. Legacy passwordless accounts cannot authenticate via invitations;
use a verified recovery process before restoring those accounts. Do not reset an
account password based solely on knowing its email or possessing an invite code.

## Production package (prepared, not deployed)

`compose.production.yaml` starts:

| Service | Purpose |
|---|---|
| web | Next.js on a persistent `/data` volume |
| worker | Retry outbox delivery and create daily SQLite snapshots |
| offsite | Encrypt snapshots with restic and upload to the configured remote repository |
| monitor | Check web/worker health, error activity, backlog, disk and backup freshness |
| proxy | Caddy HTTPS endpoint; application port stays internal |
| permissions | One-time ownership setup for dedicated application volumes |

Services restart after process exits/host restart when Docker is running. Health
checks expose unhealthy services; they do not themselves restart a hung process.
Monitor alerts on meaningful state changes and hourly while a problem remains,
then reports recovery. It emits fixed operational codes, never user records,
request bodies, names or email addresses. If the entire host is offline, its own
monitor cannot alert: configure an external uptime check against `/api/cec/health`.

## Host configuration

Requires one Linux host with Docker Engine + Compose, DNS pointing to that host,
and inbound TCP 80/443 (UDP 443 optional). No horizontal replicas or ephemeral
serverless filesystem. Pin approved image digests before production rollout.

1. Copy `deploy/*.env.example` to the corresponding `.env` files and replace every
   placeholder. Set domain in `deploy/production.env`, generate a fresh bootstrap
   token in `deploy/app.env`, put remote repository/provider credentials in
   `deploy/backup.env`, and an HTTPS JSON webhook in `deploy/monitor.env`.
2. Create `deploy/secrets/restic-password` containing a strong unique repository
   password; retain an independent protected copy. Losing it loses backup access.
   Restrict env files to mode 600. The restic password file must be readable by
   container UID 1000; on the Linux host use owner 1000 and mode 600. The containing
   directory should be mode 700. Never commit these files or paste credentials into chat.
3. The webhook must accept JSON `{ "text": "message" }`. Use a compatible endpoint
   or adapter; no messaging/email provider has been connected here.
4. Validate the actual host configuration before starting:

```sh
docker compose --env-file deploy/production.env -f compose.production.yaml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yaml build
docker compose --env-file deploy/production.env -f compose.production.yaml up -d permissions web worker
```

The app's first health request migrates the database. Before upgrading an existing
installation, take a paired backup and rehearse restore; preserve existing volume
names. Never use `docker compose down -v` on a live installation.

## Initialize and prove off-machine backup

Configure a dedicated remote repository. Local paths are rejected by the offsite
worker; supported configuration prefixes include S3, SFTP and HTTPS restic REST.
No repository is silently created when authentication/network access fails.

```sh
docker compose --env-file deploy/production.env -f compose.production.yaml run --rm --no-deps offsite python3 ../services/quant/operations.py init-repository
docker compose --env-file deploy/production.env -f compose.production.yaml run --rm --no-deps offsite python3 ../services/quant/operations.py offsite --once
```

The worker uploads only complete checksum-validated snapshots, never a live SQLite
file copied without its WAL. Remote retention applies only to host/tag `club-os`:
7 daily, 4 weekly and 3 monthly snapshots, with pruning. Seven local copies remain,
and local pruning occurs only after successful off-machine processing. Backups
contain private data, password hashes and consent state; choose retention consistent
with the pilot's data policy. Provider versioning/lifecycle rules may retain deleted
objects separately. Credentials need only the dedicated backup repository's access.
Weekly `restic check` validates repository structure; it is not a full restore drill.

Before enabling public access, restore a remote snapshot into a new isolated host
folder. Mount that folder at `/restore` for the following one-off container (create
it owned by UID 1000 first):

```sh
docker compose --env-file deploy/production.env -f compose.production.yaml run --rm --no-deps -v /srv/club-os-recovery:/restore offsite restic restore latest --host club-os --tag club-os --target /restore
```

Locate its `/restore/backups/backup-TIMESTAMP`, then run the existing pipeline restore
command against that snapshot and a new `/restore/verified` directory using the same
mount. It validates checksums/integrity and revokes sessions. Review records and
reconcile post-backup deletions/consent revocations before exposing a recovered copy.
See [pipeline recovery](26-pipeline-operations.md). Record the elapsed restore time.

## Enable alerts and HTTPS

The next command sends one clearly labeled test notification to the configured
endpoint. Check delivery before leaving the pilot unattended.

```sh
docker compose --env-file deploy/production.env -f compose.production.yaml run --rm --no-deps monitor python3 ../services/quant/operations.py test-alert
docker compose --env-file deploy/production.env -f compose.production.yaml up -d
```

Verify HTTPS, sign-in and a real pilot workflow, and verify that worker and offsite
services become healthy. Enable Docker at host boot. Configure an external uptime
check and alert recipient; a container restart policy alone is not monitoring.

## Validation boundary

Local application/pipeline tests and browser scenarios are recorded in
`docs/tasks/007-pilot-readiness.md`. This machine has no Docker, restic or Caddy
runtime, so container startup, live certificates, real remote upload/restore and
webhook delivery were not executed here. `scripts/production-smoke.sh` is supplied
and added to CI for container build, health, durable restart and SQLite backup checks.
Actual host deployment requires the host/domain, backup repository, credentials and
alert destination; these have not been supplied.

Implementation references: [Compose startup readiness](https://docs.docker.com/compose/how-tos/startup-order/),
[restic repository configuration](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).
