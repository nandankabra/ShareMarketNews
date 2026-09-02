import type { TrendState } from "@/lib/db/enums";

import type { Level } from "./levels";
import type { Confluence, TimeframeTrend } from "./trend";
import type { VolatilityRegime, VolatilityTrend } from "./volatility";

/**
 * Turn indicator numbers into statements a person can act on.
 *
 * The app never shows a bare indicator value on its own. "RSI 28.4" means
 * nothing to someone who does not already know what 28 implies; "RSI 28 —
 * oversold" does. Each signal carries its own sentence and a tone, and the
 * strong ones feed the briefing's reason chips.
 */
export type SignalTone = "GOOD" | "BAD" | "WATCH" | "NEUTRAL";

export type Signal = {
  code: string;
  label: string;
  tone: SignalTone;
  /** Signals at or above this are worth surfacing outside the share page. */
  strong: boolean;
};

export type SignalInput = {
  close: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macdHist: number | null;
  atrPercent: number | null;
  volume: number | null;
  avgVolume20d: number | null;
  week52High: number | null;
  week52Low: number | null;
  bandwidth: number | null;
  bandwidthMin6m: number | null;
  /** Bars since the 50-day crossed the 200-day, signed: + golden, - death. */
  crossAgeDays: number | null;
  crossDirection: "GOLDEN" | "DEATH" | null;
  nearestSupport: Level | null;
  nearestResistance: Level | null;
  /** Daily, weekly and monthly trend together; null when there isn't enough weekly history yet. */
  confluence: Confluence | null;
  volatilityRegime: VolatilityRegime | null;
  volatilityTrend: VolatilityTrend | null;
  atrPercentRank: number | null;
  /**
   * Today's volume-weighted average price and how far the *live* price sits
   * from it. The distance is passed in rather than derived from `close`,
   * because `close` is the last daily bar — yesterday's number measured
   * against today's VWAP would be a comparison of two different days.
   */
  vwap: { price: number; distancePercent: number } | null;
};

export function trendStateFrom(close: number | null, sma200: number | null): TrendState {
  if (close == null || sma200 == null) return "UNKNOWN";
  return close >= sma200 ? "ABOVE_200" : "BELOW_200";
}

export function buildSignals(input: SignalInput): Signal[] {
  const out: Signal[] = [];
  const push = (code: string, label: string, tone: SignalTone, strong = false) =>
    out.push({ code, label, tone, strong });

  if (input.rsi14 != null) {
    if (input.rsi14 >= 70) push("RSI_OVERBOUGHT", `RSI ${input.rsi14.toFixed(0)} — overbought`, "WATCH", true);
    else if (input.rsi14 <= 30) push("RSI_OVERSOLD", `RSI ${input.rsi14.toFixed(0)} — oversold`, "WATCH", true);
    else push("RSI_NEUTRAL", `RSI ${input.rsi14.toFixed(0)} — neutral`, "NEUTRAL");
  }

  const trend = trendStateFrom(input.close, input.sma200);
  if (trend === "ABOVE_200") push("TREND_UP", "Above the 200-day — trend up", "GOOD");
  else if (trend === "BELOW_200") push("TREND_DOWN", "Below the 200-day — trend down", "BAD");

  if (input.crossDirection && input.crossAgeDays != null && input.crossAgeDays <= 30) {
    const days = input.crossAgeDays;
    const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    if (input.crossDirection === "GOLDEN") {
      push("GOLDEN_CROSS", `50-day crossed above the 200-day ${when}`, "GOOD", true);
    } else {
      push("DEATH_CROSS", `50-day crossed below the 200-day ${when}`, "BAD", true);
    }
  }

  if (input.macdHist != null) {
    if (input.macdHist > 0) push("MACD_POSITIVE", "MACD above its signal line", "GOOD");
    else push("MACD_NEGATIVE", "MACD below its signal line", "BAD");
  }

  if (input.volume != null && input.avgVolume20d) {
    const multiple = input.volume / input.avgVolume20d;
    if (multiple >= 2) {
      push("VOLUME_SPIKE", `Volume ${multiple.toFixed(1)}× its 20-day average`, "WATCH", true);
    }
  }

  if (input.close != null && input.week52High && input.week52Low) {
    const span = input.week52High - input.week52Low;
    if (span > 0) {
      const position = ((input.close - input.week52Low) / span) * 100;
      if (position >= 97) push("NEAR_52W_HIGH", "Within 3% of its 52-week high", "WATCH", true);
      else if (position <= 3) push("NEAR_52W_LOW", "Within 3% of its 52-week low", "WATCH", true);
    }
  }

  if (input.bandwidth != null && input.bandwidthMin6m != null && input.bandwidth <= input.bandwidthMin6m * 1.1) {
    push("BB_SQUEEZE", "Bollinger bandwidth at a 6-month low — squeeze", "WATCH", true);
  }

  if (input.nearestResistance) {
    const level = input.nearestResistance;
    push(
      "NEAR_RESISTANCE",
      `Resistance ₹${round(level.price)} — ${Math.abs(level.distancePercent).toFixed(1)}% above` +
        (level.distanceAtr != null ? `, ${level.distanceAtr.toFixed(1)} ATR` : ""),
      Math.abs(level.distancePercent) <= 1 ? "WATCH" : "NEUTRAL",
      Math.abs(level.distancePercent) <= 1,
    );
  }

  if (input.nearestSupport) {
    const level = input.nearestSupport;
    push(
      "NEAR_SUPPORT",
      `Support ₹${round(level.price)} — ${Math.abs(level.distancePercent).toFixed(1)}% below` +
        (level.distanceAtr != null ? `, ${level.distanceAtr.toFixed(1)} ATR` : ""),
      Math.abs(level.distancePercent) <= 1 ? "WATCH" : "NEUTRAL",
      Math.abs(level.distancePercent) <= 1,
    );
  }

  if (input.confluence) {
    const { alignment, direction, timeframes, score } = input.confluence;
    const suffix = ` — confluence ${signed(score)}`;
    const agreeing = timeframes.filter((timeframe) => timeframe.direction === direction);
    const flat = timeframes.filter((timeframe) => timeframe.direction === "FLAT");
    const word = direction === "UP" ? "up" : "down";

    if (alignment === "FULL") {
      push(
        direction === "UP" ? "CONFLUENCE_ALIGNED_UP" : "CONFLUENCE_ALIGNED_DOWN",
        `${sentence(listOf(timeframes))} all trending ${word}${suffix}`,
        direction === "UP" ? "GOOD" : "BAD",
        true,
      );
    } else if (alignment === "MAJORITY") {
      push(
        "CONFLUENCE_MAJORITY",
        `${sentence(listOf(agreeing))} ${word}, ${listOf(flat)} flat${suffix}`,
        direction === "UP" ? "GOOD" : "BAD",
        true,
      );
    } else if (alignment === "MIXED") {
      push(
        "CONFLUENCE_MIXED",
        `${sentence(timeframes.map((timeframe) => `${timeframe.label} ${timeframe.direction.toLowerCase()}`).join(", "))}${suffix}`,
        "NEUTRAL",
      );
    } else {
      push("CONFLUENCE_NONE", `No trend on the ${listOf(timeframes)}`, "NEUTRAL");
    }

    // Price on one side of an average that is heading the other way: the move
    // is happening without the trend behind it yet, either way round.
    const daily = timeframes.find((timeframe) => timeframe.label === "daily");
    if (daily && daily.direction !== "FLAT" && daily.slope != null && daily.slope !== "FLAT" && daily.slope !== daily.direction) {
      push(
        "TREND_MA_DIVERGES",
        daily.direction === "UP"
          ? "Above the 50-day, but the average itself is still falling"
          : "Below the 50-day, but the average itself is turning up",
        "WATCH",
        true,
      );
    }
  }

  // The regime bucket says where volatility sits; the trend says where it is
  // going. Said together they are one sentence, not two chips.
  if (input.volatilityRegime && input.atrPercentRank != null) {
    const drift =
      input.volatilityTrend === "EXPANDING"
        ? " and still widening"
        : input.volatilityTrend === "CONTRACTING"
          ? " and narrowing"
          : "";

    if (input.volatilityRegime === "HIGH") {
      const top = Math.max(1, Math.round(100 - input.atrPercentRank));
      push("VOLATILITY_HIGH", `ATR in the top ${top}% of its own year — a wide-swing regime${drift}`, "WATCH", true);
    } else if (input.volatilityRegime === "LOW") {
      const bottom = Math.max(1, Math.round(input.atrPercentRank));
      push("VOLATILITY_LOW", `ATR in the bottom ${bottom}% of its own year — a tight-range regime${drift}`, "WATCH", true);
    } else if (drift) {
      push("VOLATILITY_SHIFTING", `ATR mid-range for its own year${drift}`, "WATCH", true);
    }
  }

  // Where the price sits against the price the day's volume actually happened
  // at. Only meaningful while a session is running, which is the only time
  // `sessionVwap` is set.
  if (input.vwap) {
    const { price, distancePercent } = input.vwap;
    push(
      distancePercent >= 0 ? "VWAP_ABOVE" : "VWAP_BELOW",
      `${Math.abs(distancePercent).toFixed(1)}% ${distancePercent >= 0 ? "above" : "below"} today's VWAP of ₹${round(price)}`,
      "NEUTRAL",
      Math.abs(distancePercent) >= 1,
    );
  }

  return out;
}

/** "daily, weekly and monthly" — the Oxford-less join a sentence wants. */
function listOf(timeframes: TimeframeTrend[]): string {
  const labels = timeframes.map((timeframe) => timeframe.label);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function round(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: value >= 100 ? 0 : 2 });
}
