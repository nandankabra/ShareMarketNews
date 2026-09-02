"use client";

import {
  LEVEL_COUNTS,
  RSI_PERIODS,
  updateChartSettings,
  useChartSettings,
} from "@/lib/chart/settings";
import { cn } from "@/lib/utils";

/**
 * One control for every chart on the page.
 *
 * Deliberately not per chart: with six panes open, six copies of this would be
 * six chances for them to disagree, and a grid whose panes each draw a
 * different number of levels is harder to read than one that draws none.
 */
export function ChartSettings({ className }: { className?: string }) {
  const settings = useChartSettings();

  const toggle = (key: "rsi" | "rsiSignal" | "crsi" | "pivots" | "volumeAvg", label: string, title: string) => (
    <button
      type="button"
      onClick={() => updateChartSettings({ [key]: !settings[key] })}
      aria-pressed={settings[key]}
      title={title}
      className={cn(
        "rounded border px-2 py-1 transition-colors",
        settings[key]
          ? "border-primary/40 bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground border-border",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px]", className)}>
      <label className="text-muted-foreground flex items-center gap-1">
        <span className="sr-only">Candle type</span>
        <select
          value={settings.candleType}
          onChange={(event) =>
            updateChartSettings({ candleType: event.target.value === "heikin" ? "heikin" : "candles" })
          }
          title="Heikin Ashi averages each body into the one before it — smoother runs, and a close that is not the traded price"
          className="bg-background text-foreground rounded border px-1 py-0.5 text-[10px]"
        >
          <option value="candles">Candles</option>
          <option value="heikin">Heikin Ashi</option>
        </select>
      </label>

      <span className="flex items-center gap-1.5">
        {toggle("rsi", "RSI", "Relative Strength Index, in a pane below the price")}
        <label className={cn("flex items-center gap-1", !settings.rsi && "opacity-40")}>
          <span className="sr-only">RSI period</span>
          <select
            value={settings.rsiPeriod}
            disabled={!settings.rsi}
            onChange={(event) => updateChartSettings({ rsiPeriod: Number(event.target.value) })}
            className="bg-background rounded border px-1 py-0.5 text-[10px]"
          >
            {RSI_PERIODS.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
        {settings.rsi
          ? toggle("rsiSignal", "sig", "A moving average of RSI itself, drawn in the same pane")
          : null}
      </span>

      {toggle("crsi", "CRSI", "Connors RSI: a fast composite that lives at its own extremes, banded 90/10")}
      {toggle("pivots", "Pivots", "Floor-trader pivots from the previous period: P with five levels each side")}
      {toggle("volumeAvg", "Vol avg", "A 9-bar moving average over the volume histogram")}

      <label className="text-muted-foreground flex items-center gap-1">
        Levels
        <select
          value={settings.levelCount}
          onChange={(event) => updateChartSettings({ levelCount: Number(event.target.value) })}
          title="How many supports and resistances to draw, each side"
          className="bg-background text-foreground rounded border px-1 py-0.5 text-[10px]"
        >
          {LEVEL_COUNTS.map((count) => (
            <option key={count} value={count}>
              {count === 0 ? "off" : `${count}×2`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
