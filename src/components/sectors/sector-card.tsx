import Link from "next/link";

import { ChangePill } from "@/components/market/change-pill";
import { Card } from "@/components/ui/card";
import type { SectorSummary } from "@/lib/services/sectors/queries";
import { formatInr, relativeTime } from "@/lib/utils";

export function SectorCard({ sector, now }: { sector: SectorSummary; now: number }) {
  return (
    <Link
      href={`/sectors/${sector.key}`}
      className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-2"
    >
      <Card className="hover:border-foreground/20 h-full p-3.5 transition-colors">
        <p className="text-muted-foreground mb-1.5 font-mono text-[10px] tracking-[0.11em] uppercase">
          {sector.displayName}
        </p>

        <div className="flex items-baseline gap-2">
          <span className="tabular font-mono text-lg font-semibold tracking-tight">
            {sector.lastLevel != null ? formatInr(sector.lastLevel) : "—"}
          </span>
          {sector.lastChangePercent != null ? (
            <ChangePill percent={sector.lastChangePercent} size="sm" />
          ) : null}
        </div>

        <div className="text-muted-foreground mt-2.5 flex items-center justify-between gap-2 border-t pt-2 font-mono text-[10px]">
          <span>{sector.memberCount != null ? `${sector.memberCount} shares` : ""}</span>
          <span>
            {sector.levelAt ? `level ${relativeTime(sector.levelAt, new Date(now))}` : "no level"}
          </span>
        </div>

        {sector.topGainer || sector.topLoser ? (
          <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px]">
            {sector.topGainer ? (
              <span className="text-up truncate">
                ▲ {sector.topGainer.symbol} {sector.topGainer.changePercent.toFixed(1)}%
              </span>
            ) : <span />}
            {sector.topLoser && sector.topLoser.symbol !== sector.topGainer?.symbol ? (
              <span className="text-down truncate">
                ▼ {sector.topLoser.symbol} {sector.topLoser.changePercent.toFixed(1)}%
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
