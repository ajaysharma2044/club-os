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

## Recommended: a container host with a volume

Zero code changes. The [`Dockerfile`](Dockerfile) at the repository root already does
this: Node 22 + Python 3, `CEC_DATABASE=/data/cec.sqlite`, running as a non-root user.

```bash
# Fly.io
fly launch --dockerfile Dockerfile
fly volumes create data --size 1
# then in fly.toml:
#   [mounts]
#   source = "data"
#   destination = "/data"
fly deploy
```

Railway and Render are the same shape: deploy the Dockerfile, attach a volume, mount it
at `/data`. Any small VPS works too — this is an ordinary long-running Node process.

### Required environment

| Variable | Why |
|---|---|
| `CEC_DATABASE` | path on the mounted volume, e.g. `/data/cec.sqlite` |
| `CEC_ORIGIN` | your public origin; the API rejects cross-origin POSTs without it |
| `CEC_CHECKIN_SECRET` | HMAC key for rotating check-in codes (`openssl rand -hex 32`) |
| `CEC_BOOTSTRAP_TOKEN` | one-time token for creating the first officer account |
| `CEC_INTEGRATION_KEY` | AES key for OAuth token storage (`openssl rand -hex 32`) |

Back up the volume. It is the club's record, and it is one file — `sqlite3 /data/cec.sqlite ".backup /tmp/out.sqlite"` on a schedule is enough.

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
