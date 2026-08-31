import Link from "next/link";
import { Star } from "lucide-react";

import { ChangePill } from "@/components/market/change-pill";
import { DayRangeBar } from "@/components/market/day-range-bar";
import { PriceCell } from "@/components/market/price-cell";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConstituentRow } from "@/lib/services/sectors/queries";
import { cn, formatCompact } from "@/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  EARNINGS: "RESULTS",
  BOARD_MEETING: "BOARD",
  DIVIDEND: "EX-DIV",
  BONUS: "BONUS",
  SPLIT: "SPLIT",
  RIGHTS: "RIGHTS",
  BUYBACK: "BUYBACK",
  AGM: "AGM",
  OTHER: "EVENT",
};

function eventChip(event: { eventDate: string; type: string }) {
  const [, month, day] = event.eventDate.split("-");
  const label = EVENT_LABEL[event.type] ?? "EVENT";
  return `${label} ${day}/${month}`;
}

export function ConstituentsTable({ rows, now }: { rows: ConstituentRow[]; now: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" aria-label="Watchlist" />
          <TableHead>Symbol</TableHead>
          <TableHead className="hidden min-w-[180px] md:table-cell">Company</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="hidden lg:table-cell">Day range</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Volume</TableHead>
          <TableHead className="hidden text-right md:table-cell">RSI</TableHead>
          <TableHead className="hidden sm:table-cell">Flags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Star
                className={cn("size-3.5", row.inWatchlist ? "fill-primary text-primary" : "text-muted-foreground/40")}
                aria-label={row.inWatchlist ? "On your watchlist" : undefined}
              />
            </TableCell>
            <TableCell>
              <Link
                href={`/shares/${row.symbol.toLowerCase()}`}
                className="hover:text-primary font-mono text-xs font-semibold underline-offset-2 hover:underline"
              >
                {row.symbol}
              </Link>
              {/* The Company column is hidden below md, and a bare ticker is not
                  identifiable — so the name moves under the symbol rather than
                  disappearing. */}
              <span className="text-muted-foreground block max-w-[150px] truncate text-[10px] md:hidden">
                {row.name}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground hidden max-w-[240px] truncate text-xs md:table-cell">
              {row.name}
            </TableCell>
            <TableCell className="text-right">
              <PriceCell value={row.lastPrice} quotedAt={row.quotedAt} now={now} source={row.quoteSource} />
            </TableCell>
            <TableCell className="text-right">
              {row.dayChangePercent != null ? (
                <ChangePill percent={row.dayChangePercent} size="sm" />
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <DayRangeBar low={row.dayLow} high={row.dayHigh} last={row.lastPrice} />
            </TableCell>
            <TableCell className="tabular text-muted-foreground hidden text-right font-mono text-xs lg:table-cell">
              {formatCompact(row.volume)}
            </TableCell>
            <TableCell className="tabular hidden text-right font-mono text-xs md:table-cell">
              {row.rsi14 != null ? (
                <span className={cn(row.rsi14 >= 70 && "text-down", row.rsi14 <= 30 && "text-up")}>
                  {row.rsi14.toFixed(0)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <span className="flex flex-wrap gap-1">
                {row.nextEvent ? <Badge variant="event">{eventChip(row.nextEvent)}</Badge> : null}
                {row.newsCount > 0 ? <Badge>{row.newsCount} NEWS</Badge> : null}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
