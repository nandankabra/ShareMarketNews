import { prisma } from "@/lib/prisma";
import { fetchScripMaster } from "@/lib/providers/bse";

import { runTask, type RunOutcome } from "../run-task";

/**
 * Resolve BSE scrip codes for the shares we track, joined on ISIN.
 *
 * One request covers all five thousand listed equities, so this is cheap and
 * runs daily. Shares without an ISIN — anything added by symbol search rather
 * than from a constituents file — simply go unmatched and keep using Yahoo
 * alone, which is the correct outcome rather than a guess.
 */
export async function refreshBseCodes(options: { ignoreBackoff?: boolean } = {}): Promise<RunOutcome> {
  return runTask(
    "BSE_QUOTES",
    async () => {
      const entries = await fetchScripMaster();
      const byIsin = new Map(entries.map((entry) => [entry.isin, entry.scripCode]));

      const shares = await prisma.share.findMany({
        where: { isin: { not: null }, bseScripCode: null },
        select: { id: true, isin: true },
      });

      let matched = 0;
      for (const share of shares) {
        const code = byIsin.get((share.isin ?? "").toUpperCase());
        if (!code) continue;
        await prisma.share.update({ where: { id: share.id }, data: { bseScripCode: code } });
        matched++;
      }

      const total = await prisma.share.count({ where: { bseScripCode: { not: null } } });
      return {
        itemCount: matched,
        note: `${entries.length} listed on BSE · ${total} of ours now mapped`,
      };
    },
    options,
  );
}
