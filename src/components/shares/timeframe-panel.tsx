import { Badge } from "@/components/ui/badge";
import type { Volatility } from "@/lib/live/regime";
import type { Confluence, TimeframeTrend } from "@/lib/ta/trend";
import { cn, formatPercent } from "@/lib/utils";

const UNIT: Record<TimeframeTrend["label"], string> = { daily: "day", weekly: "week", monthly: "month" };

/** What the average itself is doing, said only when there is enough of it to know. */
const SLOPE_NOTE: Record<"UP" | "DOWN" | "FLAT" | "UNKNOWN", string> = {
  UP: ", rising",
  DOWN: ", falling",
  FLAT: ", flat",
  UNKNOWN: "",
};

const ALIGNMENT_NOTE: Record<Confluence["alignment"], string> = {
  FULL: "every timeframe agrees",
  MAJORITY: "the ones that trend agree",
  MIXED: "the timeframes disagree",
  NONE: "nothing is trending",
};

function directionVariant(direction: TimeframeTrend["direction"]) {
  return direction === "UP" ? "up" : direction === "DOWN" ? "down" : "default";
}

/**
 * The same trend question asked three ways.
 *
 * A share can be above its 50-day and below its 6-month average at the same
 * time, and which of those you care about is the whole argument. The panel
 * shows both rather than collapsing them into one verdict — and the slope
 * column says whether each average is itself moving with the price.
 */
export function TimeframePanel({
  confluence,
  volatility,
}: {
  confluence: Confluence | null;
  volatility: Volatility;
}) {
  if (!confluence) {
    return (
      <p className="text-muted-foreground text-sm">
        Not enough weekly history yet — the timeframes need about four months of bars.
      </p>
    );
  }

  const score = Math.round(confluence.score);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs">{ALIGNMENT_NOTE[confluence.alignment]}</span>
        <span
          className={cn(
            "tabular font-mono text-sm font-semibold",
            score > 0 ? "text-up" : score < 0 ? "text-down" : "text-muted-foreground",
          )}
          title="Weighted agreement across the timeframes, -100 to +100. Longer timeframes count for more."
        >
          {score > 0 ? `+${score}` : score}
        </span>
      </div>

      <ul className="flex flex-col">
        {confluence.timeframes.map((timeframe) => (
          <li key={timeframe.label} className="flex items-center gap-2 border-b py-1.5 text-xs last:border-0">
            <span className="text-muted-foreground w-14 shrink-0 font-mono text-[10px] tracking-[0.11em] uppercase">
              {timeframe.label}
            </span>
            <Badge variant={directionVariant(timeframe.direction)}>{timeframe.direction}</Badge>
            <span className="tabular font-mono">{formatPercent(timeframe.distancePercent, 1)}</span>
            <span className="text-muted-foreground truncate">
              vs {timeframe.period}-{UNIT[timeframe.label]} avg{SLOPE_NOTE[timeframe.slope ?? "UNKNOWN"]}
            </span>
          </li>
        ))}
      </ul>

      {volatility.atrPercentRank != null ? (
        <p className="text-muted-foreground text-xs">
          {volatility.atrPercentRank >= 50
            ? `ATR is wider than ${Math.round(volatility.atrPercentRank)}% of its own year`
            : `ATR is tighter than ${Math.round(100 - volatility.atrPercentRank)}% of its own year`}
          {volatility.trend === "EXPANDING"
            ? ", and widening"
            : volatility.trend === "CONTRACTING"
              ? ", and narrowing"
              : ""}
          .
        </p>
      ) : null}
    </div>
  );
}
