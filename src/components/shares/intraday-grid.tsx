"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Plus, X } from "lucide-react";

import { CandleChart } from "@/components/shares/candle-chart";
import { ChartSettings } from "@/components/shares/chart-settings";
import { useSharedSession } from "@/components/shares/live-session";
import {
  applyLivePrice,
  mergeSessionPoints,
  toIntradayCandles,
  INTRADAY_INTERVALS,
  type IntradayInterval,
  type LivePoint,
} from "@/lib/live/intraday";
import type { IntradayCandle } from "@/lib/services/shares/queries";
import type { LevelSet } from "@/lib/ta/levels";
import type { PivotLevels } from "@/lib/ta/pivot-points";
import { cn } from "@/lib/utils";

/** Six panes is one per interval — past that they are too small to read anyway. */
const MAX_PANES = 6;
const DEFAULT_LAYOUT: IntradayInterval[] = [1, 5, 15];

type Pane = { id: string; minutes: IntradayInterval };

function label(minutes: IntradayInterval): string {
  return minutes === 60 ? "1h" : `${minutes}m`;
}

function paneId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/**
 * One key for every share, not one per symbol: the intervals someone watches
 * at are a way of working, not a fact about a company. Set the grid up once
 * and the next share opens the same way.
 */
const STORAGE_KEY = "wd:intraday-grid";

/** Nothing to subscribe to — this store only ever answers "is this the client yet". */
const subscribeNever = () => () => {};

function loadLayout(): IntradayInterval[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    const intervals = parsed
      .filter((value): value is IntradayInterval =>
        (INTRADAY_INTERVALS as readonly number[]).includes(value as number),
      )
      .slice(0, MAX_PANES);
    return intervals.length > 0 ? intervals : DEFAULT_LAYOUT;
  } catch {
    // A browser with site data blocked still gets the default layout.
    return DEFAULT_LAYOUT;
  }
}

/**
 * One share, several clocks.
 *
 * The same session drawn at more than one interval at once — a minute chart
 * for what is happening now beside a fifteen for whether it matters. Every
 * pane folds the same array of minute points itself, so the grid costs exactly
 * one poll however many charts are open: the interval is a property of the
 * drawing, not of the fetch.
 *
 * The layout is remembered across shares, because the intervals someone
 * watches at are a habit rather than a one-off choice.
 */
export function IntradayGrid({
  symbol,
  initialPoints,
  initialLastPrice,
  levels,
  pivots,
}: {
  symbol: string;
  initialPoints: LivePoint[];
  initialLastPrice: number | null;
  /** The daily supports and resistances, drawn on the minute charts too — they are the same levels. */
  levels: LevelSet | null;
  /** Yesterday's pivots: every pane here is intraday, whatever its interval. */
  pivots: PivotLevels | null;
}) {
  const { session, ticks } = useSharedSession();
  // False while the server renders and through hydration, true after — so the
  // saved layout is read only once the markup the server produced has been
  // matched. Reading it any earlier is how a hydration mismatch happens.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [chosen, setChosen] = useState<Pane[] | null>(null);

  // Ids derived from position rather than generated: this runs during render,
  // and a random id there would hand React a different key every pass.
  const saved = useMemo(
    () =>
      (hydrated ? loadLayout() : DEFAULT_LAYOUT).map((minutes, index) => ({
        id: `${index}:${minutes}`,
        minutes,
      })),
    [hydrated],
  );
  const panes = chosen ?? saved;

  function save(next: Pane[]) {
    setChosen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((pane) => pane.minutes)));
    } catch {
      // Not being able to remember the layout is not a reason to refuse to change it.
    }
  }

  // Published minutes plus the prices this page has watched: the second half is
  // what puts a real body on the bars forming while you sit here.
  const points = mergeSessionPoints(session?.points ?? initialPoints, ticks);
  const lastPrice = session?.lastPrice ?? initialLastPrice;
  // The upstream's own clock rather than the browser's: it decides which bucket
  // the live price belongs in, and the server's timestamp is the one the points
  // were true at.
  const at = session?.at ?? points.at(-1)?.at ?? 0;

  const series = useMemo(() => {
    const byInterval = new Map<number, IntradayCandle[]>();
    if (points.length === 0) return byInterval;

    for (const minutes of new Set(panes.map((pane) => pane.minutes))) {
      const folded = applyLivePrice(toIntradayCandles(points, minutes), lastPrice, at, minutes);
      byInterval.set(
        minutes,
        folded.map((candle) => ({
          time: Math.floor(candle.t / 1000),
          open: candle.o,
          high: candle.h,
          low: candle.l,
          close: candle.c,
          volume: candle.v,
        })),
      );
    }
    return byInterval;
  }, [panes, points, lastPrice, at]);

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No session to fold yet — this grid fills in once the market opens and the first prints arrive.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground max-w-[46ch] text-xs">
          One session, several intervals, all from the same poll. Minutes you watch here get a real
          high and low from the prices as they arrive; minutes from before you opened the page have
          only the single price the exchange published.
          {ticks.length > 0 ? ` ${ticks.length} watched so far.` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ChartSettings />
          <button
            type="button"
            onClick={() => save([...panes, { id: paneId(), minutes: 5 }])}
            disabled={panes.length >= MAX_PANES}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] transition-colors",
              panes.length >= MAX_PANES
                ? "text-muted-foreground/40 border-dashed"
                : "text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            <Plus className="size-3" aria-hidden />
            Add chart
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {panes.map((pane) => (
          <div key={pane.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Interval for this chart</span>
                <select
                  value={pane.minutes}
                  onChange={(event) =>
                    save(
                      panes.map((entry) =>
                        entry.id === pane.id
                          ? { ...entry, minutes: Number(event.target.value) as IntradayInterval }
                          : entry,
                      ),
                    )
                  }
                  className="bg-background rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                >
                  {INTRADAY_INTERVALS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {label(minutes)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => save(panes.filter((entry) => entry.id !== pane.id))}
                disabled={panes.length === 1}
                aria-label={`Close the ${label(pane.minutes)} chart`}
                className="text-muted-foreground/50 hover:text-down transition-colors disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <CandleChart
              mode="intraday"
              intervalLabel={`${symbol} · ${label(pane.minutes)}`}
              candles={[]}
              intraday={series.get(pane.minutes) ?? []}
              levels={levels}
              pivots={pivots}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
