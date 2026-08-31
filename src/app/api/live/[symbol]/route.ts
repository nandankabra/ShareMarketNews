import { NextResponse } from "next/server";

import { resolveShare } from "@/lib/live/directory";
import { applyLivePrice, toIntradayCandles } from "@/lib/live/intraday";
import { liveIntraday, liveQuote } from "@/lib/live/sources";

/**
 * The session for one share, and nothing else.
 *
 * The page used to stay current by re-rendering itself every thirty seconds,
 * which worked but rebuilt the chart each time — the canvas was torn down and
 * recreated, so any zoom or pan was lost and the whole thing blinked. A broker's
 * chart does not blink: the last candle simply grows.
 *
 * So the client polls this instead and pushes the result into the existing
 * series. The payload is a few kilobytes of numbers rather than a full RSC
 * render of headlines, events and indicators that did not change.
 *
 * `liveIntraday` behind it is cached, so the upstream is called at most twice a
 * minute no matter how many people are watching this symbol.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const identity = await resolveShare(symbol);

  if (!identity.scripCode) {
    return NextResponse.json(
      { ok: false, reason: "no-listing" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await liveIntraday(identity.scripCode);
  if (!session.ok) {
    return NextResponse.json(
      { ok: false, reason: session.error },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { points, previousClose, asOf } = session.data;

  // The traded price comes from the small quote endpoint rather than from this
  // series. Both are cached, but that one is a few hundred bytes against ten
  // kilobytes, so it can be refreshed far more often — which matters because
  // the series only advances once a minute while the price does not.
  const quote = await liveQuote(identity.scripCode);
  const livePrice = quote.ok ? quote.data.lastPrice : null;
  const lastPrice = livePrice ?? session.data.lastPrice;

  const built = toIntradayCandles(points, 5);
  // Fold the traded price into the candle still forming, so the chart ticks
  // between minute points instead of standing still for up to a minute.
  const candles = applyLivePrice(built, lastPrice, Date.now(), 5).map((candle) => ({
    time: Math.floor(candle.t / 1000),
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  }));

  // The session high and low must account for the live price too, or a new
  // extreme would be visible on the chart but absent from the figures beside it.
  const dayHigh =
    lastPrice != null && session.data.dayHigh != null
      ? Math.max(session.data.dayHigh, lastPrice)
      : session.data.dayHigh;
  const dayLow =
    lastPrice != null && session.data.dayLow != null
      ? Math.min(session.data.dayLow, lastPrice)
      : session.data.dayLow;

  return NextResponse.json(
    {
      ok: true,
      lastPrice,
      previousClose,
      change: lastPrice != null && previousClose != null ? lastPrice - previousClose : null,
      changePercent:
        lastPrice != null && previousClose ? ((lastPrice - previousClose) / previousClose) * 100 : null,
      dayHigh,
      dayLow,
      asOf,
      candles,
      // When the cached answer was produced, so the client can show real age
      // rather than the age of its own last poll.
      at: session.at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
