import "dotenv/config";

import { SourceKey } from "@/lib/db/enums";
import { prisma } from "@/lib/prisma";
import { SECTOR_CATALOGUE } from "@/lib/sectors/catalogue";

/**
 * Idempotent seed.
 *
 * Establishes only the reference data that cannot be discovered: the sector
 * catalogue, the option underlyings to track, and one bookkeeping row per
 * upstream. Everything else — shares, prices, news, events, chains — arrives
 * from the poller, because seeding it would mean inventing market data.
 */
async function main(): Promise<void> {
  for (const sector of SECTOR_CATALOGUE) {
    await prisma.sector.upsert({
      where: { key: sector.key },
      update: {
        name: sector.name,
        displayName: sector.displayName,
        constituentsFile: sector.constituentsFile,
        sortIndex: sector.sortIndex,
      },
      create: {
        key: sector.key,
        name: sector.name,
        displayName: sector.displayName,
        constituentsFile: sector.constituentsFile,
        sortIndex: sector.sortIndex,
      },
    });
  }
  console.log(`sectors:   ${SECTOR_CATALOGUE.length}`);

  const underlyings = [
    { symbol: "NIFTY", kind: "INDEX", displayName: "Nifty 50", lotSize: 75 },
    { symbol: "BANKNIFTY", kind: "INDEX", displayName: "Nifty Bank", lotSize: 35 },
  ];

  for (const underlying of underlyings) {
    await prisma.optionUnderlying.upsert({
      where: { symbol: underlying.symbol },
      update: { displayName: underlying.displayName, lotSize: underlying.lotSize },
      create: underlying,
    });
  }
  console.log(`underlyings: ${underlyings.length}`);

  // One bookkeeping row per source, so /health lists every upstream from the
  // first render rather than growing rows as each one happens to run.
  for (const source of SourceKey.values) {
    await prisma.sourceFetch.upsert({
      where: { source },
      update: {},
      create: { source },
    });
  }
  console.log(`sources:   ${SourceKey.values.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
