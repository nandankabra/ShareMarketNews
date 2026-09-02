import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { ChangePill } from "@/components/market/change-pill";
import { DayRangeBar } from "@/components/market/day-range-bar";
import { ChartSettings } from "@/components/shares/chart-settings";
import { IntradayGrid } from "@/components/shares/intraday-grid";
import { LiveChart } from "@/components/shares/live-chart";
import { LivePrice } from "@/components/shares/live-price";
import { LiveSessionProvider } from "@/components/shares/live-session";
import { NewsList } from "@/components/shares/news-list";
import { ReactionPanel } from "@/components/shares/reaction-panel";
import { SignalList } from "@/components/shares/signal-list";
import { TimeframePanel } from "@/components/shares/timeframe-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isLikelyMarketOpen } from "@/lib/date/ist";
import { serverNow } from "@/lib/server-now";
import { getShareDetail } from "@/lib/services/shares/queries";
import type { Level } from "@/lib/ta/levels";
import { cn, formatCompact, formatInr, formatPercent, relativeTime } from "@/lib/utils";

/**
 * Vercel defaults server functions to ten seconds. On a cold cache this page
 * fetches sequentially — one request in flight per host, at the politeness gap
 * — which is comfortably more than that. Sixty is the Hobby ceiling, and the
 * budgets in the data layer are sized against it.
 */
export const maxDuration = 60;


export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const share = await getShareDetail(symbol);
  return { title: share ? `${share.symbol} · ${share.name}` : "Share" };
}

function nearest(levels: Level[] | undefined, spot: number | null, side: "SUPPORT" | "RESISTANCE"): Level | null {
  if (!levels || spot == null) return null;
  const candidates = levels.filter((level) => (side === "SUPPORT" ? level.price < spot : level.price >= spot));
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level.price - spot) < Math.abs(closest.price - spot) ? level : closest,
  );
}

export default async function SharePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const [share, now] = await Promise.all([getShareDetail(symbol), serverNow()]);
  // Whether to call the chart "live" and keep refreshing it. The intraday feed
  // still returns the last session after hours, which is worth showing but is
  // not live — labelling a frozen chart LIVE would be the app lying quietly.
  const marketOpen = isLikelyMarketOpen(new Date(now));

  if (!share) notFound();

  const upcoming = share.events.filter((event) => event.upcoming);
  const past = share.events.filter((event) => !event.upcoming).slice(-3).reverse();

  const stats = [
    { label: "Prev close", value: formatInr(share.previousClose) },
    // Only while there is a session behind it: a VWAP with no volume to weight
    // is yesterday's number wearing today's label.
    ...(share.sessionVwap != null
      ? [
          {
            label: "VWAP",
            value:
              share.lastPrice != null
                ? `${formatInr(share.sessionVwap)} (${formatPercent(((share.lastPrice - share.sessionVwap) / share.sessionVwap) * 100, 1)})`
                : formatInr(share.sessionVwap),
          },
        ]
      : []),
    { label: "Day range", value: share.dayLow != null && share.dayHigh != null ? `${formatInr(share.dayLow)} – ${formatInr(share.dayHigh)}` : "—" },
    { label: "52-week", value: share.week52Low != null && share.week52High != null ? `${formatInr(share.week52Low)} – ${formatInr(share.week52High)}` : "—" },
    {
      label: "Vol vs 20d",
      value:
        share.volume != null && share.avgVolume20d
          ? `${(share.volume / share.avgVolume20d).toFixed(1)}×`
          : formatCompact(share.volume),
    },
  ];

  return (
    <LiveSessionProvider symbol={share.symbol} enabled={marketOpen && share.intraday.length > 0}>
    <PageShell>
      <Link
        href="/sectors"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Sectors
      </Link>

      <PageHeader
        eyebrow={share.isin ?? "NSE"}
        title={share.name}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{share.symbol}</Badge>
            {share.sectors.map((sector) => (
              <Link key={sector.key} href={`/sectors/${sector.key}`}>
                <Badge className="hover:border-primary/40">{sector.displayName}</Badge>
              </Link>
            ))}
            {share.inWatchlist ? (
              <Badge variant="event">
                <Star className="size-2.5 fill-current" aria-hidden /> WATCHING
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <LivePrice
            initialPrice={share.lastPrice}
            initialChange={share.dayChange}
            initialChangePercent={share.dayChangePercent}
            initialAsOf={share.liveAsOf}
            source={share.quoteSource}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="px-3 py-2.5">
            <p className="text-muted-foreground font-mono text-[9.5px] tracking-[0.11em] uppercase">
              {stat.label}
            </p>
            <p className="tabular mt-1 font-mono text-sm font-semibold">{stat.value}</p>
            {stat.label === "Day range" ? (
              <DayRangeBar low={share.dayLow} high={share.dayHigh} last={share.lastPrice} className="mt-1.5" />
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-4">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-muted-foreground flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Candles
              {share.intraday.length > 0 && marketOpen ? (
                <span className="text-up flex items-center gap-1 normal-case">
                  <span className="bg-up size-1.5 animate-pulse rounded-full" aria-hidden />
                  LIVE
                </span>
              ) : null}
            </h2>
            <div className="flex items-center gap-3">
              <ChartSettings />
              <span className="text-muted-foreground font-mono text-[10px]">
                {share.intraday.length > 0
                  ? `${share.intraday.length} × 5-min${share.liveAsOf ? ` · ${share.liveAsOf}` : ""}`
                  : `${share.candles.length} bars`}
                {share.taAt ? ` · indicators ${relativeTime(share.taAt, new Date(now))}` : ""}
              </span>
            </div>
          </div>
          <LiveChart
            candles={share.candles}
            intraday={share.intraday}
            points={share.intradayPoints}
            initialLastPrice={share.lastPrice}
            levels={share.chartLevels}
          />
        </Card>


        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Read-out
            </h2>
            <SignalList signals={share.signals} />
          </Card>

          <Card className="p-4">
            <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Timeframes
            </h2>
            <TimeframePanel confluence={share.confluence} volatility={share.volatility} />
          </Card>

          <ReactionPanel
            reaction={share.reaction}
            symbol={share.symbol}
            support={nearest(share.levels?.supports, share.lastPrice, "SUPPORT")}
            resistance={nearest(share.levels?.resistances, share.lastPrice, "RESISTANCE")}
          />
        </div>
      </div>

      {share.intradayPoints.length > 0 ? (
        <Card className="mt-3 p-4">
          <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
            Live grid
          </h2>
          <IntradayGrid
            symbol={share.symbol}
            initialPoints={share.intradayPoints}
            initialLastPrice={share.lastPrice}
            levels={share.chartLevels}
          />
        </Card>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
            Calendar
          </h2>
          {upcoming.length === 0 && past.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing scheduled that NSE has published.</p>
          ) : (
            <ul className="flex flex-col">
              {[...upcoming, ...past].map((event, index) => (
                <li
                  key={`${event.eventDate}-${index}`}
                  className="flex items-baseline gap-3 border-b py-2 text-sm last:border-0"
                >
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10.5px] font-semibold",
                      event.upcoming ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {event.eventDate}
                  </span>
                  <span className={cn(event.upcoming ? "text-foreground" : "text-muted-foreground")}>
                    {event.description}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
            News · 7 days
          </h2>
          <NewsList news={share.news} now={now} />
        </Card>
      </div>
    </PageShell>
    </LiveSessionProvider>
  );
}
