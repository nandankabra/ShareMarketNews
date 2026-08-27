import { z } from "zod";

import type { CorporateEventType } from "@/lib/db/enums";
import { parseNseDate } from "@/lib/date/ist";

import { ProviderError } from "../errors";

import { classifyEvent } from "./classify-event";

const rowSchema = z.object({
  symbol: z.string(),
  comp: z.string().optional(),
  subject: z.string().optional(),
  exDate: z.string().optional(),
  recDate: z.string().optional(),
  isin: z.string().optional(),
});

export type CorporateAction = {
  symbol: string;
  company: string | null;
  type: CorporateEventType;
  eventDate: string;
  recordDate: string | null;
  description: string;
  raw: string;
};

export function parseCorporateActions(body: string): CorporateAction[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_CORPORATE_ACTIONS",
      message: "corporate actions was not JSON",
      detail: body.slice(0, 160),
    });
  }

  if (!Array.isArray(json)) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_CORPORATE_ACTIONS",
      message: "corporate actions was not an array",
    });
  }

  const out: CorporateAction[] = [];
  for (const entry of json) {
    const parsed = rowSchema.safeParse(entry);
    if (!parsed.success) continue;

    // The ex-date is the one that matters to a holder — it is the day the
    // entitlement stops travelling with the share.
    const eventDate = parseNseDate(parsed.data.exDate);
    if (!eventDate) continue;

    out.push({
      symbol: parsed.data.symbol.trim().toUpperCase(),
      company: parsed.data.comp?.trim() ?? null,
      type: classifyEvent(parsed.data.subject),
      eventDate,
      recordDate: parseNseDate(parsed.data.recDate),
      description: parsed.data.subject?.trim() || "Corporate action",
      raw: JSON.stringify(entry),
    });
  }

  return out;
}
