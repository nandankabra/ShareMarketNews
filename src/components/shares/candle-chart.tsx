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
import { connorsRsi } from "@/lib/ta/connors-rsi";
import { toHeikinAshi } from "@/lib/ta/heikin-ashi";
import type { IntradayCandle, ShareCandle } from "@/lib/services/shares/queries";
import type { Level, LevelSet } from "@/lib/ta/levels";
import type { PivotLevels } from "@/lib/ta/pivot-points";
import { rsi } from "@/lib/ta/rsi";
import { cn } from "@/lib/utils";

const INDICATOR_PANE_HEIGHT = 90;
/** Widest a five-minute candle gets before a thin session looks like a bar chart. */
const MAX_INTRADAY_BAR_SPACING = 12;
/** The moving average drawn over the volume histogram, as brokers label it. */
const VOLUME_AVG_PERIOD = 9;
/** Connors RSI's three periods: price RSI, streak RSI, and the return-rank window. */
const CRSI_PARAMS = [3, 2, 100] as const;

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

/**
 * The pure Heikin Ashi transform, over the chart's own bar shape.
 *
 * Kept as an adapter rather than a second implementation: the arithmetic lives
 * in `lib/ta/heikin-ashi` where it is tested, and this only moves the fields.
 */
function toHeikinAshiBars(bars: Bar[]): Bar[] {
  const converted = toHeikinAshi(
    bars.map((bar) => ({ t: bar.time, o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume })),
  );
  return converted.map((candle, index) => ({
    time: bars[index].time,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  }));
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
  pivots = null,
  previousClose = null,
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
  /** Previous-period pivots for this scale. Drawn only when the setting asks. */
  pivots?: PivotLevels | null;
  /** Yesterday's close, drawn as the intraday reference line. */
  previousClose?: number | null;
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
  const rsiSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const crsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeAvgRef = useRef<ISeriesApi<"Line"> | null>(null);
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
  const { candleType, rsi: showRsi, rsiPeriod, rsiSignal, crsi: showCrsi, pivots: showPivots, volumeAvg, levelCount } =
    useChartSettings();
  const { resolvedTheme } = useTheme();

  const ranges = useMemo(() => RANGES.filter((entry) => entry.key !== "1D" || hasSession), [hasSession]);
  // Every oscillator adds a pane rather than taking room from the price, so
  // switching one on makes the chart taller instead of squashing the candles.
  const panesBelow = (showRsi ? 1 : 0) + (showCrsi ? 1 : 0);
  const chartHeight = (mode === "intraday" ? 180 : 320) + panesBelow * (INDICATOR_PANE_HEIGHT + 10);
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
    // VWAP was violet, which sat ΔE 11.5 from the down-red under normal vision
    // — two lines a full-colour reader has to work to tell apart. Blue clears
    // both candle colours in either theme.
    const vwapColor = dark ? "#7AB3F5" : "#2A78D6";
    // The previous close, and the crosshair, are references rather than data:
    // muted ink, so they sit behind the candles instead of competing with them.
    const reference = dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.28)";
    const crosshair = dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.26)";
    const label = dark ? "#3A4048" : "#4A4640";

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      // Horizontal rules only. Vertical ones lay a second grid over the
      // candles for the eye to read past, and the time axis already marks the
      // same positions along the bottom.
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      // The intraday chart gives the price more of the pane: its volume band
      // is slimmer than the daily chart's, so the candles get the difference.
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: isIntraday ? 0.18 : 0.28 },
      },
      // Intraday bars need a clock on the axis; daily bars only need a date.
      timeScale: { borderVisible: false, timeVisible: isIntraday, secondsVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: crosshair, width: 1, style: 2, labelBackgroundColor: label },
        horzLine: { color: crosshair, width: 1, style: 2, labelBackgroundColor: label },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      autoSize: true,
    });
    chartRef.current = chart;

    colorsRef.current = { up, down };

    // Up candles hollow, down candles filled.
    //
    // Green against red is ΔE 5 under deuteranopia — for a red-green colour
    // blind reader the two are the same mark. The fill carries the direction
    // as well as the hue does, so the chart still reads with the colour
    // removed, and the convention everyone else expects is left intact.
    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "transparent",
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      // The traded price, carried across to the axis. On a live session this is
      // the line the eye actually follows.
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: 2,
      priceLineColor: accent,
    });
    // Heikin Ashi is a display transform: the bodies change, the underlying
    // prices do not. Indicators below stay on the real closes on purpose — an
    // RSI of averaged-of-averaged closes is a different measurement wearing the
    // same name, and the legend says which is which.
    const drawn = candleType === "heikin" ? toHeikinAshiBars(visible) : visible;
    candleSeries.setData(
      drawn.map((candle) => ({
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
    chart
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: isIntraday ? 0.86 : 0.78, bottom: 0 } });
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    drawnRef.current = visible;
    volumeSeries.setData(
      visible.map((candle) => ({
        time: candle.time,
        value: candle.volume ?? 0,
        color: candle.close >= candle.open ? `${up}40` : `${down}40`,
      })),
    );

    if (volumeAvg && visible.length >= VOLUME_AVG_PERIOD) {
      const line = chart.addSeries(LineSeries, {
        color: dark ? "#E0B252" : "#9A7420",
        lineWidth: 1,
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const values = smaSeries(visible.map((candle) => candle.volume ?? 0), VOLUME_AVG_PERIOD);
      line.setData(
        visible
          .map((candle, index) => ({ time: candle.time, value: values[index] }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point.value != null),
      );
      volumeAvgRef.current = line;
    }

    const closes = visible.map((candle) => candle.close);
    // A 20-session average over five-minute bars would span a day and a half of
    // trading and say nothing about today, so the intraday chart uses periods
    // scaled to its own bars: 9 and 21 five-minute candles, a little under an
    // hour and just under two.
    // The intraday chart draws no moving averages at all.
    //
    // A 9- and a 21-period average over five-minute bars are two more lines
    // tracking the same forty candles the price already draws, on a canvas a
    // fraction of the daily chart's height — and VWAP, which is the reference
    // an intraday trader actually reads against, was competing with both. On
    // the daily chart the 20 and 50 span real weeks and stay.
    const overlays: Array<{ period: number; color: string; width: 1 | 2 }> = isIntraday
      ? []
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
        color: vwapColor,
        lineWidth: 2,
        // Solid now that it is the only overlay on the pane. It was dotted to
        // stay out of the way of two moving averages that are no longer there.
        lineStyle: 0,
        priceLineVisible: false,
        // Off: its label landed on top of the traded price's, and the figure is
        // already in the VWAP tile above the chart.
        lastValueVisible: false,
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

    // Yesterday's close, which is the line every intraday move is quoted
    // against — "up 0.6%" means up 0.6% from here. The chart showed the
    // percentage in the header and not the line it referred to.
    if (isIntraday && previousClose != null) {
      candleSeries.createPriceLine({
        price: previousClose,
        color: reference,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PC",
      });
    }

    // Indicators go in panes of their own, below the price, in the order they
    // were switched on. Their scales are pinned to 0-100 rather than
    // autoscaled: an oscillator that spends a month between 45 and 55 would
    // otherwise fill its pane with noise and push its own bands off-screen,
    // which is exactly backwards — the whole reading is where the line sits
    // against those bands.
    let pane = 0;
    const oscillator = (color: string, paneIndex: number) =>
      chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        paneIndex,
      );
    const pointsOf = (values: Array<number | null>) =>
      visible
        .map((candle, index) => ({ time: candle.time, value: values[index] }))
        .filter((point): point is { time: UTCTimestamp; value: number } => point.value != null);

    if (showRsi && visible.length > rsiPeriod) {
      pane += 1;
      const rsiValues = rsi(closes, rsiPeriod);
      const rsiSeries = oscillator(dark ? "#D6A15C" : "#8A5A1F", pane);
      rsiSeries.setData(pointsOf(rsiValues));

      // The signal line is a moving average of RSI itself — what a broker's
      // chart means by "RSI 14 SMA 14". Crossings of it are the reason anyone
      // draws it; the app draws it and says nothing about them.
      if (rsiSignal) {
        const signal = chart.addSeries(
          LineSeries,
          {
            color: dark ? "#9B8FD6" : "#5F4FA3",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          pane,
        );
        // Averaging a series with a null head: the SMA can only start once RSI
        // has, so the run of nulls is trimmed and put back afterwards.
        const filled = rsiValues.map((value) => value ?? 0);
        const averaged = smaSeries(filled, rsiPeriod);
        signal.setData(pointsOf(averaged.map((value, index) => (rsiValues[index] == null ? null : value))));
        rsiSignalRef.current = signal;
      }

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
      chart.panes()[pane]?.setHeight(INDICATOR_PANE_HEIGHT);
      rsiRef.current = rsiSeries;
    }

    // Connors RSI swings far harder than the ordinary kind, so it gets its own
    // bands at 90 and 10 rather than borrowing RSI's 70 and 30.
    if (showCrsi && visible.length > CRSI_PARAMS[0] + 2) {
      pane += 1;
      const crsiSeries = oscillator(dark ? "#6FB6E8" : "#2F6FA0", pane);
      crsiSeries.setData(pointsOf(connorsRsi(closes, ...CRSI_PARAMS)));
      for (const level of [90, 10]) {
        crsiSeries.createPriceLine({
          price: level,
          color: level === 90 ? down : up,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: String(level),
        });
      }
      chart.panes()[pane]?.setHeight(INDICATOR_PANE_HEIGHT);
      crsiRef.current = crsiSeries;
    }

    // Floor-trader pivots from the previous period: the pivot itself solid,
    // its five levels either side dashed and fainter the further out they go.
    if (showPivots && pivots && !isIntraday) {
      candleSeries.createPriceLine({
        price: pivots.p,
        color: accent,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "P",
      });
      pivots.r.forEach((price, index) => {
        candleSeries.createPriceLine({
          price,
          color: down,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: index < 3,
          title: `R${index + 1}`,
        });
      });
      pivots.s.forEach((price, index) => {
        candleSeries.createPriceLine({
          price,
          color: up,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: index < 3,
          title: `S${index + 1}`,
        });
      });
    }

    // Support and resistance as price lines on the candle series, labelled with
    // how many times each was tested — a line without its strength is just a
    // line someone drew.
    // Support and resistance are computed from daily bars, so they belong to
    // the daily chart. Six dashed lines across one session was the single
    // biggest source of clutter on the intraday pane, and none of them was
    // measured at this timescale.
    const spot = isIntraday ? null : visible.at(-1)?.close ?? null;
    for (const level of isIntraday ? [] : nearestLevels(levels?.resistances, spot, levelCount)) {
      candleSeries.createPriceLine({
        price: level.price,
        color: down,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `R ${level.touches}×`,
      });
    }
    for (const level of isIntraday ? [] : nearestLevels(levels?.supports, spot, levelCount)) {
      candleSeries.createPriceLine({
        price: level.price,
        color: up,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `S ${level.touches}×`,
      });
    }

    // Early in a session there are only a handful of five-minute bars, and
    // fitContent spreads them across the full width — candles as wide as a
    // finger, which reads as a bar chart of something else. While the session
    // is too thin to fill the pane, pin the bars to a normal width and let it
    // grow in from the left the way a broker's does; once there are enough to
    // fill it, fitContent is right again.
    //
    // Asking the time scale for its barSpacing does not answer this: it returns
    // the configured value, not the width fitContent actually produced.
    const scale = chart.timeScale();
    const slots = Math.floor(container.clientWidth / MAX_INTRADAY_BAR_SPACING);
    if (isIntraday && visible.length < slots) {
      // Anchor bar zero to the left edge and show a full pane's worth of slots,
      // so the morning's candles keep a normal width and the empty afternoon
      // sits to the right of them. Setting barSpacing alone does not do this —
      // it resizes the bars but leaves the viewport wherever it was, which
      // strands a thin session in the middle of the pane.
      scale.setVisibleLogicalRange({ from: -1, to: slots });
    } else {
      scale.fitContent();
    }

    return () => {
      // Every range change tears down and rebuilds. Without this the canvases
      // accumulate and the page slowly leaks.
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      vwapRef.current = null;
      rsiRef.current = null;
      rsiSignalRef.current = null;
      crsiRef.current = null;
      volumeAvgRef.current = null;
      drawnRef.current = [];
    };
  }, [rebuildKey, levels, pivots, previousClose, resolvedTheme, isIntraday, candleType, showRsi, rsiPeriod, rsiSignal, showCrsi, showPivots, volumeAvg, levelCount]);

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
    const closes = visible.map((candle) => candle.close);
    const rsiLine = rsiRef.current;
    if (rsiLine) {
      const values = rsi(closes, rsiPeriod);
      for (let i = from; i < visible.length; i++) {
        const value = values[i];
        if (value != null) rsiLine.update({ time: visible[i].time, value });
      }
      const signal = rsiSignalRef.current;
      if (signal) {
        const averaged = smaSeries(values.map((value) => value ?? 0), rsiPeriod);
        for (let i = from; i < visible.length; i++) {
          const value = averaged[i];
          if (value != null && values[i] != null) signal.update({ time: visible[i].time, value });
        }
      }
    }

    const crsiLine = crsiRef.current;
    if (crsiLine) {
      const values = connorsRsi(closes, ...CRSI_PARAMS);
      for (let i = from; i < visible.length; i++) {
        const value = values[i];
        if (value != null) crsiLine.update({ time: visible[i].time, value });
      }
    }

    const volumeAvgLine = volumeAvgRef.current;
    if (volumeAvgLine) {
      const values = smaSeries(visible.map((candle) => candle.volume ?? 0), VOLUME_AVG_PERIOD);
      for (let i = from; i < visible.length; i++) {
        const value = values[i];
        if (value != null) volumeAvgLine.update({ time: visible[i].time, value });
      }
    }

    // Heikin Ashi bodies depend on every bar before them, so the tail is
    // recomputed from the whole series rather than transformed bar by bar.
    const drawn = candleType === "heikin" ? toHeikinAshiBars(visible) : visible;
    for (let i = from; i < visible.length; i++) {
      const candle = drawn[i];
      series.update({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
      volume.update({
        time: visible[i].time,
        value: visible[i].volume ?? 0,
        color: visible[i].close >= visible[i].open ? `${up}40` : `${down}40`,
      });
    }

    drawnRef.current = visible;
  }, [visible, rsiPeriod, candleType]);

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
          {candleType === "heikin" ? (
            <span
              className="text-primary font-semibold"
              title="Heikin Ashi bodies are averaged, so the last close is not the traded price. The indicators below still use real closes."
            >
              Heikin Ashi
            </span>
          ) : null}
          {/* The legend names what is actually drawn. The intraday chart has
              one overlay and one reference; the daily chart has its averages
              and its levels. Listing both sets on both was how a reader ended
              up looking for a support line that was never there. */}
          {isIntraday ? (
            <>
              <span className="text-muted-foreground flex items-center gap-1.5">
                <i className="block h-0.5 w-3 rounded-full bg-[#2A78D6] dark:bg-[#7AB3F5]" aria-hidden /> VWAP
              </span>
              {previousClose != null ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <i className="block h-0.5 w-3 rounded-full bg-current opacity-40" aria-hidden /> Prev close
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-muted-foreground flex items-center gap-1.5">
                <i className="bg-primary block h-0.5 w-3 rounded-full" aria-hidden /> SMA 20
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5">
                <i className="block h-0.5 w-3 rounded-full bg-[#5B7A99] dark:bg-[#7FA3C4]" aria-hidden /> SMA 50
              </span>
              {/* Only when levels were actually handed in. The index chart passes
                  none, and a legend naming lines that are not on the canvas
                  sends someone hunting for a support level that never existed. */}
              {levelCount > 0 && (levels?.supports?.length || levels?.resistances?.length) ? (
                <>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <i className="bg-down block h-0.5 w-3 rounded-full" aria-hidden /> Resistance
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <i className="bg-up block h-0.5 w-3 rounded-full" aria-hidden /> Support
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showRsi ? (
            <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px]">
              <i className="block h-0.5 w-3 rounded-full bg-[#8A5A1F] dark:bg-[#D6A15C]" aria-hidden />
              RSI {rsiPeriod}
              {rsiSignal ? ` SMA ${rsiPeriod}` : ""}
            </span>
          ) : null}
          {showCrsi ? (
            <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px]">
              <i className="block h-0.5 w-3 rounded-full bg-[#2F6FA0] dark:bg-[#6FB6E8]" aria-hidden />
              CRSI {CRSI_PARAMS.join(" ")}
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
      <div ref={containerRef} className="w-full" style={{ height: chartHeight }} />

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
