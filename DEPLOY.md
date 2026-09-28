# Deploying Club OS

Read the first section before choosing a host. It is the whole decision.

---

## The constraint

The entire backend is **one SQLite file** written with `node:sqlite`. That choice buys
a lot — no external database, no connection pool, transactional writes, and a record
you can copy, inspect and hand to a club as a single file.

It costs exactly one thing: **the process needs a disk that survives.**

On a serverless host every invocation gets a fresh, empty filesystem. The database is
created empty on each cold start, writes vanish when the instance recycles, and two
concurrent requests can be looking at two different databases. Nothing errors. A member
signs up, sees a confirmation, and is simply gone.

`web/lib/cec/db.ts` refuses to open on those hosts rather than lose data quietly, and
returns a `503` with a human-readable reason — not a `500`, because "please try again"
would be false.

| Host | Marketing site | The actual product |
|---|---|---|
| **Fly.io / Railway / Render / any VPS** | works | **works** |
| **Vercel / Netlify / Lambda** | works | **refuses to start — no persistent disk** |

---

## Recommended: the production compose stack

Zero code changes. [`compose.production.yaml`](compose.production.yaml) already runs the
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

## Vercel and Netlify

You can deploy the **marketing frontend** to either. Only two server files reach the
database (`app/api/cec/[...path]/route.ts` and `app/cec/[[...section]]/page.tsx`);
everything else is client-rendered. So the public pages render normally and the club
app reports, honestly, that it is not available on that host.

That is a legitimate setup — marketing on Vercel, the app on a container host behind a
subdomain — and it is how most products with a stateful backend are arranged.

**Vercel:**

```bash
npx vercel login          # interactive: opens a browser
npx vercel link           # set Root Directory to: web
npx vercel --prod
```

Set Root Directory to `web` when importing, or the build will not find the Next.js app.

**Do not** set `CEC_ALLOW_EPHEMERAL=1` to get past the guard on a real deployment. That
override exists for a throwaway demo where losing every record is the expected and
understood outcome. On anything a member might sign up to, it is a way of losing their
data without telling them.

---

## If you specifically want the app on Vercel

That requires replacing SQLite with a hosted Postgres (Neon, Supabase, Vercel Postgres).

It is a real migration, not a config change. Measured on the current codebase:

- **461** `db()` call sites across **32** files
- **504** synchronous `.get()` / `.all()` / `.run()` calls
- **401** exported functions, of which only **9** are currently `async`

`node:sqlite`'s `DatabaseSync` is synchronous; every Postgres client is not. So the
migration is not "swap the driver" — it is converting ~500 call sites to `await` and
cascading `async` through nearly 400 functions and all of their callers, plus rewriting
75 `CREATE TABLE` statements and the `PRAGMA`-based migrations.

That is worth doing when the product needs horizontal scale. It is not worth doing to
satisfy a hosting preference, and a container host gives you the same result today for
roughly the cost of a coffee per month.

---

## Verifying a deployment

```bash
curl -s https://<your-host>/api/cec/state | head -c 200
```

- A JSON body with club state → working.
- `503` with *"Club OS is not available on …"* → the host has no persistent disk. Expected on Vercel/Netlify; move the app to a container host.
- `500` *"Unable to complete this request"* → a genuine fault. Check logs.
