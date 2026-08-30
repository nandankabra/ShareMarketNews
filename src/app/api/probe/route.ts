import { NextResponse } from "next/server";

import { fetchBseQuote } from "@/lib/providers/bse";
import { fetchNews } from "@/lib/providers/googlenews";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import {
  fetchAllIndices,
  fetchEventCalendar,
  fetchMarketStatus,
  fetchOptionExpiries,
} from "@/lib/providers/nse";
import { fetchChart } from "@/lib/providers/yahoo";

/**
 * Which upstreams answer from *this* host.
 *
 * The hosting plan rests on a claim that was never actually measured from the
 * deployment: that NSE refuses cloud datacenters while Yahoo and Google News
 * tolerate them. Everything about the no-database design depends on which half
 * of that is true, so this route settles it with evidence instead of inheriting
 * an assumption — run it once from the deployed host and read the table.
 *
 * Sequential on purpose. Concurrency here would be both impolite and useless:
 * the answer per source does not depend on the others.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = {
  source: string;
  host: string;
  ok: boolean;
  ms: number;
  detail: string;
};

async function probe(source: string, host: string, run: () => Promise<string>): Promise<Row> {
  const started = Date.now();
  try {
    const detail = await run();
    return { source, host, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind =
      typeof error === "object" && error !== null && "kind" in error
        ? String((error as { kind: unknown }).kind)
        : "ERROR";
    return { source, host, ok: false, ms: Date.now() - started, detail: `${kind}: ${message}` };
  }
}

export async function GET() {
  const rows: Row[] = [];

  rows.push(
    await probe("YAHOO_CHART", "query1.finance.yahoo.com", async () => {
      const quote = await fetchChart("TCS.NS", "5d", "1d");
      return `${quote.bars.length} bars, last ${quote.lastPrice ?? "?"}`;
    }),
  );

  rows.push(
    await probe("GOOGLE_NEWS", "news.google.com", async () => {
      const items = await fetchNews("Tata Consultancy Services", "2d");
      return `${items.length} items${items[0] ? `, newest: ${items[0].title.slice(0, 60)}` : ""}`;
    }),
  );

  rows.push(
    await probe("NSE_MARKET_STATUS", "www.nseindia.com", async () => {
      const status = await fetchMarketStatus();
      return `${status.status}${status.niftyLevel ? ` NIFTY ${status.niftyLevel}` : ""}`;
    }),
  );

  rows.push(
    await probe("NSE_ALL_INDICES", "www.nseindia.com", async () => {
      const indices = await fetchAllIndices();
      return `${indices.length} indices`;
    }),
  );

  rows.push(
    await probe("NSE_EVENT_CALENDAR", "www.nseindia.com", async () => {
      const events = await fetchEventCalendar();
      return `${events.length} events`;
    }),
  );

  rows.push(
    await probe("NSE_OPTION_CHAIN", "www.nseindia.com", async () => {
      const expiries = await fetchOptionExpiries("NIFTY");
      return `${expiries.length} expiries${expiries[0] ? `, next ${expiries[0]}` : ""}`;
    }),
  );

  rows.push(
    await probe("NIFTY_CONSTITUENTS", "niftyindices.com", async () => {
      const list = await fetchConstituents("ind_niftyitlist");
      return `${list.length} constituents`;
    }),
  );

  rows.push(
    await probe("BSE_QUOTE", "api.bseindia.com", async () => {
      // 532540 = TCS on BSE.
      const quote = await fetchBseQuote("532540");
      return `TCS ${quote.lastPrice ?? "?"}`;
    }),
  );

  const summary = {
    region: process.env.VERCEL_REGION ?? "local",
    at: new Date().toISOString(),
    working: rows.filter((row) => row.ok).map((row) => row.source),
    failing: rows.filter((row) => !row.ok).map((row) => row.source),
    rows,
  };

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
