import { describe, expect, it } from "vitest";

import { ProviderError } from "@/lib/providers/errors";
import { parseIndexHistory } from "@/lib/providers/nse/parse-index-history";

/** A row in the shape NSE actually returns, newest-first as it sends them. */
function row(over: Record<string, unknown> = {}) {
  return {
    EOD_INDEX_NAME: "NIFTY 50",
    EOD_TIMESTAMP: "02-SEP-2026",
    EOD_OPEN_INDEX_VAL: 23858,
    EOD_HIGH_INDEX_VAL: 23914.45,
    EOD_LOW_INDEX_VAL: 23786.8,
    EOD_CLOSE_INDEX_VAL: 23914.45,
    HIT_TURN_OVER: 25868.81,
    HIT_TRADED_QTY: 318881826,
    ...over,
  };
}

const body = (rows: unknown[]) => JSON.stringify({ data: rows });

describe("parseIndexHistory", () => {
  it("reads the EOD_ fields into bars", () => {
    const bars = parseIndexHistory(body([row()]), "NIFTY 50");

    expect(bars).toEqual([
      {
        day: "2026-09-02",
        open: 23858,
        high: 23914.45,
        low: 23786.8,
        close: 23914.45,
        previousClose: null,
        volume: 318881826,
      },
    ]);
  });

  it("parses the shouted month NSE sends here", () => {
    // Every other NSE date is "02-Sep-2026"; this endpoint sends "02-SEP-2026".
    const bars = parseIndexHistory(body([row({ EOD_TIMESTAMP: "31-AUG-2026" })]), "NIFTY 50");
    expect(bars[0].day).toBe("2026-08-31");
  });

  it("sorts oldest first, whatever order NSE sends", () => {
    const bars = parseIndexHistory(
      body([
        row({ EOD_TIMESTAMP: "02-SEP-2026" }),
        row({ EOD_TIMESTAMP: "01-SEP-2026" }),
        row({ EOD_TIMESTAMP: "31-AUG-2026" }),
      ]),
      "NIFTY 50",
    );

    expect(bars.map((b) => b.day)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("skips a malformed row rather than losing the series", () => {
    const bars = parseIndexHistory(
      body([row(), { EOD_INDEX_NAME: "NIFTY 50" }, row({ EOD_TIMESTAMP: "01-SEP-2026" })]),
      "NIFTY 50",
    );

    expect(bars).toHaveLength(2);
  });

  it("rejects HTML, which is how these upstreams fail with a 200", () => {
    expect(() => parseIndexHistory("<!doctype html><html>bot check", "NIFTY 50")).toThrow(
      ProviderError,
    );
  });

  it("rejects a body that is not JSON, and one with no data array", () => {
    expect(() => parseIndexHistory("not json at all", "NIFTY 50")).toThrow(ProviderError);
    expect(() => parseIndexHistory(JSON.stringify({ nope: 1 }), "NIFTY 50")).toThrow(ProviderError);
  });

  it("treats an empty series as not found", () => {
    // An index name the endpoint does not know answers 200 with no rows, which
    // must not read as a chart with nothing on it.
    expect(() => parseIndexHistory(body([]), "NIFTY 50")).toThrow(ProviderError);
  });
});
