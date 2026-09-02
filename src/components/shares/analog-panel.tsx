"use client";

import { useState } from "react";

import type { AnalogView } from "@/lib/services/shares/queries";
import { cn, formatPercent } from "@/lib/utils";

/** Below this, the matches are anecdotes rather than a pattern, and are shown as such. */
const THIN = 3;

function Summary({ view, unit }: { view: AnalogView; unit: string }) {
  if (view.matches.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        None of {view.candidates} earlier stretches traced a shape close to the current one. That is the
        common answer — most of a chart is not a repeat of some earlier part of it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-semibold">{view.matches.length}</span> of {view.candidates} earlier stretches
        traced a similar {`${view.window}-${unit.replace(/s$/, "")}`} shape. In the {view.horizon} {unit} after
        each, this share moved{" "}
        <span className="font-mono">
          {formatPercent(view.worstFollow, 1)} to {formatPercent(view.bestFollow, 1)}
        </span>
        , median <span className="font-mono">{formatPercent(view.medianFollow, 1)}</span> — {view.upCount} up,{" "}
        {view.downCount} down.
      </p>

      {/* Without this line the panel is misleading. A series that drifted up
          all session hands back positive analogs whatever shape you search
          for, and they look like a finding until you see what any random
          stretch did over the same horizon. */}
      {view.baselineFollow != null ? (
        <p className="text-muted-foreground text-xs">
          Any {view.horizon} {unit} in this series moved{" "}
          <span className="font-mono">{formatPercent(view.baselineFollow, 1)}</span> at the median — the drift
          these outcomes sit on top of.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {view.matches.map((match) => (
          <li
            key={match.label}
            className="flex items-center justify-between gap-3 border-b py-1.5 text-xs last:border-0"
          >
            <span className="text-muted-foreground font-mono">{match.label}</span>
            <span className="text-muted-foreground/70 font-mono text-[10px]">
              {(match.similarity * 100).toFixed(0)}% alike
            </span>
            <span
              className={cn(
                "tabular w-16 text-right font-mono font-semibold",
                match.followPercent > 0 ? "text-up" : match.followPercent < 0 ? "text-down" : "text-muted-foreground",
              )}
            >
              {formatPercent(match.followPercent, 1)}
            </span>
          </li>
        ))}
      </ul>

      {view.matches.length < THIN ? (
        <p className="text-muted-foreground text-xs">
          Two or fewer matches is a coincidence with a sample size, not a tendency.
        </p>
      ) : null}
    </div>
  );
}

/**
 * What followed, the last few times the chart looked like this.
 *
 * A shape search over the history the app already holds: the most recent
 * stretch is compared with every earlier one, and the closest few are listed
 * with what the price did next.
 *
 * The panel is careful to stay a description of the past. It reports the spread
 * of outcomes rather than an average, shows how few matches there usually are,
 * and says plainly that none of it is a forecast — because the honest reading
 * of four analogs is "here is what happened those times", and anything more
 * confident than that would be the chart telling you a story it cannot know.
 */
export function AnalogPanel({ daily, intraday }: { daily: AnalogView; intraday: AnalogView | null }) {
  const [scope, setScope] = useState<"daily" | "intraday">("daily");
  const view = scope === "intraday" && intraday ? intraday : daily;

  return (
    <div className="flex flex-col gap-2">
      {intraday ? (
        <div className="flex gap-0.5">
          {(["daily", "intraday"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              aria-pressed={scope === key}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] transition-colors",
                scope === key
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "daily" ? "Sessions" : "Today"}
            </button>
          ))}
        </div>
      ) : null}

      <Summary view={view} unit={scope === "intraday" && intraday ? "minutes" : "sessions"} />

      <p className="text-muted-foreground border-t pt-2 text-[11px]">
        A description of what happened after similar-looking stretches, not a forecast. Shapes repeat far
        more often than outcomes do.
      </p>
    </div>
  );
}
