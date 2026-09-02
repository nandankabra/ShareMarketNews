"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";

import { useChartSettings } from "@/lib/chart/settings";
import type { IntradayCandle, ShareCandle } from "@/lib/services/shares/queries";
import type { Level, LevelSet } from "@/lib/ta/levels";
import { rsi } from "@/lib/ta/rsi";
import { cn } from "@/lib/utils";

const RSI_PANE_HEIGHT = 90;

/**
 * The `count` levels closest to the price, per side.
 *
 * Nearest rather than strongest: a level twenty percent away may well be the
 * best-tested one in the series, and it is still not what anyone is watching
 * this afternoon. The set handed in is already filtered down to levels that
 * mean something, so choosing among them by distance is safe.
 */
function nearestLevels(levels: Level[] | undefined, spot: number | null, count: number): Level[] {
  if (!levels || count <= 0) return [];
  if (spot == null) return levels.slice(0, count);
  return [...levels].sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot)).slice(0, count);
}

const RANGES = [
  /** Today's session. Only offered when there is a session to show. */
  { key: "1D", days: 0 },
  { key: "1M", days: 22 },
  { key: "3M", days: 66 },
  { key: "6M", days: 132 },
  { key: "1Y", days: 252 },
  { key: "MAX", days: Number.POSITIVE_INFINITY },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** SMA over the visible slice, aligned so index n is the value at bar n. */
function smaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Running VWAP over the visible bars, aligned so index n is the value at bar n.
 *
 * Cumulative, so a bar that changes only moves its own point and the ones
 * after it — which is what lets the live path update the tail rather than
 * redraw the line.
 */
function vwapSeries(bars: Bar[]): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null);
  let volumeSum = 0;
  let valueSum = 0;
  for (let i = 0; i < bars.length; i++) {
    const volume = bars[i].volume;
    if (volume != null && volume > 0) {
      volumeSum += volume;
      valueSum += ((bars[i].high + bars[i].low + bars[i].close) / 3) * volume;
    }
    if (volumeSum > 0) out[i] = valueSum / volumeSum;
  }
  return out;
}

function toTime(day: string): UTCTimestamp {
  return (Date.parse(`${day}T00:00:00Z`) / 1000) as UTCTimestamp;
}

/** India is UTC+5:30 year round — no DST, so a constant is exactly right. */
const IST_OFFSET_SECONDS = 5.5 * 3600;

/** Daily and intraday bars differ only in how their time is expressed. */
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number | null };

export function CandleChart({
  candles,
  intraday = [],
  levels,
  className,
  /**
   * "intraday" is the grid pane: one interval, no range switcher, shorter.
   * The drawing is identical either way, which is the point of the mode
   * living here rather than in a second chart component that would drift.
   */
  mode = "full",
  intervalLabel,
}: {
  candles: ShareCandle[];
  intraday?: IntradayCandle[];
  levels: LevelSet | null;
  className?: string;
  mode?: "full" | "intraday";
  intervalLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const colorsRef = useRef<{ up: string; down: string }>({ up: "", down: "" });
  /** The data the chart currently holds, so the next change can be a delta. */
  const drawnRef = useRef<Bar[]>([]);
  /**
   * The newest data, readable by the creation effect without becoming one of
   * its dependencies. Listing `visible` there would rebuild the chart on every
   * live poll, which is the blink this exists to avoid; reading a ref keeps the
   * effect honest about what it actually depends on.
   */
  const latestRef = useRef<Bar[]>([]);
  const hasSession = intraday.length > 0;
  // Opening on the live session when there is one is the whole point; outside
  // market hours there is nothing to show, so it falls back to three months.
  const [range, setRange] = useState<RangeKey>(hasSession ? "1D" : "3M");
  // Shared across every chart on the site rather than held here: see
  // `lib/chart/settings`. RSI is off by default because an indicator pane costs
  // vertical space, and the price is what someone came to look at.
  const { rsi: showRsi, rsiPeriod, levelCount } = useChartSettings();
  const { resolvedTheme } = useTheme();

  const ranges = useMemo(() => RANGES.filter((entry) => entry.key !== "1D" || hasSession), [hasSession]);
  const isIntraday = mode === "intraday" || (range === "1D" && hasSession);

  const visible = useMemo<Bar[]>(() => {
    if ((mode === "intraday" || range === "1D") && intraday.length > 0) {
      // lightweight-charts renders a UTCTimestamp in UTC and offers no timezone
      // setting, so an Indian session ran 03:45–10:00 on the axis instead of
      // 09:15–15:30. Shifting the timestamps by the IST offset makes the axis
      // and the crosshair read in market time, which is the only clock that
      // means anything here. Daily bars are deliberately not shifted: they are
      // dates at UTC midnight, and moving them would change the date shown.
      return intraday.map((candle) => ({
        time: (candle.time + IST_OFFSET_SECONDS) as UTCTimestamp,
        open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume,
      }));
    }

    // A pane with no session yet has nothing to draw, and daily bars are not a
    // substitute — they would silently answer a different question.
    if (mode === "intraday") return [];

    const days = RANGES.find((entry) => entry.key === range)?.days ?? 66;
    const slice = Number.isFinite(days) && days > 0 ? candles.slice(-days) : candles;
    return slice.map((candle) => ({
      time: toTime(candle.time),
      open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume,
    }));
  }, [candles, intraday, range, mode]);

  /**
   * When the chart must be thrown away and redrawn, as opposed to updated.
   *
   * Deliberately not `visible` itself: that array changes every time a live
   * poll lands, and rebuilding then is exactly the blink this refactor removes.
   * A rebuild is only right when the dataset is a different one — a range
   * switch, or a new session whose first bar has a different timestamp.
   */
  const rebuildKey = `${range}:${visible[0]?.time ?? 0}`;

  // Declared before the creation effect on purpose: effects run in declaration
  // order, so the ref is current by the time that one reads it. Assigning during
  // render would be simpler and is not allowed — a ref written while rendering
  // makes the render impure and the compiler rejects it.
  useEffect(() => {
    latestRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const container = containerRef.current;
    const visible = latestRef.current;
    if (!container || visible.length === 0) return;

    const dark = resolvedTheme === "dark";
    const text = dark ? "#918C83" : "#6E6A62";
    const grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const up = dark ? "#3FBF86" : "#1B7D50";
    const down = dark ? "#E8705C" : "#B33A2A";
    const accent = dark ? "#F0AE4B" : "#B8721A";

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.28 } },
      // Intraday bars need a clock on the axis; daily bars only need a date.
      timeScale: { borderVisible: false, timeVisible: isIntraday, secondsVisible: false },
      crosshair: { mode: 1 },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      autoSize: true,
    });
    chartRef.current = chart;

    colorsRef.current = { up, down };

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
    candleSeries.setData(
      visible.map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    // Volume shares the pane, pinned to the bottom quarter — a separate pane
    // for one histogram costs more vertical space than it earns.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    drawnRef.current = visible;
    volumeSeries.setData(
      visible.map((candle) => ({
        time: candle.time,
        value: candle.volume ?? 0,
        color: candle.close >= candle.open ? `${up}55` : `${down}55`,
      })),
    );

    const closes = visible.map((candle) => candle.close);
    // A 20-session average over five-minute bars would span a day and a half of
    // trading and say nothing about today, so the intraday chart uses periods
    // scaled to its own bars: 9 and 21 five-minute candles, a little under an
    // hour and just under two.
    const overlays: Array<{ period: number; color: string; width: 1 | 2 }> = isIntraday
      ? [
          { period: 9, color: accent, width: 2 },
          { period: 21, color: dark ? "#7FA3C4" : "#5B7A99", width: 1 },
        ]
      : [
          { period: 20, color: accent, width: 2 },
          { period: 50, color: dark ? "#7FA3C4" : "#5B7A99", width: 1 },
        ];

    for (const overlay of overlays) {
      // Only draw an average the visible window can actually support.
      if (visible.length < overlay.period) continue;
      const series = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: overlay.width,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const values = smaSeries(closes, overlay.period);
      series.setData(
        visible
          .map((candle, index) => ({ time: candle.time, value: values[index] }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point.value != null),
      );
    }

    // VWAP belongs to the session, not to a rolling window — drawing it on a
    // daily chart would average a year of volume into one meaningless line.
    if (isIntraday) {
      const vwap = chart.addSeries(LineSeries, {
        color: dark ? "#C08BD6" : "#7A4A99",
        lineWidth: 2,
        lineStyle: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });
      const values = vwapSeries(visible);
      vwap.setData(
        visible
          .map((candle, index) => ({ time: candle.time, value: values[index] }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point.value != null),
      );
      vwapRef.current = vwap;
    }

    // RSI in a pane of its own, below the price.
    //
    // The scale is pinned to 0-100 rather than autoscaled: an RSI that spends a
    // month between 45 and 55 would otherwise fill its pane with noise and put
    // the 30 and 70 lines off-screen, which is exactly backwards — the whole
    // reading is where the line sits relative to those two.
    if (showRsi && visible.length > rsiPeriod) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: dark ? "#D6A15C" : "#8A5A1F",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        1,
      );
      const values = rsi(visible.map((candle) => candle.close), rsiPeriod);
      rsiSeries.setData(
        visible
          .map((candle, index) => ({ time: candle.time, value: values[index] }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point.value != null),
      );
      for (const level of [70, 30]) {
        rsiSeries.createPriceLine({
          price: level,
          color: level === 70 ? down : up,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: String(level),
        });
      }
      chart.panes()[1]?.setHeight(RSI_PANE_HEIGHT);
      rsiRef.current = rsiSeries;
    }

    // Support and resistance as price lines on the candle series, labelled with
    // how many times each was tested — a line without its strength is just a
    // line someone drew.
    const spot = visible.at(-1)?.close ?? null;
    for (const level of nearestLevels(levels?.resistances, spot, levelCount)) {
      candleSeries.createPriceLine({
        price: level.price,
        color: down,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `R ${level.touches}×`,
      });
    }
    for (const level of nearestLevels(levels?.supports, spot, levelCount)) {
      candleSeries.createPriceLine({
        price: level.price,
        color: up,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `S ${level.touches}×`,
      });
    }

    chart.timeScale().fitContent();

    return () => {
      // Every range change tears down and rebuilds. Without this the canvases
      // accumulate and the page slowly leaks.
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      vwapRef.current = null;
      rsiRef.current = null;
      drawnRef.current = [];
    };
  }, [rebuildKey, levels, resolvedTheme, isIntraday, showRsi, rsiPeriod, levelCount]);

  /**
   * Apply a live update without rebuilding.
   *
   * `setData` replaces the whole series, which resets zoom and pan and makes
   * the chart blink — fine once, wrong every fifteen seconds. `update()` is the
   * incremental path lightweight-charts provides: hand it the newest bar and it
   * either replaces the last one or appends, leaving the viewport alone. That is
   * the difference between a chart that refreshes and one that ticks.
   *
   * Only the bars that actually changed are sent. In a live session that is the
   * final candle growing, plus a new one every five minutes.
   */
  useEffect(() => {
    const series = candleRef.current;
    const volume = volumeRef.current;
    const previous = drawnRef.current;
    if (!series || !volume || visible.length === 0 || previous.length === 0) return;

    // A different dataset entirely — the rebuild effect owns that case.
    if (previous[0]?.time !== visible[0]?.time || visible.length < previous.length) return;

    const { up, down } = colorsRef.current;
    // Everything from the last previously-known bar onward: that bar may have
    // moved since, and anything after it is new.
    const from = Math.max(0, previous.length - 1);

    // VWAP is cumulative, so only the tail can have moved — the same slice the
    // candles need, recomputed over the whole series to keep the running sums
    // honest.
    const vwap = vwapRef.current;
    if (vwap) {
      const values = vwapSeries(visible);
      for (let i = from; i < visible.length; i++) {
        const value = values[i];
        if (value != null) vwap.update({ time: visible[i].time, value });
      }
    }

    // RSI is recursive too — Wilder's average carries forward — so the same
    // recompute-and-update-the-tail treatment keeps it honest without a redraw.
    const rsiLine = rsiRef.current;
    if (rsiLine) {
      const values = rsi(visible.map((candle) => candle.close), rsiPeriod);
      for (let i = from; i < visible.length; i++) {
        const value = values[i];
        if (value != null) rsiLine.update({ time: visible[i].time, value });
      }
    }

    for (const candle of visible.slice(from)) {
      series.update({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
      volume.update({
        time: candle.time,
        value: candle.volume ?? 0,
        color: candle.close >= candle.open ? `${up}55` : `${down}55`,
      });
    }

    drawnRef.current = visible;
  }, [visible, rsiPeriod]);

  if (mode === "intraday" ? visible.length === 0 : candles.length === 0) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-center rounded-md border border-dashed text-xs",
          mode === "intraday" ? "h-[180px]" : "h-[240px] text-sm sm:h-[320px]",
          className,
        )}
      >
        {mode === "intraday"
          ? "Nothing has traded yet in this session."
          : "No bars to draw — NSE returned no daily history for this symbol."}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-wide">
          {intervalLabel ? (
            <span className="text-foreground font-semibold">{intervalLabel}</span>
          ) : null}
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-primary block h-0.5 w-3 rounded-full" aria-hidden /> SMA {isIntraday ? 9 : 20}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="block h-0.5 w-3 rounded-full bg-[#5B7A99] dark:bg-[#7FA3C4]" aria-hidden /> SMA {isIntraday ? 21 : 50}
          </span>
          {isIntraday ? (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <i className="block h-0.5 w-3 rounded-full bg-[#7A4A99] dark:bg-[#C08BD6]" aria-hidden /> VWAP
            </span>
          ) : null}
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-down block h-0.5 w-3 rounded-full" aria-hidden /> Resistance
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-up block h-0.5 w-3 rounded-full" aria-hidden /> Support
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showRsi ? (
            <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px]">
              <i className="block h-0.5 w-3 rounded-full bg-[#8A5A1F] dark:bg-[#D6A15C]" aria-hidden />
              RSI {rsiPeriod}
            </span>
          ) : null}

          {mode === "full" ? (
            <div className="flex gap-0.5">
              {ranges.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setRange(entry.key)}
                aria-pressed={range === entry.key}
                className={cn(
                  "rounded px-2 py-1 font-mono text-[10px] transition-colors",
                  range === entry.key
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.key}
              </button>
            ))}
            </div>
          ) : (
            <span className="text-muted-foreground font-mono text-[10px]">{visible.length} bars</span>
          )}
        </div>
      </div>

      {/* Shorter on a phone: 340px of chart leaves no room for the range
          buttons and the readout below it on a small screen. lightweight-charts
          is created with autoSize, so it reflows on rotation by itself. The
          RSI pane is extra height rather than a share of the price's. */}
      <div
        ref={containerRef}
        className={cn(
          "w-full",
          mode === "intraday" ? (showRsi ? "h-[270px]" : "h-[180px]") : showRsi ? "h-[330px] sm:h-[430px]" : "h-[240px] sm:h-[340px]",
        )}
      />

      {mode === "full" ? (
        <p className="text-muted-foreground mt-2 border-t pt-2 font-mono text-[9px] tracking-wide">
          Charts by{" "}
          <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            TradingView Lightweight Charts™
          </a>{" "}
          — Apache-2.0
        </p>
      ) : null}
    </div>
  );
}
