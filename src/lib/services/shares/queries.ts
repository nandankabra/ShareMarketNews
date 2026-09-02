import "server-only";

import { istToday } from "@/lib/date/ist";
import { analyse } from "@/lib/live/analysis";
import { resolveShare } from "@/lib/live/directory";
import { applyLivePrice, toIntradayCandles, type IntradayInterval, type LivePoint } from "@/lib/live/intraday";
import { analyseRegime, type Volatility } from "@/lib/live/regime";
import { liveEvents, liveHistory, liveIntraday, liveNews } from "@/lib/live/sources";
import { CATEGORY_LABEL, classifyHeadline } from "@/lib/news/classify";
import { isRelevantHeadline } from "@/lib/news/relevance";
import { summariseReaction, type Reaction } from "@/lib/news/reaction";
import { buildSignals, trendStateFrom, type Signal } from "@/lib/ta/signals";
import type { Level, LevelSet } from "@/lib/ta/levels";
import type { Confluence } from "@/lib/ta/trend";
import { sessionVwap } from "@/lib/ta/vwap";
import type { Candle } from "@/lib/ta/types";
import { isWatched } from "@/lib/watchlist/store";

export type ShareCandle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

/** Intraday bars are timestamped, not dated — lightweight-charts needs seconds. */
export type IntradayCandle = { time: number; open: number; high: number; low: number; close: number; volume: number | null };

export type ShareDetail = {
  id: string;
  symbol: string;
  name: string;
  isin: string | null;
  sectors: { key: string; displayName: string }[];
  yahooSector: string | null;
  lastPrice: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  quotedAt: Date | null;
  quoteSource: string | null;
  rsi14: number | null;
  atr14: number | null;
  atrPercent: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  avgVolume20d: number | null;
  avgAbsChangePercent20d: number | null;
  taAt: Date | null;
  inWatchlist: boolean;
  candles: ShareCandle[];
  /** Today's session, five minutes a bar. Empty outside market hours. */
  intraday: IntradayCandle[];
  /**
   * The same session as raw minutes, which is what lets several charts show
   * several intervals from one fetch: folding is cheap and pure, so each pane
   * does its own rather than the server sending one series per interval.
   */
  intradayPoints: LivePoint[];
  /** True when the price above is today's, not the last close. */
  isLive: boolean;
  /** BSE's own "as of" for the live price, e.g. "11:48". */
  liveAsOf: string | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  /** Today's volume-weighted average price. Null outside a session. */
  sessionVwap: number | null;
  levels: LevelSet | null;
  signals: Signal[];
  /** Daily, weekly and monthly trend side by side. Null until there is enough weekly history. */
  confluence: Confluence | null;
  volatility: Volatility;
  reaction: Reaction;
  news: {
    id: string;
    title: string;
    url: string;
    source: string | null;
    publishedAt: Date;
    firstSeenAt: Date;
    category: string | null;
    categoryLabel: string;
    polarity: string | null;
    matchedTerms: string | null;
  }[];
  events: { eventDate: string; type: string; description: string; upcoming: boolean }[];
};

function nearest(levels: Level[] | undefined, spot: number | null, side: "SUPPORT" | "RESISTANCE"): Level | null {
  if (!levels || spot == null) return null;
  const candidates = levels.filter((level) => (side === "SUPPORT" ? level.price < spot : level.price >= spot));
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level.price - spot) < Math.abs(closest.price - spot) ? level : closest,
  );
}

/** "YYYY-MM-DD" for lightweight-charts, which wants a day string on daily bars. */
function toChartCandle(candle: Candle): ShareCandle {
  return {
    time: new Date(candle.t).toISOString().slice(0, 10),
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  };
}

export async function getShareDetail(symbol: string): Promise<ShareDetail | null> {
  const upper = symbol.toUpperCase();

  const history = await liveHistory(upper);
  if (!history.ok) return null;

  const candles: Candle[] = history.data.map((bar) => ({
    t: new Date(`${bar.day}T00:00:00.000Z`).getTime(),
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: bar.volume,
  }));

  const ta = analyse(candles);
  const regime = analyseRegime(candles);
  const lastBar = history.data.at(-1);
  const identity = await resolveShare(upper);
  const name = identity.name;

  // The live session, when BSE lists this company. Daily bars carry yesterday's
  // close until the session ends, which is right for analysis and useless for
  // watching — this is the half that moves.
  const intradaySeries = identity.scripCode ? await liveIntraday(identity.scripCode) : null;
  const session = intradaySeries?.ok ? intradaySeries.data : null;
  // The same fold the live endpoint applies, so the first paint already shows
  // the forming candle at the traded price rather than a bar that jumps the
  // moment the first poll lands.
  const intraday = session
    ? applyLivePrice(
        toIntradayCandles(session.points, 5 satisfies IntradayInterval),
        session.lastPrice,
        Date.now(),
        5,
      )
    : [];

  // VWAP off the minute bars rather than the five-minute ones: the weights are
  // the same volume either way, but a finer fold puts each print closer to the
  // price it actually traded at.
  const vwap = session ? sessionVwap(toIntradayCandles(session.points, 1)) : null;

  // News and events are secondary: a share page with a chart and no headlines
  // is useful, one that fails because Google was slow is not.
  const [news, events] = [await liveNews(name), await liveEvents()];

  const headlines = (news.ok ? news.data : [])
    .filter((item) => isRelevantHeadline(item.title, name, upper))
    .slice(0, 30)
    .map((item) => {
      const classification = classifyHeadline(item.title);
      return {
        id: item.dedupKey,
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: new Date(item.publishedAt),
        // Without a database there is no record of when *we* first saw a story,
        // so "new" can only mean "published recently". A story published three
        // hours ago and discovered just now reads as three hours old.
        firstSeenAt: new Date(item.publishedAt),
        category: classification.category,
        categoryLabel: CATEGORY_LABEL[classification.category],
        polarity: classification.polarity,
        matchedTerms: classification.matchedTerms.join(", ") || null,
      };
    });

  const today = istToday();
  const shareEvents = (events.ok ? events.data : [])
    .filter((event) => event.symbol.toUpperCase() === upper)
    .map((event) => ({
      eventDate: event.eventDate,
      type: event.type,
      description: event.description,
      upcoming: event.eventDate >= today,
    }))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const levels = ta.levels;

  // Prefer the session's own previous close: on the first tick of a new day the
  // daily series has not caught up, and measuring today's move against the day
  // before yesterday would be quietly wrong.
  const livePrice = session?.lastPrice ?? null;
  const lastTick = session?.points.at(-1)?.at ?? null;
  const liveAt = lastTick != null ? new Date(lastTick) : null;
  const previousClose = session?.previousClose ?? ta.previousClose ?? lastBar?.previousClose ?? null;
  const liveChange =
    livePrice != null && previousClose != null ? livePrice - previousClose : ta.dayChange;

  const signals = buildSignals({
    close: ta.close,
    rsi14: ta.rsi14,
    sma20: ta.sma20,
    sma50: ta.sma50,
    sma200: ta.sma200,
    macdHist: ta.macdHist,
    atrPercent: ta.atrPercent,
    volume: lastBar?.volume ?? null,
    avgVolume20d: ta.avgVolume20d,
    week52High: ta.week52High,
    week52Low: ta.week52Low,
    bandwidth: ta.bandwidth,
    bandwidthMin6m: ta.bandwidthMin6m,
    crossAgeDays: ta.crossAgeDays,
    crossDirection: ta.crossDirection,
    nearestSupport: nearest(levels?.supports, ta.close, "SUPPORT"),
    nearestResistance: nearest(levels?.resistances, ta.close, "RESISTANCE"),
    confluence: regime.confluence,
    volatilityRegime: regime.volatility.regime,
    volatilityTrend: regime.volatility.trend,
    atrPercentRank: regime.volatility.atrPercentRank,
    vwap:
      vwap != null && vwap > 0 && livePrice != null
        ? { price: vwap, distancePercent: ((livePrice - vwap) / vwap) * 100 }
        : null,
  });

  return {
    id: upper,
    symbol: upper,
    name,
    isin: identity.isin,
    // Which sectors contain this share is spread across sixteen constituent
    // files. Answering it here would mean fetching all of them to render one
    // page, so the link runs the other way: sector pages list their shares.
    sectors: [],
    yahooSector: null,
    lastPrice: livePrice ?? ta.close,
    previousClose,
    dayChange: liveChange,
    dayChangePercent: previousClose ? ((liveChange ?? 0) / previousClose) * 100 : ta.dayChangePercent,
    dayHigh: session?.dayHigh ?? lastBar?.high ?? null,
    dayLow: session?.dayLow ?? lastBar?.low ?? null,
    week52High: ta.week52High,
    week52Low: ta.week52Low,
    volume: lastBar?.volume ?? null,
    // The live price and its timestamp must come from the same place. Taking
    // the price from the session and the time from the newest daily bar is how
    // a page ends up showing a current price stamped "21d ago" — which is what
    // it did for a share whose NSE daily history is thin.
    quotedAt: liveAt ?? (lastBar ? new Date(`${lastBar.day}T00:00:00.000Z`) : null),
    quoteSource: livePrice != null ? "BSE" : "NSE",
    rsi14: ta.rsi14,
    atr14: ta.atr14,
    atrPercent: ta.atrPercent,
    sma20: ta.sma20,
    sma50: ta.sma50,
    sma200: ta.sma200,
    avgVolume20d: ta.avgVolume20d,
    avgAbsChangePercent20d: ta.avgAbsChangePercent20d,
    taAt: new Date(history.at),
    inWatchlist: await isWatched(upper),
    candles: candles.map(toChartCandle),
    intraday: intraday.map((candle) => ({
      time: Math.floor(candle.t / 1000),
      open: candle.o, high: candle.h, low: candle.l, close: candle.c, volume: candle.v,
    })),
    intradayPoints: (session?.points ?? []) as LivePoint[],
    isLive: livePrice != null,
    liveAsOf: session?.asOf ?? null,
    sessionHigh: session?.dayHigh ?? null,
    sessionLow: session?.dayLow ?? null,
    sessionVwap: vwap,
    levels,
    signals,
    confluence: regime.confluence,
    volatility: regime.volatility,
    // The share's moves on its own heaviest-news days needed a year of stored
    // mentions to identify those days. Nothing here can reconstruct that, and
    // inventing a range from the last week would be worse than saying so.
    reaction: summariseReaction({
      newsDayMoves: [],
      avgAbsChangePercent20d: ta.avgAbsChangePercent20d,
      atrPercent: ta.atrPercent,
    }),
    news: headlines,
    events: shareEvents,
  };
}

export async function shareExists(symbol: string): Promise<boolean> {
  const history = await liveHistory(symbol.toUpperCase());
  return history.ok;
}

export { trendStateFrom };
