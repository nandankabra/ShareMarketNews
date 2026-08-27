import { env } from "@/env";
import { parseNseDate } from "@/lib/date/ist";
import { analyseChain } from "@/lib/options/analytics";
import { prisma } from "@/lib/prisma";
import { ProviderError } from "@/lib/providers/errors";
import { fetchOptionChain, fetchOptionExpiries } from "@/lib/providers/nse";

import { runTask, type RunOutcome } from "../run-task";

/**
 * Capture the option chain for each tracked underlying.
 *
 * One snapshot row carries the derived analytics — PCR, max pain, ATM, the
 * OI-implied support and resistance — computed at capture time so no page ever
 * recomputes them. The per-strike rows hang off it.
 *
 * Everything stored here is descriptive: what is open, where it is
 * concentrated, and how it moved. Nothing in this path produces a buy or sell
 * instruction.
 */
export async function refreshOptionChains(
  options: { ignoreBackoff?: boolean } = {},
): Promise<RunOutcome> {
  return runTask(
    "NSE_OPTION_CHAIN",
    async (context) => {
      const underlyings = await prisma.optionUnderlying.findMany({
        where: { symbol: { in: env.OPTION_UNDERLYINGS } },
      });

      let captured = 0;
      const notes: string[] = [];

      for (const underlying of underlyings) {
        if (context.expired()) break;

        const expiryLabels = await fetchOptionExpiries(underlying.symbol);
        const wanted = expiryLabels.slice(0, env.OPTION_EXPIRY_DEPTH);

        for (const label of wanted) {
          if (context.expired()) break;

          const dayKey = parseNseDate(label);
          if (!dayKey) continue;

          try {
            const chain = await fetchOptionChain(underlying.symbol, label, dayKey);
            const analytics = analyseChain(chain);
            const capturedAt = new Date();

            const snapshot = await prisma.optionChainSnapshot.create({
              data: {
                underlyingId: underlying.id,
                expiryDate: dayKey,
                capturedAt,
                underlyingValue: analytics.underlyingValue,
                totalCeOi: analytics.totalCeOi,
                totalPeOi: analytics.totalPeOi,
                totalCeVolume: analytics.totalCeVolume,
                totalPeVolume: analytics.totalPeVolume,
                pcrOi: analytics.pcrOi,
                pcrVolume: analytics.pcrVolume,
                maxPainStrike: analytics.maxPainStrike,
                atmStrike: analytics.atmStrike,
                atmIv: analytics.atmIv,
                oiResistance: analytics.oiResistance,
                oiSupport: analytics.oiSupport,
              },
            });

            await prisma.optionStrike.createMany({
              data: analytics.rows.map((row) => ({
                snapshotId: snapshot.id,
                strikePrice: row.strikePrice,
                ceOi: row.ce?.oi ?? null,
                ceOiChange: row.ce?.oiChange ?? null,
                ceVolume: row.ce?.volume ?? null,
                ceIv: row.ce?.iv ?? null,
                ceLtp: row.ce?.ltp ?? null,
                ceChange: row.ce?.change ?? null,
                peOi: row.pe?.oi ?? null,
                peOiChange: row.pe?.oiChange ?? null,
                peVolume: row.pe?.volume ?? null,
                peIv: row.pe?.iv ?? null,
                peLtp: row.pe?.ltp ?? null,
                peChange: row.pe?.change ?? null,
                ceBuildup: row.ceBuildup,
                peBuildup: row.peBuildup,
              })),
            });

            captured++;
            notes.push(
              `${underlying.symbol} ${dayKey} · PCR ${analytics.pcrOi.toFixed(2)} · maxpain ${analytics.maxPainStrike}`,
            );
          } catch (error) {
            // A missing far expiry should not lose the near one we just got.
            if (!(error instanceof ProviderError)) throw error;
          }
        }
      }

      if (captured === 0) {
        throw new ProviderError({
          kind: "NOT_FOUND",
          source: "NSE_OPTION_CHAIN",
          message: "no chains captured for any tracked underlying",
        });
      }

      return { itemCount: captured, note: notes.join(" · ") };
    },
    options,
  );
}

/** Chains are captured often; keep a fortnight for OI-change comparisons. */
export async function pruneOptionChains(): Promise<number> {
  const cutoff = new Date(Date.now() - env.OPTION_RETENTION_DAYS * 86_400_000);
  const result = await prisma.optionChainSnapshot.deleteMany({
    where: { capturedAt: { lt: cutoff } },
  });
  return result.count;
}
