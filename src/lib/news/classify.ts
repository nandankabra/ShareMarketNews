import type { NewsCategory, NewsPolarity } from "@/lib/db/enums";

/**
 * Headline classification by keyword rule.
 *
 * A rule, not a model: deterministic, instant, free, and testable — and every
 * decision can be justified on screen, because the terms that fired are kept
 * and shown. A tag nobody can interrogate is worse than no tag.
 *
 * The rules are ordered. A headline saying "Q1 profit beats estimates" is both
 * RESULTS and positive; a headline saying "wins order after clearing probe" is
 * both an order win and a legal story. First match wins, so the more specific
 * and more consequential categories sit higher.
 */

type CategoryRule = { category: NewsCategory; terms: RegExp[] };

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: "RESULTS",
    terms: [/\bq[1-4]\b.*\b(result|profit|revenue|earning)/i, /quarterly (result|earning|profit)/i, /\b(net profit|pat|ebitda|topline|bottomline)\b/i, /\bresults?\b.*\b(beat|miss|estimate)/i],
  },
  {
    category: "ORDER_WIN",
    terms: [/\b(bags?|wins?|secures?|awarded)\b.*\b(order|contract|deal|mandate|tender|project)/i, /\border (win|book|inflow)/i, /\bl1 bidder\b/i],
  },
  {
    category: "MERGER_DEAL",
    terms: [/\b(acquire|acquisition|merger|merges?|takeover|stake (buy|sale|purchase)|divest|demerger)\b/i, /\bto buy\b.*\bstake\b/i],
  },
  {
    category: "RATING",
    terms: [/\b(upgrade[sd]?|downgrade[sd]?|target price|price target|initiat(e|es|ed) coverage|reiterate[sd]?)\b/i, /\b(buy|sell|hold|outperform|underperform|overweight|underweight)\b.*\b(rating|call)\b/i, /\bbrokerage\b/i],
  },
  {
    category: "REGULATORY",
    terms: [/\b(sebi|rbi|cci|trai|irdai|ministry|government|cabinet|regulator|approval|licen[cs]e|tariff|duty|gst)\b/i],
  },
  {
    category: "LEGAL",
    terms: [/\b(probe|investigation|raid|lawsuit|sues?|penalty|fine[ds]?|notice|tribunal|nclt|insolvency|fraud|verdict|court)\b/i],
  },
  {
    category: "MANAGEMENT",
    terms: [/\b(ceo|cfo|managing director|chairman|resign|steps? down|appoints?|elevat(e|es|ed)|succession)\b/i],
  },
  {
    category: "DIVIDEND_ACTION",
    terms: [/\b(dividend|bonus issue|stock split|buyback|buy-back|record date|ex-date)\b/i],
  },
  {
    category: "FUNDRAISE",
    terms: [/\b(qip|fpo|ipo|rights issue|raises?\b.*\b(fund|crore|billion)|debenture|ncd|fund ?rais)/i],
  },
  {
    category: "PRODUCT",
    terms: [/\b(launch(es|ed)?|unveil(s|ed)?|new plant|capacity expansion|commission(s|ed)?|foray|enters?\b.*\bsegment)/i],
  },
  {
    category: "MACRO_SECTOR",
    terms: [/\b(sensex|nifty|market[s]? (fall|rise|close|open)|rupee|crude|fed|inflation|sector|index)\b/i],
  },
];

/**
 * Verb inflections are spelled out rather than left to a stem, because the
 * gap they leave is invisible: "approved" matching while "approves" does not
 * produces a NEUTRAL tag on a plainly positive headline, and nothing about the
 * output looks wrong.
 */
const POSITIVE_TERMS: readonly RegExp[] = [
  /\bbags?\b/i, /\bwins?\b/i, /\bsecures?\b/i, /\bbeats?\b/i, /\bsurges?\b/i, /\bjumps?\b/i,
  /\brall(y|ies|ied)\b/i, /\bgains?\b/i, /\bris(e|es|ing)\b/i, /\bupgrad(e|es|ed)\b/i,
  /\bapprov(e|es|ed|al|als)\b/i, /\bclears?\b/i, /\brecord (high|profit)\b/i,
  /\bexpansion\b/i, /\bexpands?\b/i, /\bstrong\b/i, /\boutperform(s|ed)?\b/i,
  /\bhikes? (target|guidance)\b/i, /\bprofit (rises?|up|doubles?|jumps?)\b/i,
  /\blaunch(es|ed)?\b/i, /\bdouble[sd]?\b/i,
];

const NEGATIVE_TERMS: readonly RegExp[] = [
  /\bprobe[sd]?\b/i, /\bdowngrad(e|es|ed)\b/i, /\brecalls?\b/i, /\bresign(s|ed)?\b/i,
  /\bsteps? down\b/i, /\bpenalt(y|ies)\b/i, /\bfine[sd]?\b/i, /\bslumps?\b/i,
  /\bfalls?\b/i, /\bdrags?\b/i, /\bdeclin(e|es|ed)\b/i, /\bslides?\b/i,
  /\bcuts? (target|guidance|outlook|stake)\b/i, /\bmiss(es|ed)?\b/i, /\bweak(er|ness)?\b/i,
  /\bloss(es)?\b/i, /\bdown ?grade\b/i, /\blawsuits?\b/i, /\bfraud\b/i, /\bhalts?\b/i,
  /\bdelay(s|ed)?\b/i, /\bunderperform(s|ed)?\b/i, /\bworr(y|ies)\b/i, /\bconcerns?\b/i,
  /\bplunges?\b/i, /\bsinks?\b/i, /\bcrash(es|ed)?\b/i,
];

export type Classification = {
  category: NewsCategory;
  polarity: NewsPolarity;
  /** 0-1. Low confidence renders as OTHER rather than a guess. */
  confidence: number;
  /** The terms that fired, so the UI can justify the tag. */
  matchedTerms: string[];
};

function matchedSources(text: string, patterns: readonly RegExp[]): string[] {
  const hits: string[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) hits.push(match[0].toLowerCase().trim());
  }
  return hits;
}

export function classifyHeadline(title: string): Classification {
  const text = title.trim();
  if (!text) {
    return { category: "OTHER", polarity: "NEUTRAL", confidence: 0, matchedTerms: [] };
  }

  let category: NewsCategory = "OTHER";
  let categoryHits: string[] = [];

  for (const rule of CATEGORY_RULES) {
    const hits = matchedSources(text, rule.terms);
    if (hits.length > 0) {
      category = rule.category;
      categoryHits = hits;
      break;
    }
  }

  const positives = matchedSources(text, POSITIVE_TERMS);
  const negatives = matchedSources(text, NEGATIVE_TERMS);

  let polarity: NewsPolarity = "NEUTRAL";
  if (positives.length > negatives.length) polarity = "POSITIVE";
  else if (negatives.length > positives.length) polarity = "NEGATIVE";

  // Confidence is about how much evidence fired, not how sure we feel. One
  // weak match on a generic word is not a classification.
  const signals = categoryHits.length + positives.length + negatives.length;
  const confidence = Math.min(signals / 3, 1);

  if (category !== "OTHER" && categoryHits.length === 0) category = "OTHER";

  return {
    category,
    polarity,
    confidence: Number(confidence.toFixed(2)),
    matchedTerms: [...new Set([...categoryHits, ...positives, ...negatives])].slice(0, 8),
  };
}

/** Human label for a category, used on chips. */
export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  RESULTS: "Results",
  ORDER_WIN: "Order win",
  MERGER_DEAL: "Deal",
  RATING: "Rating",
  REGULATORY: "Regulatory",
  MANAGEMENT: "Management",
  DIVIDEND_ACTION: "Dividend",
  FUNDRAISE: "Fundraise",
  LEGAL: "Legal",
  PRODUCT: "Product",
  MACRO_SECTOR: "Macro",
  OTHER: "General",
};
