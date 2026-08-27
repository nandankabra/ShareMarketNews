/**
 * Live provider health check.
 *
 *   npx tsx scripts/smoke-providers.ts
 *
 * Hits every upstream once, sequentially, through the real politeness layer,
 * and prints a table. It touches no database — this is the "is the internet
 * still shaped the way we think it is" check, and the first thing to run when
 * the app looks wrong. Exits non-zero if any source fails.
 */
import "dotenv/config";

import { istToday, parseNseDate } from "@/lib/date/ist";
import { fetchNews } from "@/lib/providers/googlenews";
import {
  fetchAllIndices,
  fetchCorporateActions,
  fetchEventCalendar,
  fetchMarketStatus,
  fetchOptionChain,
  fetchOptionExpiries,
} from "@/lib/providers/nse";
import { fetchConstituents } from "@/lib/providers/niftyindices";
import { fetchChart, searchShares } from "@/lib/providers/yahoo";
import { analyseChain, mostTraded } from "@/lib/options/analytics";
import { SECTOR_CATALOGUE } from "@/lib/sectors/catalogue";

type Row = { source: string; status: "OK" | "PARTIAL" | "FAIL"; ms: number; items: string; detail: string };

const rows: Row[] = [];

async function check(
  source: string,
  run: () => Promise<{ items: string; detail: string; partial?: boolean }>,
): Promise<void> {
  const started = Date.now();
  try {
    const result = await run();
    rows.push({
      source,
      status: result.partial ? "PARTIAL" : "OK",
      ms: Date.now() - started,
      items: result.items,
      detail: result.detail,
    });
  } catch (error) {
    rows.push({
      source,
      status: "FAIL",
      ms: Date.now() - started,
      items: "-",
      detail: error instanceof Error ? error.message.slice(0, 90) : String(error),
    });
  }
}

const inr = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

async function main(): Promise<void> {
  await check("NSE_MARKET_STATUS", async () => {
    const status = await fetchMarketStatus();
    return {
      items: "1",
      detail: `${status.status} · NIFTY 50 ${status.niftyLevel ? inr(status.niftyLevel) : "?"}`,
    };
  });

  await check("NSE_ALL_INDICES", async () => {
    const indices = await fetchAllIndices();
    const known = new Set(SECTOR_CATALOGUE.map((sector) => sector.name));
    const matched = indices.filter((index) => known.has(index.index)).length;
    return {
      items: String(indices.length),
      detail: `${matched}/${SECTOR_CATALOGUE.length} catalogue indices matched`,
    };
  });

  await check("NSE_EVENT_CALENDAR", async () => {
    const events = await fetchEventCalendar();
    const next = events.slice().sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
    return {
      items: String(events.length),
      detail: next ? `next: ${next.symbol} ${next.eventDate} (${next.type})` : "none listed",
    };
  });

  await check("NSE_CORPORATE_ACTIONS", async () => {
    const actions = await fetchCorporateActions();
    const next = actions.slice().sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
    return {
      items: String(actions.length),
      detail: next ? `next ex-date: ${next.symbol} ${next.eventDate}` : "none listed",
    };
  });

  await check("NSE_OPTION_CHAIN", async () => {
    const expiries = await fetchOptionExpiries("NIFTY");
    const label = expiries[0];
    const dayKey = parseNseDate(label);
    if (!label || !dayKey) throw new Error("no expiries listed for NIFTY");

    const chain = await fetchOptionChain("NIFTY", label, dayKey);
    const analytics = analyseChain(chain);
    const top = mostTraded(analytics, 1)[0];

    return {
      items: String(chain.rows.length),
      detail:
        `${label} · spot ${inr(analytics.underlyingValue)} · ATM ${analytics.atmStrike} · ` +
        `PCR(OI) ${analytics.pcrOi.toFixed(2)} · maxpain ${analytics.maxPainStrike}` +
        (top ? ` · busiest ${top.strikePrice}${top.side}` : ""),
    };
  });

  await check("NIFTY_CONSTITUENTS", async () => {
    const withFiles = SECTOR_CATALOGUE.filter((sector) => sector.constituentsFile);
    let ok = 0;
    const failed: string[] = [];

    for (const sector of withFiles) {
      try {
        const list = await fetchConstituents(sector.constituentsFile!);
        if (list.length > 0) ok++;
      } catch {
        failed.push(sector.constituentsFile!);
      }
    }

    return {
      items: `${ok}/${withFiles.length}`,
      detail: failed.length ? `FAIL ${failed.join(", ")}` : "all files valid",
      partial: failed.length > 0,
    };
  });

  await check("YAHOO_QUOTES", async () => {
    const quote = await fetchChart("RELIANCE.NS", "1mo", "1d");
    const change =
      quote.lastPrice && quote.previousClose
        ? ((quote.lastPrice - quote.previousClose) / quote.previousClose) * 100
        : null;
    return {
      items: `${quote.bars.length} bars`,
      detail: `${quote.symbol} ₹${quote.lastPrice ? inr(quote.lastPrice) : "?"}${change != null ? ` ${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : ""}`,
    };
  });

  await check("YAHOO_SEARCH", async () => {
    const hits = await searchShares("tata");
    return {
      items: String(hits.length),
      detail: hits[0] ? `${hits[0].yahooSymbol} · ${hits[0].sector ?? "no sector"}` : "no NSE hits",
    };
  });

  await check("GOOGLE_NEWS", async () => {
    // A full week, which is the retention the brief asks for.
    const items = await fetchNews("Reliance Industries Limited", "7d");
    const newest = items[0];
    const ageHours = newest ? (Date.now() - newest.publishedAt.getTime()) / 3_600_000 : null;
    return {
      items: String(items.length),
      detail: newest ? `newest ${ageHours!.toFixed(1)}h ago · ${newest.title.slice(0, 46)}` : "no stories",
    };
  });

  const pad = (value: string, width: number) => value.padEnd(width);
  console.log("");
  console.log(
    pad("SOURCE", 23) + pad("STATUS", 9) + pad("MS", 8) + pad("ITEMS", 12) + "DETAIL",
  );
  console.log("─".repeat(112));
  for (const row of rows) {
    console.log(
      pad(row.source, 23) +
        pad(row.status, 9) +
        pad(String(row.ms), 8) +
        pad(row.items, 12) +
        row.detail,
    );
  }
  console.log("");
  console.log(`IST day key: ${istToday()}`);

  const failed = rows.filter((row) => row.status === "FAIL");
  if (failed.length) {
    console.error(`\n${failed.length} source(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
