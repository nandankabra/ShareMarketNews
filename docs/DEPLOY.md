# Going live

**The short version.** Log in to both services — these open a browser, so only
you can do them — then run one script:

```bash
turso auth login
vercel login
bash scripts/deploy.sh
```

That creates the database, pushes the schema, loads the first data from this
machine, generates and sets an access password, and deploys. It is safe to
re-run; every step checks whether it has already been done.

The rest of this page is what that script does, in case you would rather do it
by hand or something goes wrong.

## Before you deploy — read this one

The app has **no user model by design**, but a deployed URL is reachable by
anyone who finds it, and the panel has mutating server actions: edit the
watchlist, trigger a refresh. Left open, a stranger could not only change your
list but drive traffic at Yahoo and Google *from your deployment* — the exact
thing the politeness layer exists to prevent.

So **`ACCESS_PASSWORD` is not optional in production.** Unset it locally (no
gate, no friction); set it before the first deploy.

```bash
openssl rand -base64 24
```

## 1. Database — Turso

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create watch-desk
turso db show watch-desk --url          # libsql://watch-desk-<you>.turso.io
turso db tokens create watch-desk       # the auth token
```

Push the schema. Prisma migrations run over the libSQL URL directly:

```bash
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npx prisma migrate deploy
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npm run db:seed
```

Nothing about the schema changes between a local file and Turso — libSQL *is*
SQLite. `src/lib/prisma.ts` picks the adapter off the URL scheme by itself.

## 2. First data load

Run this **from your own machine**, not from CI. NSE blocks datacenter IPs, so
this is the one step that must leave from a home connection:

```bash
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npm run backfill
```

## 3. The app — Vercel

```bash
npx vercel            # link the project
npx vercel --prod
```

Set these in **Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `libsql://…` |
| `TURSO_AUTH_TOKEN` | the token from step 1 |
| `ACCESS_PASSWORD` | the password you generated |

Nothing else is required. The deployed app only ever reads the database — it
runs no cron, no background work and makes no upstream calls, so none of
Vercel's free-plan limits are in play.

## 4. Keeping it current

The poller stays on your machine. It writes to Turso; the site reads from it.

```bash
DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npm run poller
```

To have it start with your Mac, `launchd` is the least surprising option — a
plist calling `npm run poller` in this directory with `KeepAlive`.

When it is not running the site stays up and serves the last sync behind its
staleness banner. That is designed behaviour, not an outage.

## Verify the deploy

1. Open the URL — you should land on `/unlock`, not the panel.
2. Enter the password. `/sectors` should show 16 cards with index levels.
3. `curl https://your-app.vercel.app/api/pulse` → `401 {"error":"Locked"}`.
4. `/health` should list every source. Rows will read `NEVER RUN` until the
   poller has written from your machine — the backfill in step 2 populates the
   first ones.

## What will look wrong at first, and is not

- **Prices show `—`.** Yahoo rate-limits by IP and it can last hours. `/health`
  names it as `BLOCKED` with a retry time. It clears on its own.
- **`0 bars` on share pages.** Daily bars land at 16:15 IST via the poller.
- **NSE rows fail if you ever run the poller in the cloud.** They will. That is
  the constraint in `docs/HOSTING.md`, not a bug.

## Rotating the password

Change `ACCESS_PASSWORD` in Vercel and redeploy. Existing cookies stop matching
immediately, since the cookie holds a hash of the password rather than a
server-side session.
