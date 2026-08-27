# Setup

## Running it

```bash
npm install
cp .env.example .env
npm run db:migrate        # creates prisma/market.db
npm run db:seed           # 16 sectors, 2 option underlyings, source bookkeeping
npm run smoke:providers   # is the internet still shaped the way we think?
npm run backfill          # first real data — takes a few minutes
npm run dev               # http://localhost:3000
```

`npm run dev` on its own is a working app. `npm run poller` in a second terminal
is what makes it stay current.

## What each command is for

| Command | Why |
|---|---|
| `npm run smoke:providers` | Hits every upstream once and prints a health table. **Run this first when anything looks wrong** — it touches no database, so it isolates "the internet changed" from "our code broke". |
| `npm run backfill` | Runs every refresh task once, in dependency order. Safe to re-run; everything upserts. |
| `npm run poller` | The background loop. Ticks every 60s and decides what is due. |
| `npm run check` | `typecheck && lint && test`. |
| `npm run db:studio` | Prisma Studio, for looking at what actually landed. |

## The first five minutes

1. `/sectors` — 16 cards with live index levels, each drilling into its constituents.
2. `/` — the briefing: what has an event dated today or tomorrow, what is moving, what is in the news.
3. `/options` — the Nifty chain with PCR, max pain and the near-the-money ladder.
4. `/health` — every upstream, its last success, and its next retry. **This page is the answer to "why does that number look wrong".**

## When something is missing

Almost every failure shows up as an empty state rather than an error, because
the poller is expected to be off much of the time. `/health` names the cause.

| Symptom | Meaning |
|---|---|
| Prices all show `—` | Yahoo is rate limiting, or the poller has not run. Check `/health` for a `BLOCKED` row and its next-retry time. |
| "0 bars" on a share page | The post-close snapshot has not run for that share yet. It happens at 16:15 IST, sliced 25 shares per tick. |
| "indicators need about thirty sessions" | Fewer than 30 daily bars stored. Same cause. |
| A sector shows no constituents | Its index file failed. `/health` will show `NIFTY_CONSTITUENTS` with the failing filename. Constituents are never wiped by a failed sync — they need seven days of absence to be pruned. |
| Briefing says the event calendar is unavailable | NSE is blocking. The briefing falls back to news and movement and says so. |

## Rate limits are real

Yahoo will rate-limit an IP that asks too often, and it stays limited for hours.
The app handles this — a 429 opens a per-host circuit that stops calls for five
minutes, and prices simply grey out — but during development it is easy to
trigger by re-running the smoke test repeatedly. If `/health` shows
`YAHOO_QUOTES` as `BLOCKED`, the fix is to wait.
