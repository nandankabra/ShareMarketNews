# Architecture

## Politeness and provenance

This reads unofficial, unauthenticated endpoints for a personal,
non-commercial tool. Every source and its status:

| Source | Endpoint | Status |
|---|---|---|
| NSE market status | `api/marketStatus` | Unofficial, cookie-gated |
| NSE event calendar | `api/event-calendar` | Unofficial, cookie-gated |
| NSE corporate actions | `api/corporates-corporateActions` | Unofficial, cookie-gated |
| NSE index levels | `api/allIndices` | Unofficial, cookie-gated |
| NSE option chain | `api/option-chain-v3` | Unofficial, cookie-gated, needs an explicit expiry |
| Nifty constituents | `niftyindices.com/IndexConstituent/*.csv` | Public files |
| Quotes & bars | Yahoo `v8/finance/chart` | Unofficial, rate-limited by IP |
| Fallback quotes | BSE `getScripHeaderData` | Unofficial; used only when Yahoo is throttled |
| Fallback 52-week | BSE `HighLow` | Unofficial; fetched once per share |
| BSE scrip codes | BSE `ListofScripData` | Unofficial; one request covers all listed equities |
| Share search | Yahoo `v1/finance/search` | Unofficial |
| News | Google News RSS | Public feed, non-commercial use only |

Dead ends, recorded so nobody re-derives them: `api/option-chain-indices` and
`api/equity-stockIndices` now 404; Yahoo `quoteSummary` returns 401 without a
crumb; NSE `api/quote-equity` is a hard 403; NSE historical endpoints return
503; stooq gates behind a JavaScript proof-of-work challenge; BSE
`StockReachGraph` returns only the current session whatever `flag` is passed,
and `StockPriceCSVDownload` returns an empty body.

**Daily bars therefore come from Yahoo alone.** Prices have a fallback; history
does not. When Yahoo is throttling, charts render from whatever bars are already
stored and the share page says so.

See `docs/HOSTING.md` for the rate-limit rules. They are not advisory.

## The governing fact

**Every one of these upstreams returns HTTP 200 when it fails.**

- A wrong constituents filename returns a full HTML web page.
- An expired NSE cookie returns a login page.
- An unknown Yahoo symbol returns `{chart:{result:null}}`.
- NSE's historical endpoint answers 503 on one path and JSON on another that
  looks interchangeable with it.
- Google News pads a thin feed with entirely unrelated stories.

So status codes are close to worthless, and every response is validated by
*shape* before it is believed. That single fact explains most of the structure
below.

## Shape

```
providers/          fetch + a sibling pure parser, per upstream
  http.ts           politeFetch: one UA, hard deadline, retry policy
  rate-limit.ts     per-host serialized queue with floors
  circuit.ts        a 429 stops calls to that host entirely
live/               the read path — no database behind any of it
  cache.ts          liveSource(): cached, shared, never throws
  sources.ts        one cached accessor per upstream
  directory.ts      symbol to company name, via BSE's scrip master
  analysis.ts       pure: every indicator, from one array of bars
  health.ts         ask every upstream and report what happened
ta/                 pure indicators over Candle[]
news/               pure classification and relevance
notice/score.ts     pure: the today/tomorrow rule
options/analytics   pure: PCR, max pain, OI buildup
services/           server-only read models for the pages
watchlist/store.ts  the watchlist, in a cookie

refresh/, poller/   unused by the deployed app; kept for self-hosting
```

The read path holds no state. A page calls a `liveSource()`, which returns a
cached result or fetches one — so the same request serves every visitor inside
its window, and a failure is cached too rather than re-hit on every render.

`prisma/` and `poller/` still exist and still work if you want to run this
against a database at home. Nothing the deployed app renders imports them, and
`DATABASE_URL` is optional precisely so that stays true.

Every file that touches the network only builds a URL, calls `politeFetch`, and
hands the response text to a pure parser. That split is why every parser is
tested against a real captured payload with no mocking at all.

## Decisions worth knowing

**Prices have two sources; history has one.** Yahoo rate-limits by IP for hours
at a time, which used to take every price in the app down with it. BSE lists the
same companies on separate infrastructure, joined on ISIN — the exchanges
disagree on names and tickers, an ISIN does not. Yahoo stays preferred because
it also carries volume, which BSE's quote endpoint does not expose at all.

The two exchanges do not print the same price, so each quote records where it
came from and BSE-sourced prices are labelled on screen. Passing one off as the
other would be a small, quiet lie.

**The poller and the app run the same code.** Tasks are plain functions; the
poller schedules them and the UI can call them directly. That symmetry is what
makes "the poller is not running" a degraded mode rather than a broken app.

**Nothing fetches during render.** Pages read the database and say how old it
is. This is also what makes the free hosting split possible.

**Indicators are computed once, after the close.** A sector table of seventy
rows would otherwise re-derive seventy 250-bar series per page view.

**Calendar dates are IST day-key strings, not timestamps.** A UTC server flips
"today" at 18:30 IST — three hours after the market closes — which would
silently drop that evening's briefing.

**SQLite has no enums, no JSON and no date type.** Those become String columns
with TypeScript unions in `src/lib/db/enums.ts`. Volume is a Float rather than
BigInt, because doubles are exact past 2^53 and BigInt does not survive the RSC
boundary.

**The score is never shown.** It orders the briefing; the reasons are what the
reader gets. A number cannot be argued with.

## The line this app does not cross

It describes; it does not advise.

The option-chain page reports open interest, PCR, max pain and buildup — all
descriptions of positions already open — and says on screen that none of it is a
recommendation. The news reaction panel reports what a share has historically
done on its own heaviest-news days, refuses to quote a range from fewer than
three of them, and carries "Past reaction, not a forecast" wherever it appears.

There is no code path anywhere that emits a buy or sell instruction, and there
should not be one.
