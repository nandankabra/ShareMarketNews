import { istToday } from "@/lib/date/ist";
import { prisma } from "@/lib/prisma";
import { fetchMarketStatus } from "@/lib/providers/nse";

import { runTask, type RunOutcome } from "../run-task";

export async function refreshMarketStatus(options: { ignoreBackoff?: boolean } = {}): Promise<RunOutcome> {
  return runTask(
    "NSE_MARKET_STATUS",
    async () => {
      const status = await fetchMarketStatus();
      const tradeDate = istToday();

      await prisma.marketSnapshot.upsert({
        where: { tradeDate },
        update: {
          status: status.status,
          niftyLevel: status.niftyLevel,
          niftyChangePercent: status.niftyChangePercent,
          capturedAt: new Date(),
        },
        create: {
          tradeDate,
          status: status.status,
          niftyLevel: status.niftyLevel,
          niftyChangePercent: status.niftyChangePercent,
        },
      });

      return { itemCount: 1, note: `${status.status} · NIFTY ${status.niftyLevel ?? "?"}` };
    },
    options,
  );
}
