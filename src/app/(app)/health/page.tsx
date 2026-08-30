import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { RefreshButton } from "@/components/market/refresh-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { serverNow } from "@/lib/server-now";
import { getPollerStatus, getUniverseStats, listSourceHealth } from "@/lib/services/health/queries";
import { cn, relativeTime } from "@/lib/utils";

/**
 * Vercel defaults server functions to ten seconds. On a cold cache this page
 * fetches sequentially — one request in flight per host, at the politeness gap
 * — which is comfortably more than that. Sixty is the Hobby ceiling, and the
 * budgets in the data layer are sized against it.
 */
export const maxDuration = 60;


export const metadata: Metadata = { title: "Health" };
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  // One instant for the whole render, so every relative time on the page agrees.
  const [sources, stats, poller, now] = await Promise.all([
    listSourceHealth(),
    getUniverseStats(),
    getPollerStatus(),
    serverNow(),
  ]);
  const nowDate = new Date(now);

  const tiles = [
    { label: "Sectors", value: stats.sectors },
    { label: "Shares", value: stats.shares },
    { label: "Quoted", value: `${stats.quoted}/${stats.shares}` },
    { label: "Memberships", value: stats.memberships },
    { label: "Events", value: stats.events },
    { label: "Articles", value: stats.articles },
    { label: "Option chains", value: stats.chains },
    { label: "Watchlist", value: stats.watchlist },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="What's stale, and why"
        title="Data health"
        description="Every upstream, when it last worked, and when it will next be tried."
      />

      <Card
        className={cn(
          "mb-4 flex flex-wrap items-center gap-3 px-4 py-3",
          poller.running ? "border-up/40" : "border-primary/40",
        )}
      >
        <span className={cn("size-2 rounded-full", poller.running ? "bg-up animate-pulse" : "bg-primary")} aria-hidden />
        <span className="text-sm font-medium">
          {poller.running ? "A poller has checked in recently" : "No poller has checked in"}
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          last attempt {relativeTime(poller.lastAttemptAt, nowDate)}
        </span>
        {!poller.running ? (
          <span className="text-muted-foreground text-xs">
            Run <code className="bg-muted rounded px-1 py-0.5 font-mono">npm run poller</code> in a second
            terminal to keep this live.
          </span>
        ) : null}
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((tile) => (
          <Card key={tile.label} className="px-3 py-2.5">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.11em] uppercase">
              {tile.label}
            </p>
            <p className="tabular mt-1 font-mono text-lg font-semibold">{tile.value}</p>
          </Card>
        ))}
      </div>

      {stats.oldestNews ? (
        <p className="text-muted-foreground mb-4 font-mono text-xs">
          News retained back to {stats.oldestNews.toISOString().slice(0, 10)} (
          {Math.round((now - stats.oldestNews.getTime()) / 86_400_000)} days).
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>What it feeds</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Took</TableHead>
              <TableHead className="text-right">Fails</TableHead>
              <TableHead>Next try</TableHead>
              <TableHead className="min-w-[200px]">Last error</TableHead>
              <TableHead aria-label="Refresh" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.source}>
                <TableCell className="font-mono text-[11px] font-semibold">{source.source}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{source.label}</TableCell>
                <TableCell>
                  {source.lastStatus === "OK" ? (
                    <Badge variant="up">OK</Badge>
                  ) : source.lastStatus === "FAILED" ? (
                    <Badge variant="down">FAILED</Badge>
                  ) : (
                    <Badge>NEVER RUN</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {relativeTime(source.lastSuccessAt, nowDate)}
                </TableCell>
                <TableCell className="tabular text-right font-mono text-xs">
                  {source.itemCount ?? "—"}
                </TableCell>
                <TableCell className="tabular text-muted-foreground text-right font-mono text-xs">
                  {source.durationMs != null ? `${source.durationMs}ms` : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "tabular text-right font-mono text-xs",
                    source.consecutiveFailures > 0 && "text-down font-semibold",
                  )}
                >
                  {source.consecutiveFailures}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {source.nextEligibleAt && source.nextEligibleAt.getTime() > now
                    ? `in ${Math.ceil((source.nextEligibleAt.getTime() - now) / 60_000)}m`
                    : "now"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[300px] truncate text-xs">
                  {source.lastError ?? "—"}
                </TableCell>
                <TableCell>
                  <RefreshButton source={source.source} label={source.label} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </PageShell>
  );
}
