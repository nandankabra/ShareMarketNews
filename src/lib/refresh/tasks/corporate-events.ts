import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { fetchCorporateActions, fetchEventCalendar } from "@/lib/providers/nse";

import { runTask, type RunOutcome } from "../run-task";

type IncomingEvent = {
  symbol: string;
  type: string;
  source: "NSE_EVENT_CALENDAR" | "NSE_CORPORATE_ACTIONS";
  eventDate: string;
  recordDate?: string | null;
  description: string;
  raw: string;
};

function dedupKey(event: IncomingEvent): string {
  return createHash("sha1")
    .update(`${event.source}|${event.symbol}|${event.eventDate}|${event.description}`)
    .digest("hex");
}

async function persist(events: IncomingEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  // Resolve symbols to shares in one query. Events for symbols we do not track
  // are kept anyway — a newly listed company then appears on the briefing the
  // moment its Share row is created.
  const symbols = [...new Set(events.map((event) => event.symbol))];
  const shares = await prisma.share.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true },
  });
  const shareBySymbol = new Map(shares.map((share) => [share.symbol, share.id]));

  let written = 0;
  for (const event of events) {
    const key = dedupKey(event);
    await prisma.corporateEvent.upsert({
      where: { dedupKey: key },
      update: {
        shareId: shareBySymbol.get(event.symbol) ?? null,
        recordDate: event.recordDate ?? null,
      },
      create: {
        dedupKey: key,
        symbol: event.symbol,
        shareId: shareBySymbol.get(event.symbol) ?? null,
        type: event.type,
        source: event.source,
        eventDate: event.eventDate,
        recordDate: event.recordDate ?? null,
        description: event.description,
        raw: event.raw,
      },
    });
    written++;
  }

  return written;
}

export async function refreshCorporateEvents(
  options: { ignoreBackoff?: boolean } = {},
): Promise<{ calendar: RunOutcome; actions: RunOutcome }> {
  const calendar = await runTask(
    "NSE_EVENT_CALENDAR",
    async () => {
      const events = await fetchEventCalendar();
      const written = await persist(
        events.map((event) => ({
          symbol: event.symbol,
          type: event.type,
          source: "NSE_EVENT_CALENDAR" as const,
          eventDate: event.eventDate,
          description: event.description,
          raw: event.raw,
        })),
      );
      return { itemCount: written };
    },
    options,
  );

  const actions = await runTask(
    "NSE_CORPORATE_ACTIONS",
    async () => {
      const rows = await fetchCorporateActions();
      const written = await persist(
        rows.map((row) => ({
          symbol: row.symbol,
          type: row.type,
          source: "NSE_CORPORATE_ACTIONS" as const,
          eventDate: row.eventDate,
          recordDate: row.recordDate,
          description: row.description,
          raw: row.raw,
        })),
      );
      return { itemCount: written };
    },
    options,
  );

  return { calendar, actions };
}
