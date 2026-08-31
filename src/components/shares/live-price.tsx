"use client";

import { ChangePill } from "@/components/market/change-pill";
import { formatInr } from "@/lib/utils";

import { useSharedSession } from "./live-session";

/**
 * The headline price, updating in place.
 *
 * Falls back to whatever the server rendered until the first poll lands, so the
 * number is never blank and never jumps from a placeholder — the page shows the
 * server's price immediately and swaps in a fresher one a moment later.
 */
export function LivePrice({
  initialPrice,
  initialChange,
  initialChangePercent,
  initialAsOf,
  source,
}: {
  initialPrice: number | null;
  initialChange: number | null;
  initialChangePercent: number | null;
  initialAsOf: string | null;
  source: string | null;
}) {
  const { session, stale } = useSharedSession();

  const price = session?.lastPrice ?? initialPrice;
  const change = session?.change ?? initialChange;
  const changePercent = session?.changePercent ?? initialChangePercent;
  const asOf = session?.asOf ?? initialAsOf;

  return (
    <div className="text-left sm:text-right">
      <div className="tabular font-mono text-3xl font-semibold tracking-tight">
        {price != null ? `₹${formatInr(price)}` : "—"}
      </div>
      <div className="mt-1 flex items-center justify-start gap-2 sm:justify-end">
        {changePercent != null ? <ChangePill percent={changePercent} absolute={change} /> : null}
        <span className="text-muted-foreground font-mono text-[10px]">
          {asOf ? `${asOf}` : "no quote yet"}
          {source ? ` · ${source} price` : ""}
          {/* Said plainly rather than hidden: a chart that has quietly stopped
              updating is worse than one that admits it. */}
          {stale ? " · not updating" : ""}
        </span>
      </div>
    </div>
  );
}
