import { createHash } from "node:crypto";

import { XMLParser } from "fast-xml-parser";

import { ProviderError } from "../errors";

export type NewsItem = {
  dedupKey: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: Date;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

/**
 * Google appends " - Publisher" to every headline. Left in place, the same
 * story syndicated by two outlets dedupes as two rows, and the classifier reads
 * the publisher name as part of the headline.
 */
export function normaliseTitle(title: string): string {
  return title
    .replace(/\s+-\s+[^-]{2,40}$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleWithoutSource(title: string): string {
  return title.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text": unknown })["#text"];
    return typeof text === "string" ? text : null;
  }
  return null;
}

export function parseNewsRss(body: string): NewsItem[] {
  if (!body.slice(0, 400).includes("<rss")) {
    throw new ProviderError({
      kind: "SHAPE",
      source: "GOOGLE_NEWS",
      message: "news feed was not RSS",
      detail: body.slice(0, 160),
    });
  }

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(body) as Record<string, unknown>;
  } catch {
    throw new ProviderError({
      kind: "SHAPE",
      source: "GOOGLE_NEWS",
      message: "news feed would not parse as XML",
    });
  }

  const channel = (doc.rss as { channel?: { item?: unknown } } | undefined)?.channel;
  if (!channel) return [];

  const raw = channel.item;
  // A feed with exactly one story parses to an object, not an array.
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: NewsItem[] = [];
  for (const entry of items) {
    const item = entry as Record<string, unknown>;
    const rawTitle = asText(item.title);
    const link = asText(item.link);
    if (!rawTitle || !link) continue;

    const pubDate = asText(item.pubDate);
    const published = pubDate ? new Date(pubDate) : null;
    if (!published || Number.isNaN(published.getTime())) continue;

    // Prefer the feed's own guid — it is stable per article across queries.
    // Falling back to a hash of the normalised title is what makes the same
    // story, found under two different company searches, dedupe to one row.
    const guid = asText(item.guid);
    const dedupKey =
      guid && guid.length > 8
        ? guid
        : createHash("sha1").update(normaliseTitle(rawTitle)).digest("hex");

    out.push({
      dedupKey,
      title: titleWithoutSource(rawTitle),
      url: link,
      source: asText(item.source) ?? null,
      publishedAt: published,
    });
  }

  return out;
}
