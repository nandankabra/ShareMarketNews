import "server-only";

import { fetchBseIntraday, fetchScripMaster } from "@/lib/providers/bse";
import { fetchNews } from "@/lib/providers/googlenews";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import {
  fetchAllIndices,
  fetchEventCalendar,
  fetchHistorical,
  fetchMarketStatus,
  fetchOptionExpiries,
} from "@/lib/providers/nse";

import { liveSource } from "./cache";

/**
 * Ask every upstream one question and report what came back.
 *
 * This is the first thing to run when the app looks wrong, because it
 * separates "an upstream changed" from "we broke it" — and it is not
 * hypothetical: running it from the deployment is how the hosting plan's
 * central claim, that NSE blocks datacenters, turned out to be false.
 *
 * Sequential, and cached for five minutes. Concurrency would be impolite and
 * would tell us nothing extra, and an uncached version would mean every
 * refresh of the health page is a fresh burst at eight hosts.
 */
export type ProbeRow = {
  source: string;
  label: string;
  host: string;
  ok: boolean;
  ms: number;
  itemCount: number | null;
  detail: string;
};

async function probe(
  source: string,
  label: string,
  host: string,
  run: () => Promise<{ count: number | null; detail: string }>,
): Promise<ProbeRow> {
  const started = Date.now();
  try {
    const result = await run();
    return { source, label, host, ok: true, ms: Date.now() - started, itemCount: result.count, detail: result.detail };
  } catch (error) {
    const kind =
      typeof error === "object" && error !== null && "kind" in error
        ? String((error as { kind: unknown }).kind)
        : "ERROR";
    const message = error instanceof Error ? error.message : String(error);
    return { source, label, host, ok: false, ms: Date.now() - started, itemCount: null, detail: `${kind}: ${message}` };
  }
}

export const liveHealthProbe = liveSource(
  "health-probe",
  async () => {
    const rows: ProbeRow[] = [];

    rows.push(
      await probe("NSE_MARKET_STATUS", "Market open/closed", "nseindia.com", async () => {
        const status = await fetchMarketStatus();
        return { count: 1, detail: `${status.status}${status.niftyLevel ? ` · NIFTY ${status.niftyLevel}` : ""}` };
      }),
    );

    rows.push(
      await probe("NSE_ALL_INDICES", "Sector index levels", "nseindia.com", async () => {
        const indices = await fetchAllIndices();
        return { count: indices.length, detail: `${indices.length} indices` };
      }),
    );

    rows.push(
      await probe("NSE_HISTORICAL", "Daily bars & indicators", "nseindia.com", async () => {
        const bars = await fetchHistorical("TCS", 120);
        return { count: bars.length, detail: `${bars.length} bars to ${bars.at(-1)?.day}` };
      }),
    );

    rows.push(
      await probe("NSE_EVENT_CALENDAR", "Board meetings", "nseindia.com", async () => {
        const events = await fetchEventCalendar();
        return { count: events.length, detail: `${events.length} upcoming` };
      }),
    );

    rows.push(
      await probe("NSE_OPTION_CHAIN", "Nifty option chain", "nseindia.com", async () => {
        const expiries = await fetchOptionExpiries("NIFTY");
        return { count: expiries.length, detail: `${expiries.length} expiries, next ${expiries[0] ?? "?"}` };
      }),
    );

    rows.push(
      await probe("NIFTY_CONSTITUENTS", "Sector constituents", "niftyindices.com", async () => {
        const list = await fetchConstituents("ind_niftyitlist");
        return { count: list.length, detail: `${list.length} in NIFTY IT` };
      }),
    );

    rows.push(
      await probe("GOOGLE_NEWS", "Company news", "news.google.com", async () => {
        const items = await fetchNews("Tata Consultancy Services", "2d");
        return { count: items.length, detail: `${items.length} items` };
      }),
    );

    rows.push(
      await probe("BSE_INTRADAY", "Live prices & intraday chart", "bseindia.com", async () => {
        // 532540 = TCS. The only intraday source that answers: NSE's
        // quote-equity returns 403 to non-browser clients and its
        // chart-databyindex returns an empty series even mid-session.
        const session = await fetchBseIntraday("532540");
        return {
          count: session.points.length,
          detail: `${session.points.length} pts, last ${session.lastPrice ?? "?"} at ${session.asOf ?? "?"}`,
        };
      }),
    );

    rows.push(
      await probe("BSE_DIRECTORY", "Share directory & search", "bseindia.com", async () => {
        const entries = await fetchScripMaster();
        return { count: entries.length, detail: `${entries.length} listed companies` };
      }),
    );

    return { rows, at: Date.now() };
  },
  300,
);
