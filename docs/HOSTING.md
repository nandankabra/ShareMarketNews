# Hosting this for ₹0

## The constraint that decides everything

**NSE blocks cloud datacenters.** Requests to `nseindia.com` from AWS, Azure and
Google Cloud time out or return 403, consistently. It is not a User-Agent
problem and no header fixes it.

No free cloud host solves this. Oracle's always-free VM is a datacenter IP too,
and so are GitHub Actions runners. The NSE fetches have to leave from a
residential connection.

Two further limits rule out the obvious answer:

- Vercel's free plan runs cron **once per day**, with hour-level precision.
- Its free functions time out at **10 seconds**.

So the poller cannot live there either.

## The shape that follows

Split the write path from the read path. This costs nothing architecturally,
because the app was already designed never to call upstream while rendering.

| Layer | Where | Cost |
|---|---|---|
| **Poller** (fetches, classifies, computes) | Your Mac, or a Raspberry Pi at home | Free |
| **Database** | Turso (libSQL) — 5 GB, 500M row reads/month | Free |
| **The app** (read-only) | Vercel Hobby | Free |

### Moving the database to Turso

libSQL *is* SQLite, so the schema does not change — same provider, same
no-enums and no-JSON constraints already designed around.

```bash
npm install @prisma/adapter-libsql
```

Then in `src/lib/prisma.ts`, swap `PrismaBetterSQLite3` for `PrismaLibSQL` and
set `DATABASE_URL=libsql://...` plus `TURSO_AUTH_TOKEN`. The WAL and
busy-timeout pragmas become unnecessary — `ensurePragmas()` already warns and
continues rather than failing when they are rejected.

Local development keeps pointing at a plain file.

### When your machine is off

The site stays up and serves the last sync behind its staleness banner. That is
the behaviour `/health` and `StaleBanner` were built for, not a degraded
special case.

Optionally, a GitHub Actions workflow on a 30-minute schedule can keep the
*cloud-tolerant* sources fresh — Yahoo and Google News both answer datacenter
IPs. Only the NSE event calendar goes stale, and `/health` names it.

## Verify before relying on any of this

Deploy `scripts/smoke-providers.ts` as a one-off function and read the table. If
NSE answers from your host, the poller can move to the cloud and this whole
document collapses to "run it anywhere". Plan for it not to.

## Politeness

These are unofficial, unauthenticated endpoints being read by a personal,
non-commercial tool. That is designed in, not bolted on:

- One client, one process. Every request goes through a per-host serialized
  queue in `src/lib/providers/rate-limit.ts`. There is no `Promise.all` in the
  refresh path anywhere.
- Per-host minimum gaps are constants in code — Yahoo 1.2s, NSE 2s,
  niftyindices 2s, Google News 3s. The env override can only make them longer.
- A 429 is treated as `BLOCKED`, not as retryable. It opens a circuit and the
  app stops calling that host entirely for five minutes.
- Twenty quotes per sixty-second tick is roughly twenty-four seconds of network
  per minute. The loop is idle more than half the time by construction.

Do not raise these limits to make the panel feel faster. Raise the tick budget
only if you have moved to a paid data provider that permits it.
