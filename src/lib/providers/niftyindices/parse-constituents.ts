import { ProviderError } from "../errors";

/**
 * The header every valid constituents file starts with. This check is the
 * authoritative one: niftyindices.com answers a wrong filename with HTTP 200
 * and an HTML page, so "did it 404" tells us nothing and "does it start with
 * the header we expect" tells us everything.
 */
const EXPECTED_HEADER = ["company name", "industry", "symbol", "series", "isin code"];

export type Constituent = {
  symbol: string;
  name: string;
  industry: string | null;
  series: string | null;
  isin: string | null;
};

/** Split one CSV line, honouring double-quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  out.push(field);
  return out.map((value) => value.trim());
}

export function parseConstituents(body: string, file: string): Constituent[] {
  // Strip a BOM — these files are served with one often enough to matter.
  const text = body.replace(/^﻿/, "").trim();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const header = lines[0] ? splitCsvLine(lines[0]).map((h) => h.toLowerCase()) : [];
  const headerMatches = EXPECTED_HEADER.every((expected, index) => header[index] === expected);

  if (!headerMatches) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NIFTY_CONSTITUENTS",
      message: `${file} is not a constituents CSV — likely a renamed or removed file`,
      detail: text.slice(0, 160),
    });
  }

  const out: Constituent[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const symbol = cells[2]?.toUpperCase();
    if (!symbol) continue;

    out.push({
      symbol,
      name: cells[0] || symbol,
      industry: cells[1] || null,
      series: cells[3] || null,
      isin: cells[4] || null,
    });
  }

  if (out.length === 0) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "NIFTY_CONSTITUENTS",
      message: `${file} had a valid header but no rows`,
    });
  }

  return out;
}
