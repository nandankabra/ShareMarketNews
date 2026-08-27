import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { StaleBanner } from "@/components/market/stale-banner";
import { EmptyState } from "@/components/states";
import { AddShare } from "@/components/watchlist/add-share";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { Card } from "@/components/ui/card";
import { serverNow } from "@/lib/server-now";
import { getMarketHeader } from "@/lib/services/market/queries";
import { listWatchlist } from "@/lib/services/watchlist/queries";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const [rows, header, now] = await Promise.all([listWatchlist(), getMarketHeader(), serverNow()]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="The shares you put here yourself"
        title="Watchlist"
        description={
          rows.length === 0
            ? "Nothing tracked yet."
            : `${rows.length} tracked · refreshed every 5 minutes while the market is open`
        }
        actions={<AddShare />}
      />

      <StaleBanner lastSuccessAt={header.quotesLastSuccessAt} now={now} />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing on your watchlist"
          description="Search above by company name or NSE symbol. Whatever you add is refreshed first, and its movement is measured from the price it was at when you added it — not from yesterday's close."
        />
      ) : (
        <Card className="overflow-hidden">
          <WatchlistTable rows={rows} now={now} />
        </Card>
      )}
    </PageShell>
  );
}
