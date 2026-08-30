# Hosting this for ₹0

## The constraint everyone assumes, and what was actually measured

The received wisdom — and what this document said until it was checked — is
that **NSE IP-blocks cloud datacenters**, so the fetching has to leave from a
residential connection, so the poller has to run on your own machine, so the
database has to be somewhere both it and the web app can reach.

That is a long chain of consequences resting on one claim, and the claim is
wrong for this deployment. `GET /api/probe` runs every upstream from the
deployed host and prints what happened. From Vercel's `iad1`:

| Source | Result |
|---|---|
| `nseindia.com` market status | ok — `Close · NIFTY 24175.65` |
| `nseindia.com` all indices | ok — 139 indices |
| `nseindia.com` event calendar | ok — 51 events |
| `nseindia.com` option chain | ok — 18 expiries |
| `nseindia.com` historical OHLC | ok |
| `niftyindices.com` constituents | ok |
| `news.google.com` RSS | ok — 40 items |
| `api.bseindia.com` quote | ok |
| `query1.finance.yahoo.com` | **BLOCKED — 429** |

NSE answers a datacenter fine. **Yahoo is the one that refuses**, which is
precisely backwards from the assumption, and it matters because Yahoo was the
only planned source of daily bars — candles, RSI, MACD, ATR and the support
levels all read from them. `nse/parse-historical.ts` exists because of this.

Two caveats worth keeping. This was measured from one region on one day, and
bot defences change without notice — rerun the probe rather than trusting this
table. And "answers today" is not permission: the politeness layer matters more
now that requests leave from a shared address, where being rude gets a whole
datacenter blocked rather than just you.

## The shape that follows

With every upstream reachable from the host, the split architecture is
unnecessary. There is no poller, no database, and nothing to keep in sync.

| Layer | Where | Cost |
|---|---|---|
| Fetching, parsing, indicators | Inside the request, on Vercel | Free |
| Cache | Next.js Data Cache (`unstable_cache`) | Free |
| Watchlist | A cookie in your browser | Free |

### What replaced the database

The database existed to buffer: the poller wrote on its own schedule and pages
read from disk, so nobody waited on an upstream and the upstreams saw a slow
drip rather than a burst. The cache does the same job from the other side.

An entry is keyed by the call and its arguments and shared across every
visitor, so **an upstream is called once per revalidation window no matter how
many people load the page**. That is a stronger guarantee than the per-host
queue gave, not a weaker one — the queue spaced requests out, this removes
most of them.

Failures are cached too, for one window. It looks wrong and is not: a rejected
promise is not cached at all, so a failing upstream would be re-hit on every
single request, which is exactly the stampede this layer exists to prevent.

TTLs live in `src/lib/live/cache.ts`.

### What it costs

**Quotes have no batch endpoint.** Yahoo's batch paths need a crumb, and NSE's
`equity-stockIndices` — which used to return a whole index with prices in one
response — was removed and now 404s. So a quote is one call per share, and a
sector page quotes a bounded number of its constituents rather than all of
them. The rest of the table renders without a price; each quote is cached
independently, so a second visit finds the earlier ones warm.

**The sector grid no longer shows each sector's top gainer and loser.** That
needs a quote for every constituent of every sector — something the poller had
already collected, and which would now be hundreds of calls to render one
screen. Those live on the sector page instead.

**The watchlist lives in one browser.** It does not follow you to your phone,
and clearing site data clears it.

**"New to you" is weaker.** The old highlight compared a story against
`firstSeenAt`, a fact only a database could hold. Without one, freshness is
measured from the published time, so a story published three hours ago and
discovered just now reads as three hours old.

## Verify before relying on any of this

Open `/api/probe` on the deployed host and read the table. It is the first
thing to run when the app looks wrong, because it separates "an upstream
changed" from "we broke it" — and, as the top of this page shows, it is also
how an assumption that shaped the entire design turned out to be false.
