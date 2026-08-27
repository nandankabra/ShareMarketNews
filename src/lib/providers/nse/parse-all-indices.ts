import { z } from "zod";

import { ProviderError } from "../errors";

const schema = z.object({
  data: z.array(
    z.object({
      index: z.string(),
      last: z.number().optional(),
      percentChange: z.number().optional(),
    }),
  ),
});

export type IndexLevel = { index: string; last: number | null; percentChange: number | null };

export function parseAllIndices(body: string): IndexLevel[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_ALL_INDICES",
      message: "allIndices was not JSON",
      detail: body.slice(0, 160),
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_ALL_INDICES",
      message: "allIndices shape changed",
    });
  }

  return parsed.data.data.map((row) => ({
    index: row.index.trim(),
    last: row.last ?? null,
    percentChange: row.percentChange ?? null,
  }));
}
