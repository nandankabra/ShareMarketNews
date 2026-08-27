import { politeFetch } from "../http";

import { parseChart, type Quote } from "./parse-chart";
import { parseSearch, type SearchHit } from "./parse-search";
import { encodeYahooSymbol } from "./symbol";

export type ChartRange = "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y";
export type ChartInterval = "1d" | "1h" | "5m";

export async function fetchChart(
  yahooSymbol: string,
  range: ChartRange = "5d",
  interval: ChartInterval = "1d",
): Promise<Quote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}` +
    `?range=${range}&interval=${interval}&events=div%2Csplit`;

  const response = await politeFetch(url, { source: "YAHOO_QUOTES" });
  return parseChart(response.text, yahooSymbol);
}

export async function searchShares(query: string, count = 10): Promise<SearchHit[]> {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(query) +
    `&quotesCount=${count}&newsCount=0`;

  const response = await politeFetch(url, { source: "YAHOO_SEARCH" });
  return parseSearch(response.text);
}
