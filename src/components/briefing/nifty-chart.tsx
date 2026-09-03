import { CandleChart } from "@/components/shares/candle-chart";
import type { IndexChart } from "@/lib/services/market/queries";
import { formatInr, formatPercent } from "@/lib/utils";

/**
 * The Nifty, on the briefing.
 *
 * Daily bars. NSE serves no intraday series for an index — `chart-databyindex`
 * answers with an empty array for every spelling of the name — so the header's
 * live level is as intraday as an index gets here, and this is where it has
 * been. The label says "daily" rather than leaving someone to infer it from the
 * axis.
 */
export function NiftyChart({
  chart,
  level,
  changePercent,
}: {
  chart: IndexChart | null;
  level: number | null;
  changePercent: number | null;
}) {
  if (!chart) return null;

  const last = chart.candles.at(-1);
  const previous = chart.candles.at(-2);
  // The header's live level when there is one; otherwise the last close, so the
  // number beside the chart is never blank while the chart itself has data.
  const shown = level ?? last?.close ?? null;
  const change =
    changePercent ??
    (last && previous ? ((last.close - previous.close) / previous.close) * 100 : null);
  const up = (change ?? 0) >= 0;

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b pb-1.5">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
          {chart.name}
        </h2>
        <div className="flex items-baseline gap-2 font-mono text-[10px]">
          {shown != null ? <span className="text-sm font-semibold">{formatInr(shown)}</span> : null}
          {change != null ? (
            <span className={up ? "text-up" : "text-down"}>{formatPercent(change)}</span>
          ) : null}
          <span className="text-muted-foreground">daily · {chart.candles.length} bars</span>
        </div>
      </div>

      <CandleChart candles={chart.candles} levels={null} />
    </section>
  );
}
