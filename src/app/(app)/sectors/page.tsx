import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { StaleBanner } from "@/components/market/stale-banner";
import { SectorCard } from "@/components/sectors/sector-card";
import { EmptyState } from "@/components/states";
import { serverNow } from "@/lib/server-now";
import { getMarketHeader } from "@/lib/services/market/queries";
import { listSectors } from "@/lib/services/sectors/queries";

export const metadata: Metadata = { title: "Sectors" };

// Always read fresh from the database; the poller writes underneath us.
export const dynamic = "force-dynamic";

export default async function SectorsPage() {
  // One instant for the whole render, so every relative time on the page agrees.
  const [sectors, header, now] = await Promise.all([listSectors(), getMarketHeader(), serverNow()]);

  const quoted = sectors.filter((sector) => sector.lastLevel != null).length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Every sector, every share"
        title="Sectors"
        description={
          <>
            {sectors.length} NSE indices ·{" "}
            {sectors.reduce((total, sector) => total + sector.memberCount, 0)} constituents tracked
            {quoted < sectors.length ? ` · ${sectors.length - quoted} awaiting a level` : ""}
          </>
        }
      />

      <StaleBanner lastSuccessAt={header.quotesLastSuccessAt} now={now} />

      {sectors.length === 0 ? (
        <EmptyState
          title="No sectors yet"
          description="Run npm run db:seed, then npx tsx scripts/backfill-universe.ts to populate the universe."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sectors.map((sector) => (
            <SectorCard key={sector.key} sector={sector} now={now} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
