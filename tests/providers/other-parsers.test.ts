import { describe, expect, it } from "vitest";

import { normaliseTitle, parseNewsRss, titleWithoutSource } from "@/lib/providers/googlenews/parse-rss";
import { buildNewsUrl, companySearchTerm } from "@/lib/providers/googlenews/query";
import { parseConstituents, splitCsvLine } from "@/lib/providers/niftyindices/parse-constituents";
import { parseChart } from "@/lib/providers/yahoo/parse-chart";
import { parseSearch } from "@/lib/providers/yahoo/parse-search";
import { encodeYahooSymbol, toYahooSymbol } from "@/lib/providers/yahoo/symbol";

import { fixture } from "../helpers/fixtures";

describe("parseConstituents", () => {
  it("parses a real index file", () => {
    const rows = parseConstituents(fixture("nifty-it-constituents.csv"), "ind_niftyitlist");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.some((row) => row.symbol === "INFY")).toBe(true);
    expect(rows.every((row) => row.symbol === row.symbol.toUpperCase())).toBe(true);
  });

  it("rejects the HTML page a wrong filename returns", () => {
    // The single most important test here. niftyindices answers an unknown
    // stem with HTTP 200 and a full web page, so status codes cannot catch
    // this and only the header check can.
    expect(() =>
      parseConstituents(fixture("nifty-error-page.html"), "ind_niftyprivatebanklist"),
    ).toThrowError(/not a constituents CSV/);
  });

  it("rejects a header with no rows behind it", () => {
    expect(() =>
      parseConstituents("Company Name,Industry,Symbol,Series,ISIN Code\n", "empty"),
    ).toThrowError(/no rows/);
  });

  it("keeps quoted commas inside one field", () => {
    expect(splitCsvLine('"Bajaj Holdings, Ltd.",Financial,BAJAJHLDNG,EQ,INE118A01012')).toEqual([
      "Bajaj Holdings, Ltd.",
      "Financial",
      "BAJAJHLDNG",
      "EQ",
      "INE118A01012",
    ]);
  });
});

describe("google news", () => {
  it("parses a real feed", () => {
    const items = parseNewsRss(fixture("google-news-reliance.xml"));
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.publishedAt.getTime()).not.toBeNaN();
    }
  });

  it("strips the publisher suffix Google appends", () => {
    expect(titleWithoutSource("TCS wins a large deal - Economic Times")).toBe("TCS wins a large deal");
  });

  it("dedupes the same story found under two company searches", () => {
    // One article about crude comes back for both RELIANCE and ONGC. Without
    // the title normalisation it lands as two rows and double-counts as two
    // separate news events.
    const a = normaliseTitle("Crude slips as OPEC holds output - Reuters");
    const b = normaliseTitle("Crude slips as OPEC holds output - Mint");
    expect(a).toBe(b);
  });

  it("rejects a non-RSS body", () => {
    expect(() => parseNewsRss("{\"not\":\"rss\"}")).toThrowError(/not RSS/);
  });

  it("handles a feed carrying exactly one item", () => {
    const single = `<?xml version="1.0"?><rss version="2.0"><channel><item>
      <title>Only story - Mint</title><link>https://example.com/a</link>
      <pubDate>Wed, 26 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseNewsRss(single)).toHaveLength(1);
  });

  it("trims the corporate suffix so the search actually matches headlines", () => {
    // "Tata Consultancy Services Ltd." returns almost nothing; no headline
    // writes the registered name.
    expect(companySearchTerm("Tata Consultancy Services Ltd.")).toBe("Tata Consultancy Services");
    expect(companySearchTerm("Sun Pharmaceutical Industries Limited")).toBe("Sun Pharmaceutical");
    expect(companySearchTerm("Infosys")).toBe("Infosys");
  });

  it("asks for a full week by default", () => {
    expect(buildNewsUrl("Infosys")).toContain(encodeURIComponent("when:7d"));
  });
});

describe("yahoo", () => {
  it("parses a real chart payload", () => {
    const quote = parseChart(fixture("yahoo-chart-reliance.json"), "RELIANCE.NS");
    expect(quote.symbol).toBe("RELIANCE.NS");
    expect(quote.currency).toBe("INR");
    expect(quote.lastPrice).toBeGreaterThan(0);
    expect(quote.week52High).toBeGreaterThan(quote.week52Low!);
  });

  it("reports an unlisted symbol as NOT_FOUND rather than a shape error", () => {
    const body = JSON.stringify({
      chart: { result: null, error: { code: "Not Found", description: "No data found" } },
    });
    expect(() => parseChart(body, "NOPE.NS")).toThrowError(/does not list/);
  });

  it("drops padded holiday bars instead of carrying them forward", () => {
    const body = JSON.stringify({
      chart: {
        result: [
          {
            meta: { symbol: "X.NS" },
            timestamp: [1, 2, 3],
            indicators: {
              quote: [{ open: [1, null, 3], high: [1, null, 3], low: [1, null, 3], close: [1, null, 3], volume: [1, null, 3] }],
            },
          },
        ],
        error: null,
      },
    });
    expect(parseChart(body, "X.NS").bars).toHaveLength(2);
  });

  it("keeps only NSE equities from a search", () => {
    const hits = parseSearch(fixture("yahoo-search-tata.json"));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.yahooSymbol.endsWith(".NS"))).toBe(true);
    expect(hits.every((hit) => hit.nseSymbol === hit.nseSymbol.toUpperCase())).toBe(true);
  });

  it("encodes an ampersand symbol exactly once", () => {
    // %26 becoming %2526 yields a silent NOT_FOUND — the reason yahooSymbol is
    // stored rather than rebuilt at each call site.
    expect(toYahooSymbol("M&M")).toBe("M&M.NS");
    expect(encodeYahooSymbol("M&M.NS")).toBe("M%26M.NS");
  });
});
