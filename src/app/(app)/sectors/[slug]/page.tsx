import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { ChangePill } from "@/components/market/change-pill";
import { StaleBanner } from "@/components/market/stale-banner";
import { ConstituentsTable } from "@/components/sectors/constituents-table";
import { EmptyState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { serverNow } from "@/lib/server-now";
import { getMarketHeader } from "@/lib/services/market/queries";
import { getSectorDetail, markSectorViewed } from "@/lib/services/sectors/queries";
import { formatInr, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sector = await getSectorDetail(slug);
  return { title: sector?.displayName ?? "Sector" };
}

export default async function SectorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // One instant for the whole render, so every relative time on the page agrees.
  const [sector, header, now] = await Promise.all([getSectorDetail(slug), getMarketHeader(), serverNow()]);

  if (!sector) notFound();

  // Looking at a sector is the signal that its prices are worth keeping fresh
  // for the next couple of hours. Deliberately not awaited — the page should
  // not wait on a write it does not read.
  void markSectorViewed(sector.rows.map((row) => row.id));

  const withQuotes = sector.rows.filter((row) => row.lastPrice != null).length;

  return (
    <PageShell>
      <Link
        href="/sectors"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All sectors
      </Link>

      <PageHeader
        eyebrow={sector.name}
        title={sector.displayName}
        description={
          <>
            {sector.rows.length} constituents
            {sector.constituentsSyncedAt
              ? ` · synced ${relativeTime(sector.constituentsSyncedAt, new Date(now))}`
              : " · never synced"}
            {withQuotes < sector.rows.length ? ` · ${withQuotes} quoted` : ""}
          </>
        }
        actions={
          sector.lastLevel != null ? (
            <Card className="flex items-baseline gap-2 px-3 py-2">
              <span className="tabular font-mono text-lg font-semibold">
                {formatInr(sector.lastLevel)}
              </span>
              <ChangePill percent={sector.lastChangePercent} size="sm" />
            </Card>
          ) : null
        }
      />

      <StaleBanner lastSuccessAt={header.quotesLastSuccessAt} now={now} />

      {sector.rows.length === 0 ? (
        <EmptyState
          title="No constituents synced"
          description="This sector has no verified constituents file, or the last sync failed. Check /health."
        />
      ) : (
        <Card className="overflow-hidden">
          <ConstituentsTable rows={sector.rows} now={now} />
        </Card>
      )}
    </PageShell>
  );
}
