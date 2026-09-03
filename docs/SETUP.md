# Setup

## Running it

```bash
npm install
npm run dev               # http://localhost:3000
```

That is all of it. There is no `.env` to copy, no schema to migrate, no seed and
no backfill: every screen fetches its upstreams on demand through the shared
cache in `src/lib/live/`. `npm run dev` on its own is the whole app, and nothing
needs to run in a second terminal to keep it current.

Locally `ACCESS_PASSWORD` is unset, so the gate is off and you land straight on
the panel. Setting it is a deployment concern — see [`DEPLOY.md`](DEPLOY.md).

## What each command is for

| Command | Why |
|---|---|
| `npm run smoke:providers` | Hits every upstream once and prints a health table. **Run this first when anything looks wrong** — it touches no cache, so it isolates "the internet changed" from "our code broke". |
| `npm run check` | `typecheck && lint && test`. Run before committing. |
| `npm run dev` | The app. |

`/api/probe` is the deployed equivalent of `smoke:providers` — same idea, run
from the host that is actually having the problem.

## The first five minutes

1. `/sectors` — 16 cards with live index levels, each drilling into its constituents.
2. `/` — the briefing: what has an event dated today or tomorrow, what is moving, what is in the news.
3. `/options` — the Nifty chain with PCR, max pain and the near-the-money ladder.
4. `/health` — every upstream and when it last answered. **This page is the answer to "why does that number look wrong".**

## When something is missing

Almost every failure shows up as an empty state rather than an error, because an
upstream refusing is a normal Tuesday. `/health` names the cause.

| Symptom | Meaning |
|---|---|
| Prices show `—` on some rows | Quotes have no batch endpoint, so a page quotes a bounded number of its constituents rather than all of them. The rest render without a price. A second visit finds the earlier ones warm. |
| Prices carry a small `BSE` mark | Yahoo is rate limiting and prices are coming from BSE instead. Real prices, different exchange — the two do not print identical numbers. Nothing to fix; it reverts on its own. |
| "0 bars" on a share page, or "indicators need about thirty sessions" | The daily-bar source failed for that symbol. Indicators need roughly 30 sessions before they say anything. |
| A sector shows no constituents | Its index file failed. `/health` will show `NIFTY_CONSTITUENTS` with the failing filename. |
| Briefing says the event calendar is unavailable | NSE is refusing. The briefing falls back to news and movement, and says so. |
| Everything is empty and `/health` is red across the board | Check your own connection before anything else. |

## Rate limits are real

Yahoo will rate-limit an IP that asks too often, and it stays limited for hours.
During development it is easy to trigger by re-running the smoke test
repeatedly. From a datacenter it is close to permanent — see
[`HOSTING.md`](HOSTING.md).

The app handles it: a 429 opens a per-host circuit, and quotes fall back to BSE
so the panel keeps real prices. If `/health` shows a Yahoo source as `BLOCKED`,
the fix is to wait.

Two rules matter when you touch anything that fetches. Every outbound request
goes through one per-host serialized queue, so **never add `Promise.all` to a
path that reaches upstream**. And these endpoints return 200 on failure — a
wrong CSV filename gives an HTML error page — so **validate shape, never trust
the status code**. [`ARCHITECTURE.md`](ARCHITECTURE.md) has the reasoning.

## Self-hosting with the poller (optional)

The Prisma schema, `src/poller/` and the scripts in `scripts/` are still in the
tree. Nothing the app renders touches them, and you do not need them — they are
kept for running your own instance that buffers into a database instead of
fetching per request.

```bash
cp .env.example .env      # DATABASE_URL="file:./market.db"
npm run db:migrate
npm run db:seed
npm run backfill          # first real data — takes a few minutes
npm run poller            # the background loop, ticks every 60s
```

`.env.example` documents the poller's budgets and retention windows. Be aware
this path is no longer what the deployed app exercises, so it gets far less
testing than the live-cache path does.
