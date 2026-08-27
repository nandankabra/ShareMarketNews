# Watch Desk

A personal NSE panel: every sector and its shares, the news attached to each,
the corporate events landing today or tomorrow, candlestick technicals, and the
Nifty option chain — on one screen, for ₹0 a month.

Single user, no login, no API keys.

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm run backfill
npm run dev        # http://localhost:3000
npm run poller     # second terminal — keeps it current
```

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
- [`docs/HOSTING.md`](docs/HOSTING.md) — hosting it free, and the NSE constraint that decides how

## Not advice

Everything here is descriptive. The option analytics report positions that are
already open; the news panel reports what a share has historically done. Nothing
in this app tells you what to buy or sell, and nothing in it is a forecast.

Charts by [TradingView Lightweight Charts™](https://www.tradingview.com/),
Apache-2.0.
