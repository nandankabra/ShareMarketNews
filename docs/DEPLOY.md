# Going live

**The short version.**

```bash
npm run check
vercel login          # opens a browser; only you can do this
bash scripts/deploy.sh
```

That sets an access password if there is not one already, links the project and
deploys it. It is safe to re-run.

There is **no database step**. The deployed app fetches every upstream inside
the request through the cache in `src/lib/live/`, so there is nothing to
create, migrate, seed or backfill. `npx next build` with `DATABASE_URL` unset
succeeds; that is the intended configuration. If you are looking for the Turso
and poller setup this page used to describe, it belongs to the retired split
architecture — see [`HOSTING.md`](HOSTING.md) for why it went away, and
[`SETUP.md`](SETUP.md) if you want to run the poller for self-hosting anyway.

## Before you deploy — read this one

The app has **no user model by design**, but a deployed URL is reachable by
anyone who finds it, and the panel has mutating server actions: edit the
watchlist, trigger a refresh. Left open, a stranger could not only change your
list but drive traffic at NSE and Google *from your deployment* — the exact
thing the politeness layer exists to prevent.

So **`ACCESS_PASSWORD` is not optional in production.** Unset it locally (no
gate, no friction); set it before the first deploy.

```bash
openssl rand -base64 24
```

The cookie holds a SHA-256 of the password rather than a server-side session,
so there is nothing to store and nothing to revoke.

## By hand

```bash
npm run check
vercel link                                    # pick the existing project
printf '%s' "$PW" | vercel env add ACCESS_PASSWORD production
printf '%s' "$PW" | vercel env add ACCESS_PASSWORD preview
vercel --prod
```

`ACCESS_PASSWORD` is the only variable the deployed app needs. Preview gets it
too, on purpose: an unguarded preview URL is exactly as reachable as an
unguarded production one.

## Verify the deploy

The first three need no password — they are checking that the gate is on.

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<app>/    # 307 → /unlock
curl -s https://<app>/api/pulse                                            # 401 {"error":"Locked"}
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/unlock              # 200
```

Then let yourself in and check the panel renders. The cookie is derived, so you
can mint it without a browser:

```bash
TOKEN=$(printf 'watch-desk:%s' "$PW" | shasum -a 256 | cut -d' ' -f1)
for p in / /sectors /watchlist /options /health; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" -H "Cookie: wd_access=$TOKEN" "https://<app>$p"
done
```

Finally `GET /api/probe` (same cookie) runs every upstream from the deployed
host and prints a row each. That is the page to open first whenever anything
looks wrong — it separates "an upstream changed" from "we broke it".

## What will look wrong at first, and is not

- **`YAHOO_CHART` fails in the probe with `BLOCKED — rate limited`.** Expected.
  Yahoo refuses datacenter IPs; NSE, which everyone assumes is the strict one,
  answers Vercel fine. [`HOSTING.md`](HOSTING.md) has the measurements. It costs
  daily bars and the indicators built on them, not the rest of the panel.
- **Prices show `—` for some rows.** Quotes have no batch endpoint, so a page
  quotes a bounded number of its constituents and caches each independently.
  A second visit finds the earlier ones warm.
- **The watchlist is empty on another device.** It lives in a cookie in one
  browser. That is the design, not a sync bug.

## Rotating the password

Change `ACCESS_PASSWORD` in Vercel and redeploy. Existing cookies stop matching
immediately, since the cookie holds a hash of the password.
