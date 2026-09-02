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

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px]", className)}>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => updateChartSettings({ rsi: !settings.rsi })}
          aria-pressed={settings.rsi}
          title="Relative Strength Index, in a pane below the price"
          className={cn(
            "rounded border px-2 py-1 transition-colors",
            settings.rsi
              ? "border-primary/40 bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground border-border",
          )}
        >
          RSI
        </button>
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
      </span>

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
