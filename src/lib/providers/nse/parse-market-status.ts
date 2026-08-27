import { z } from "zod";

import { ProviderError } from "../errors";

/**
 * Only the Capital Market row carries real numbers. The currency, commodity
 * and debt rows ship `""` where a number would go, and one row has no `market`
 * key at all — so every field here is permissive and the numerics are coerced
 * from either a number or a string. A strict schema fails the whole payload
 * over rows we never read.
 */
const loose = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  });

const schema = z.object({
  marketState: z.array(
    z.object({
      market: z.string().optional(),
      marketStatus: z.string().optional(),
      tradeDate: z.string().optional(),
      index: z.string().optional(),
      last: loose,
      percentChange: loose,
    }),
  ),
});

export type MarketStatus = {
  isOpen: boolean;
  status: string;
  tradeDate: string | null;
  niftyLevel: number | null;
  niftyChangePercent: number | null;
};

export function parseMarketStatus(body: string): MarketStatus {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_MARKET_STATUS",
      message: "market status was not JSON",
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_MARKET_STATUS",
      message: `market status shape changed: ${parsed.error.issues[0]?.path.join(".")}`,
    });
  }

  // "Capital Market" is the equity segment; the payload also carries currency,
  // commodity and debt rows whose status says nothing about share trading.
  const capital =
    parsed.data.marketState.find((row) => row.market === "Capital Market") ??
    parsed.data.marketState[0];

  return {
    isOpen: (capital?.marketStatus ?? "").toLowerCase() === "open",
    status: capital?.marketStatus ?? "Unknown",
    tradeDate: capital?.tradeDate ?? null,
    niftyLevel: capital?.last ?? null,
    niftyChangePercent: capital?.percentChange ?? null,
  };
}
