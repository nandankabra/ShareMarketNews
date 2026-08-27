import { prisma } from "@/lib/prisma";
import { fetchAllIndices } from "@/lib/providers/nse";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import { ProviderError } from "@/lib/providers/errors";
import { toYahooSymbol } from "@/lib/providers/yahoo/symbol";

import { runTask, type RunOutcome } from "../run-task";

/**
 * Sync each sector's constituents from the official index files.
 *
 * The important property: a failed fetch never removes anything. Memberships
 * are stamped with lastSeenAt on success and pruned only after seven days of
 * absence, so one bad morning cannot empty Nifty IT — while a genuine index
 * reconstitution still lands within the week.
 */
export async function refreshSectorConstituents(
  options: { ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  return runTask(
    "NIFTY_CONSTITUENTS",
    async (context) => {
      const sectors = await prisma.sector.findMany({
        where: { constituentsFile: { not: null } },
        orderBy: { sortIndex: "asc" },
      });

      let shares = 0;
      const failed: string[] = [];

      for (const sector of sectors) {
        if (context.expired()) break;

        try {
          const constituents = await fetchConstituents(sector.constituentsFile!);

          for (const row of constituents) {
            const share = await prisma.share.upsert({
              where: { symbol: row.symbol },
              update: {
                name: row.name,
                isin: row.isin ?? undefined,
                series: row.series ?? undefined,
                industry: row.industry ?? undefined,
              },
              create: {
                symbol: row.symbol,
                yahooSymbol: toYahooSymbol(row.symbol),
                name: row.name,
                isin: row.isin,
                series: row.series,
                industry: row.industry,
              },
            });

            await prisma.sectorMembership.upsert({
              where: { sectorId_shareId: { sectorId: sector.id, shareId: share.id } },
              update: { lastSeenAt: new Date() },
              create: {
                sectorId: sector.id,
                shareId: share.id,
                source: "INDEX_CSV",
                lastSeenAt: new Date(),
              },
            });

            shares++;
          }

          await prisma.sector.update({
            where: { id: sector.id },
            data: { constituentsSyncedAt: new Date() },
          });
        } catch (error) {
          failed.push(sector.constituentsFile!);
          // One dead file must not abandon the other fifteen sectors.
          if (!(error instanceof ProviderError)) throw error;
        }
      }

      if (failed.length === sectors.length) {
        throw new ProviderError({
          kind: "SHAPE",
          source: "NIFTY_CONSTITUENTS",
          message: "every constituents file failed",
        });
      }

      return {
        itemCount: shares,
        note: failed.length ? `${failed.length} file(s) failed: ${failed.join(", ")}` : "all files valid",
      };
    },
    options,
  );
}

/** Index levels for the sector grid. One request covers all of them. */
export async function refreshSectorLevels(
  options: { ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  return runTask(
    "NSE_ALL_INDICES",
    async () => {
      const indices = await fetchAllIndices();
      const byName = new Map(indices.map((index) => [index.index, index]));

      const sectors = await prisma.sector.findMany();
      let updated = 0;

      for (const sector of sectors) {
        const match = byName.get(sector.name);
        if (!match) continue;

        await prisma.sector.update({
          where: { id: sector.id },
          data: {
            lastLevel: match.last,
            lastChangePercent: match.percentChange,
            levelAt: new Date(),
          },
        });
        updated++;
      }

      return { itemCount: updated, note: `${updated}/${sectors.length} sectors levelled` };
    },
    options,
  );
}
