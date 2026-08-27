import { z } from "zod";

import { ProviderError } from "../errors";

/**
 * BSE's list of active equities.
 *
 * Its value here is the ISIN. Matching NSE symbols to BSE scrip codes by name
 * or ticker is guesswork — the two exchanges disagree on both — whereas an ISIN
 * identifies a security globally and unambiguously, and the constituent files
 * already give us one for every share we track.
 */
const rowSchema = z.object({
  SCRIP_CD: z.union([z.string(), z.number()]),
  Scrip_Name: z.string().optional(),
  ISIN_NUMBER: z.string().optional(),
  scrip_id: z.string().optional(),
  Status: z.string().optional(),
});

export type ScripEntry = { scripCode: string; isin: string; name: string | null; scripId: string | null };

export function parseScripMaster(body: string): ScripEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "BSE_QUOTES",
      message: "scrip master was not JSON",
      detail: body.slice(0, 160),
    });
  }

  if (!Array.isArray(json)) {
    throw new ProviderError({ kind: "SHAPE", source: "BSE_QUOTES", message: "scrip master was not an array" });
  }

  const out: ScripEntry[] = [];
  for (const entry of json) {
    const parsed = rowSchema.safeParse(entry);
    if (!parsed.success) continue;

    const isin = parsed.data.ISIN_NUMBER?.trim().toUpperCase();
    if (!isin || isin.length !== 12) continue;
    if (parsed.data.Status && parsed.data.Status.toLowerCase() !== "active") continue;

    out.push({
      scripCode: String(parsed.data.SCRIP_CD).trim(),
      isin,
      name: parsed.data.Scrip_Name?.trim() ?? null,
      scripId: parsed.data.scrip_id?.trim().toUpperCase() ?? null,
    });
  }

  if (out.length === 0) {
    throw new ProviderError({ kind: "SHAPE", source: "BSE_QUOTES", message: "scrip master carried no usable rows" });
  }

  return out;
}
