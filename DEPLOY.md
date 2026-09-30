# Deploying Club OS

## Choose the storage mode

The operational API supports Supabase PostgreSQL (`CEC_STORAGE=postgres`) and local
SQLite (`CEC_STORAGE=sqlite`). Supabase keeps records durable across serverless instances
and deployments. SQLite requires a persistent volume and still refuses ephemeral hosts.

| Host | Supabase operational API | SQLite operational API |
|---|---|---|
| Node container / VPS | Supported | Requires persistent disk |
| Netlify / Vercel | Supported with server environment configured | Refuses ephemeral storage |

The Python analytics engine still needs a separate durable worker/store. Moving the
operational database does not provision hosted analytics. Email stays disabled until
its worker and sender are configured deliberately.

## Supabase on Netlify or Vercel

Follow [the Supabase runbook](docs/33-postgres-migration.md) for exact variables,
verified TLS, explicit migrations, data transfer, workers and recovery.

1. Apply the committed SQL migrations and import existing data before enabling writes.
2. Configure server-only `CEC_STORAGE=postgres`, `DATABASE_URL`,
   `DATABASE_SSL_CA_PEM`, and the exact deployment `CEC_ORIGIN`.
3. Preserve existing application encryption/signing secrets. Keep `CEC_EMAIL_MODE=disabled`.
4. Deploy the updated Next.js code. Netlify uses the repository's `netlify.toml`;
   Vercel's Root Directory is `web`.
5. Verify `/api/cec/health` reports `storage: "postgres"`, then verify `/api/cec/state`
   and authenticated workflows.

Do not put database credentials in NEXT_PUBLIC_ variables. A local certificate file
path is not available on the host: configure the full certificate PEM there. Do not
use `CEC_ALLOW_EPHEMERAL=1` to bypass a missing database setting.

The local cutover is recorded in [task 013](docs/tasks/013-hosted-database.md).
Code and local environment changes do not update the live Netlify deployment by themselves.

## SQLite: the production compose stack

For the SQLite storage mode, [`compose.production.yaml`](compose.production.yaml) already runs the
whole thing — `web`, a background `worker`, an `email` sender, scheduled `backups`, an
`offsite` copy, a `monitor`, and a Caddy `proxy` for TLS — with the record on a named
`data` volume mounted at `/data` and healthchecks on the app.

```bash
cp deploy/production.env.example deploy/production.env   # set CEC_DOMAIN
cp deploy/app.env.example        deploy/app.env          # set CEC_BOOTSTRAP_TOKEN
docker compose -f compose.production.yaml up -d
```

See [docs/28-pilot-launch.md](docs/28-pilot-launch.md) for the launch runbook and
[docs/26-pipeline-operations.md](docs/26-pipeline-operations.md) for operating it.

### Or a managed container host

The same [`Dockerfile`](Dockerfile) deploys unchanged to Fly.io, Railway or Render. The
only requirement is a volume mounted where `CEC_DATABASE` points.

```bash
# Fly.io
fly launch --dockerfile Dockerfile
fly volumes create data --size 1
# fly.toml:  [mounts]  source = "data"  destination = "/data"
fly deploy
```

### Required environment

| Variable | Why |
|---|---|
| `CEC_DATABASE` | path on the mounted volume, e.g. `/data/cec.sqlite` |
| `CEC_ORIGIN` | your public origin; the API rejects cross-origin POSTs without it |
| `CEC_CHECKIN_SECRET` | HMAC key for rotating check-in codes (`openssl rand -hex 32`) |
| `CEC_BOOTSTRAP_TOKEN` | one-time token for creating the first officer account |
| `CEC_INTEGRATION_KEY` | AES key for OAuth token storage (`openssl rand -hex 32`) |

The compose stack handles backups. On a managed host, back the volume up yourself —
it is the club's record, and it is one file:
`sqlite3 /data/cec.sqlite ".backup /tmp/out.sqlite"` on a schedule is enough.

---

## Verifying a deployment

```bash
curl --fail https://<your-host>/api/cec/health
curl --fail https://<your-host>/api/cec/state
```

Health should identify the selected provider, and state should return club JSON.
A 503 can indicate unavailable storage or missing hosted configuration; inspect the
server logs without exposing credentials. Test sign-in and a permitted record workflow
as well. Use the Supabase recovery process for PostgreSQL; SQLite volume backups cannot
restore a remote database.
