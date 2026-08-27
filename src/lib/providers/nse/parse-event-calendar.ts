import { z } from "zod";

import type { CorporateEventType } from "@/lib/db/enums";
import { parseNseDate } from "@/lib/date/ist";

import { ProviderError } from "../errors";

import { classifyEvent } from "./classify-event";

const rowSchema = z.object({
  symbol: z.string(),
  company: z.string().optional(),
  purpose: z.string().optional(),
  bm_desc: z.string().optional(),
  date: z.string(),
});

export type UpcomingEvent = {
  symbol: string;
  company: string | null;
  type: CorporateEventType;
  eventDate: string;
  description: string;
  raw: string;
};

export function parseEventCalendar(body: string): UpcomingEvent[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_EVENT_CALENDAR",
      message: "event calendar was not JSON",
      detail: body.slice(0, 160),
    });
  }

  if (!Array.isArray(json)) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NSE_EVENT_CALENDAR",
      message: "event calendar was not an array",
    });
  }

  const out: UpcomingEvent[] = [];
  for (const entry of json) {
    const parsed = rowSchema.safeParse(entry);
    if (!parsed.success) continue; // one malformed row must not fail 200 good ones

    const eventDate = parseNseDate(parsed.data.date);
    if (!eventDate) continue;

    const description = parsed.data.bm_desc?.trim() || parsed.data.purpose?.trim() || "Board meeting";

    out.push({
      symbol: parsed.data.symbol.trim().toUpperCase(),
      company: parsed.data.company?.trim() ?? null,
      type: classifyEvent(parsed.data.purpose, parsed.data.bm_desc),
      eventDate,
      description,
      raw: JSON.stringify(entry),
    });
  }

  return out;
}
