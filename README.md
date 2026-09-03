# Watch Desk

A personal NSE panel: every sector and its shares, the news attached to each,
the corporate events landing today or tomorrow, candlestick technicals, and the
Nifty option chain — on one screen, for ₹0 a month.

Single user, no login, no API keys, no database.

```bash
npm install
npm run dev        # http://localhost:3000
```

That is the whole setup. Every screen fetches upstream on demand through the
shared cache in `src/lib/live/`, so there is nothing to migrate, seed or keep
running in a second terminal.

## Personal use only

This is not open-source software and it is not built to be run commercially.
See [`LICENSE`](LICENSE) — reading the code and running it privately for
yourself is fine; commercial use, redistribution and public or multi-tenant
instances are not.

That is a licensing choice, but it is also a practical one. The market data
comes from NSE, BSE, NIFTY Indices, Yahoo and Google, retrieved from their
public endpoints under their own terms of use. Those terms broadly allow
looking at the data yourself and prohibit redistributing it or building a
commercial product on it. This project claims no rights over that data and
grants you none.

## What it does

- **`/`** — Today & Tomorrow. Shares with an event dated today or tomorrow,
  fresh news, or an unusual move, each with its reasons written out.
- **`/sectors`** — 16 NSE sectoral indices, drilling into every constituent.
- **`/shares/[symbol]`** — candles with volume and moving averages, computed
  support and resistance, RSI/MACD read-out, calendar, and a week of news.
- **`/options`** — the Nifty chain: PCR, max pain, ATM IV, and the
  near-the-money ladder with open interest and buildup on both sides.
- **`/watchlist`** — shares you add yourself, with movement measured from the
  price you added them at.
- **`/health`** — every upstream, when it last worked, and when it retries next.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) — running it, and what to do when something is missing
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — why it is shaped this way
- [`docs/HOSTING.md`](docs/HOSTING.md) — hosting it free, and the upstream that actually blocks
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — the go-live checklist

## Deploying

`npm run check`, then `vercel --prod`. Set `ACCESS_PASSWORD` before you do.

The panel has no user model by design, and without a password anyone who finds
the URL can edit your watchlist and drive requests at the upstream providers
from your deployment — the exact thing the politeness layer exists to prevent.
Locally, leave it unset: no password means no gate.

## Not advice

Everything here is descriptive. The option analytics report positions that are
already open; the news panel reports what a share has historically done. Nothing
in this app tells you what to buy or sell, and nothing in it is a forecast.
Verify anything you intend to act on against an official source.

Charts by [TradingView Lightweight Charts™](https://www.tradingview.com/),
Apache-2.0.
