import { companySearchTerm } from "@/lib/providers/googlenews/query";

/**
 * Is this headline actually about this company?
 *
 * Google News does not return a short feed when a query has few real matches —
 * it pads. A search for "Whirlpool of India" came back with "Where was The
 * Odyssey filmed?", "Video: Humid feel, showers possible Sunday" and "Prize cow
 * creates 'dream' year for Cork exhibitor duo". Quoting the phrase in the query
 * does not prevent it, so the feed has to be filtered on the way in.
 *
 * The test is deliberately simple and errs toward dropping: a headline must
 * name the company or its ticker somewhere. A relevant story lost is a story
 * that shows up in the next sweep; an irrelevant one kept pollutes the news
 * counts that the notice rule scores on.
 */

/** Words too common to identify a company on their own. */
const GENERIC = new Set([
  "india", "indian", "bharat", "limited", "ltd", "corporation", "corp", "company",
  "industries", "industry", "enterprises", "group", "holdings", "international",
  "national", "power", "finance", "financial", "services", "bank", "steel", "motors",
  "energy", "technologies", "technology", "systems", "solutions", "products", "and",
  "of", "the", "new", "first", "global", "auto", "cement", "chemicals", "pharma",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole-word containment, so "BEL" does not match "rebel". */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack);
}

export type RelevanceResult = { relevant: boolean; reason: string };

export function headlineRelevance(
  title: string,
  companyName: string,
  symbol: string,
): RelevanceResult {
  const haystack = normalise(title);
  if (!haystack) return { relevant: false, reason: "empty title" };

  const normalisedSymbol = normalise(symbol);
  if (normalisedSymbol.length >= 3 && containsWord(haystack, normalisedSymbol)) {
    return { relevant: true, reason: `ticker ${symbol}` };
  }

  const term = normalise(companySearchTerm(companyName));
  const tokens = term.split(" ").filter(Boolean);
  if (tokens.length === 0) return { relevant: false, reason: "no usable company name" };

  // The full trimmed name, e.g. "power finance corporation".
  if (haystack.includes(term)) return { relevant: true, reason: `name "${term}"` };

  // The leading pair, which is where the brand almost always lives:
  // "Power Finance Corporation Ltd." -> "power finance".
  if (tokens.length >= 2) {
    const pair = `${tokens[0]} ${tokens[1]}`;
    if (haystack.includes(pair)) return { relevant: true, reason: `name "${pair}"` };
  }

  // A single distinctive word is enough on its own — "Whirlpool", "Infosys".
  // A single generic word is not: "Power" would match half the market.
  const head = tokens[0];
  if (tokens.length === 1 || !GENERIC.has(head)) {
    if (head.length >= 4 && !GENERIC.has(head) && containsWord(haystack, head)) {
      return { relevant: true, reason: `name "${head}"` };
    }
  }

  return { relevant: false, reason: "company not named in the headline" };
}

export function isRelevantHeadline(title: string, companyName: string, symbol: string): boolean {
  return headlineRelevance(title, companyName, symbol).relevant;
}
