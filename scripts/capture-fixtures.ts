/**
 * Refresh the saved upstream payloads the parser tests run against.
 *
 *   npx tsx scripts/capture-fixtures.ts
 *
 * Fixtures are real responses, captured live and committed. Testing parsers
 * against saved bodies rather than hand-written objects is what catches a shape
 * change upstream — a synthetic fixture only ever proves the parser agrees with
 * whoever wrote it.
 *
 * Run this when a parser test starts failing for reasons that look like the
 * upstream changed, and read the diff before committing: that diff IS the
 * change, and it is the most useful thing you will see all day.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseNseDate } from "@/lib/date/ist";
import { politeFetch } from "@/lib/providers/http";
import { nseApiFetch } from "@/lib/providers/nse/session";
import { fetchOptionExpiries } from "@/lib/providers/nse";

const OUT = path.resolve("tests/fixtures/providers");

const LIVE_MARKET = "https://www.nseindia.com/market-data/live-equity-market";
const EVENT_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-event-calendar";
const ACTIONS_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-actions";
const OPTION_PAGE = "https://www.nseindia.com/option-chain";

function save(name: string, body: string): void {
  writeFileSync(path.join(OUT, name), body, "utf8");
  console.log(`  ✓ ${name.padEnd(34)} ${(body.length / 1024).toFixed(1)}kb`);
}

async function capture(name: string, run: () => Promise<string>): Promise<void> {
  try {
    save(name, await run());
  } catch (error) {
    console.log(`  ✗ ${name.padEnd(34)} ${error instanceof Error ? error.message.slice(0, 70) : error}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.log(`\nCapturing into ${OUT}\n`);

  await capture("nse-market-status.json", () =>
    nseApiFetch("api/marketStatus", { source: "NSE_MARKET_STATUS", referer: LIVE_MARKET }),
  );
  await capture("nse-all-indices.json", () =>
    nseApiFetch("api/allIndices", { source: "NSE_ALL_INDICES", referer: LIVE_MARKET }),
  );
  await capture("nse-event-calendar.json", () =>
    nseApiFetch("api/event-calendar", { source: "NSE_EVENT_CALENDAR", referer: EVENT_PAGE }),
  );
  await capture("nse-corporate-actions.json", () =>
    nseApiFetch("api/corporates-corporateActions?index=equities", {
      source: "NSE_CORPORATE_ACTIONS",
      referer: ACTIONS_PAGE,
    }),
  );

  await capture("nse-option-chain-nifty.json", async () => {
    const expiries = await fetchOptionExpiries("NIFTY");
    const label = expiries[0];
    if (!label || !parseNseDate(label)) throw new Error("no expiries listed");
    console.log(`     (expiry ${label} — update the date in the option chain tests)`);
    return nseApiFetch(
      `api/option-chain-v3?type=Indices&symbol=NIFTY&expiry=${encodeURIComponent(label)}`,
      { source: "NSE_OPTION_CHAIN", referer: OPTION_PAGE },
    );
  });

  await capture("nifty-it-constituents.csv", async () => {
    const response = await politeFetch("https://www.niftyindices.com/IndexConstituent/ind_niftyitlist.csv", {
      source: "NIFTY_CONSTITUENTS",
      accept: "text/csv,*/*",
    });
    return response.text;
  });

  // The most important fixture here: a wrong filename answers 200 with a full
  // web page, which is the failure mode the CSV parser exists to catch.
  await capture("nifty-error-page.html", async () => {
    const response = await politeFetch(
      "https://www.niftyindices.com/IndexConstituent/ind_niftyprivatebanklist.csv",
      { source: "NIFTY_CONSTITUENTS", accept: "text/csv,*/*" },
    );
    return response.text;
  });

  await capture("yahoo-chart-reliance.json", async () => {
    const response = await politeFetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=5d&interval=1d",
      { source: "YAHOO_QUOTES" },
    );
    return response.text;
  });

  await capture("yahoo-search-tata.json", async () => {
    const response = await politeFetch(
      "https://query1.finance.yahoo.com/v1/finance/search?q=tata&quotesCount=5&newsCount=0",
      { source: "YAHOO_SEARCH" },
    );
    return response.text;
  });

  await capture("google-news-reliance.xml", async () => {
    const response = await politeFetch(
      "https://news.google.com/rss/search?q=" +
        encodeURIComponent('"Reliance Industries" when:7d') +
        "&hl=en-IN&gl=IN&ceid=IN:en",
      { source: "GOOGLE_NEWS", accept: "application/rss+xml,*/*" },
    );
    return response.text;
  });

  console.log("\nReview `git diff tests/fixtures` before committing.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
