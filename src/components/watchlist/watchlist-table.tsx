"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ChangePill } from "@/components/market/change-pill";
import { Sparkline } from "@/components/watchlist/sparkline";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { removeFromWatchlist, updateWatchlistNote } from "@/lib/actions/watchlist/actions";
import type { WatchlistRow } from "@/lib/services/watchlist/queries";
import { cn, formatInr, formatPercent, relativeTime } from "@/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  EARNINGS: "RESULTS", BOARD_MEETING: "BOARD", DIVIDEND: "EX-DIV", BONUS: "BONUS",
  SPLIT: "SPLIT", RIGHTS: "RIGHTS", BUYBACK: "BUYBACK", AGM: "AGM", OTHER: "EVENT",
};

export function WatchlistTable({ rows, now }: { rows: WatchlistRow[]; now: number }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function saveNote(shareId: string, note: string) {
    setEditing(null);
    startTransition(async () => {
      const result = await updateWatchlistNote(shareId, note);
      if (!result.ok) toast.error("Could not save the note", { description: result.error });
    });
  }

  function remove(shareId: string, symbol: string) {
    startTransition(async () => {
      const result = await removeFromWatchlist(shareId);
      if (result.ok) toast(`${symbol} removed`);
      else toast.error("Could not remove that share", { description: result.error });
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="hidden min-w-[150px] md:table-cell">Note</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-right">Today</TableHead>
          <TableHead className="text-right whitespace-nowrap">Since added</TableHead>
          <TableHead className="hidden lg:table-cell">30-day</TableHead>
          <TableHead className="hidden text-right md:table-cell">RSI</TableHead>
          <TableHead className="hidden text-right whitespace-nowrap lg:table-cell">20d RS</TableHead>
          <TableHead className="hidden sm:table-cell">Flags</TableHead>
          <TableHead className="w-8" aria-label="Remove" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.shareId} className={cn(pending && "opacity-60")}>
            <TableCell>
              <Link
                href={`/shares/${row.symbol.toLowerCase()}`}
                className="hover:text-primary font-mono text-xs font-semibold underline-offset-2 hover:underline"
              >
                {row.symbol}
              </Link>
              <p className="text-muted-foreground max-w-[160px] truncate text-[10px]">{row.name}</p>
              {/* The Note column is hidden below md. Editing a note needs the
                  wider layout, but the note itself is the reason you added the
                  share — so it stays readable here rather than vanishing. */}
              {row.note ? (
                <p className="text-muted-foreground/80 max-w-[160px] truncate text-[10px] italic md:hidden">
                  {row.note}
                </p>
              ) : null}
            </TableCell>

            <TableCell className="hidden md:table-cell">
              {editing === row.shareId ? (
                <input
                  autoFocus
                  defaultValue={row.note ?? ""}
                  maxLength={200}
                  onBlur={(event) => saveNote(row.shareId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveNote(row.shareId, event.currentTarget.value);
                    if (event.key === "Escape") setEditing(null);
                  }}
                  className="border-primary/50 w-full rounded border bg-transparent px-1.5 py-0.5 text-xs outline-none"
                  aria-label={`Note for ${row.symbol}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(row.shareId)}
                  className={cn(
                    "hover:text-foreground w-full truncate text-left text-xs",
                    row.note ? "text-muted-foreground" : "text-muted-foreground/50 italic",
                  )}
                >
                  {row.note ?? "add a note"}
                </button>
              )}
            </TableCell>

            <TableCell className="tabular text-right font-mono text-xs">
              {row.lastPrice != null ? formatInr(row.lastPrice) : <span className="text-muted-foreground">—</span>}
            </TableCell>

            <TableCell className="text-right">
              {row.dayChangePercent != null ? (
                <ChangePill percent={row.dayChangePercent} size="sm" />
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>

            <TableCell className="text-right">
              {row.sinceAddedPercent != null ? (
                <span
                  className={cn(
                    "tabular font-mono text-xs font-semibold",
                    row.sinceAddedPercent > 0 ? "text-up" : row.sinceAddedPercent < 0 ? "text-down" : "text-muted-foreground",
                  )}
                  title={`Added ${relativeTime(row.addedAt, new Date(now))} at ₹${formatInr(row.addedPrice)}`}
                >
                  {formatPercent(row.sinceAddedPercent)}
                </span>
              ) : (
                <span
                  className="text-muted-foreground text-xs"
                  title="No quote was available when this was added, so there is nothing to measure from."
                >
                  —
                </span>
              )}
            </TableCell>

            <TableCell className="hidden lg:table-cell">
              <Sparkline values={row.spark} />
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

            <TableCell
              className="tabular hidden text-right font-mono text-xs lg:table-cell"
              title={row.rsPercentile != null ? `Ranks ${row.rsPercentile.toFixed(0)}th percentile in this watchlist` : undefined}
            >
              {row.returnPercent20d != null ? (
                <span
                  className={cn(
                    row.rsPercentile != null && row.rsPercentile >= 67 && "text-up",
                    row.rsPercentile != null && row.rsPercentile <= 33 && "text-down",
                  )}
                >
                  {formatPercent(row.returnPercent20d)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>

            <TableCell className="hidden sm:table-cell">
              <span className="flex flex-wrap gap-1">
                {row.nextEvent ? (
                  <Badge variant="event">
                    {EVENT_LABEL[row.nextEvent.type] ?? "EVENT"} {row.nextEvent.eventDate.slice(8)}/
                    {row.nextEvent.eventDate.slice(5, 7)}
                  </Badge>
                ) : null}
                {row.newsCount > 0 ? <Badge>{row.newsCount} NEWS</Badge> : null}
              </span>
            </TableCell>

            <TableCell>
              <button
                type="button"
                onClick={() => remove(row.shareId, row.symbol)}
                disabled={pending}
                aria-label={`Remove ${row.symbol} from watchlist`}
                className="text-muted-foreground/50 hover:text-down transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
