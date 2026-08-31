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

import type { IntradayCandle, ShareCandle } from "@/lib/services/shares/queries";
import type { LevelSet } from "@/lib/ta/levels";
import { cn } from "@/lib/utils";

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
}: {
  candles: ShareCandle[];
  intraday?: IntradayCandle[];
  levels: LevelSet | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const hasSession = intraday.length > 0;
  // Opening on the live session when there is one is the whole point; outside
  // market hours there is nothing to show, so it falls back to three months.
  const [range, setRange] = useState<RangeKey>(hasSession ? "1D" : "3M");
  const { resolvedTheme } = useTheme();

  const ranges = useMemo(() => RANGES.filter((entry) => entry.key !== "1D" || hasSession), [hasSession]);
  const isIntraday = range === "1D" && hasSession;

  const visible = useMemo<Bar[]>(() => {
    if (range === "1D" && intraday.length > 0) {
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

    const days = RANGES.find((entry) => entry.key === range)?.days ?? 66;
    const slice = Number.isFinite(days) && days > 0 ? candles.slice(-days) : candles;
    return slice.map((candle) => ({
      time: toTime(candle.time),
      open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume,
    }));
  }, [candles, intraday, range]);

  useEffect(() => {
    const container = containerRef.current;
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

    // Support and resistance as price lines on the candle series, labelled with
    // how many times each was tested — a line without its strength is just a
    // line someone drew.
    for (const level of levels?.resistances ?? []) {
      candleSeries.createPriceLine({
        price: level.price,
        color: down,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `R ${level.touches}×`,
      });
    }
    for (const level of levels?.supports ?? []) {
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
    };
  }, [visible, levels, resolvedTheme, isIntraday]);

  if (candles.length === 0) {
    return (
      <div className={cn("text-muted-foreground flex h-[240px] items-center justify-center rounded-md border border-dashed text-sm sm:h-[320px]", className)}>
        No bars to draw — NSE returned no daily history for this symbol.
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-wide">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-primary block h-0.5 w-3 rounded-full" aria-hidden /> SMA {isIntraday ? 9 : 20}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="block h-0.5 w-3 rounded-full bg-[#5B7A99] dark:bg-[#7FA3C4]" aria-hidden /> SMA {isIntraday ? 21 : 50}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-down block h-0.5 w-3 rounded-full" aria-hidden /> Resistance
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5">
            <i className="bg-up block h-0.5 w-3 rounded-full" aria-hidden /> Support
          </span>
        </div>
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
      </div>

      {/* Shorter on a phone: 340px of chart leaves no room for the range
          buttons and the readout below it on a small screen. lightweight-charts
          is created with autoSize, so it reflows on rotation by itself. */}
      <div ref={containerRef} className="h-[240px] w-full sm:h-[340px]" />

      <p className="text-muted-foreground mt-2 border-t pt-2 font-mono text-[9px] tracking-wide">
        Charts by{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          TradingView Lightweight Charts™
        </a>{" "}
        — Apache-2.0
      </p>
    </div>
  );
}
