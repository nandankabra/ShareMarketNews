/**
 * Build the Google News search for a company.
 *
 * The name is trimmed of its corporate suffix on purpose. Searching the full
 * registered name — "Tata Consultancy Services Ltd." — returns almost nothing,
 * because no headline writes it that way. Trimming to "Tata Consultancy
 * Services" is the difference between four stories and zero.
 */
const SUFFIXES =
  /\s+(limited|ltd\.?|private|pvt\.?|corporation|corp\.?|company|co\.?|industries|india)\b\.?$/i;

export function companySearchTerm(name: string): string {
  let term = name.trim();
  // Applied twice: "Sun Pharmaceutical Industries Limited" needs both off.
  for (let i = 0; i < 2; i++) term = term.replace(SUFFIXES, "").trim();
  return term || name.trim();
}

export type NewsWindow = "1d" | "2d" | "7d" | "30d";

export function buildNewsUrl(companyName: string, window: NewsWindow = "7d"): string {
  const term = companySearchTerm(companyName);
  const query = `"${term}" when:${window}`;
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-IN&gl=IN&ceid=IN:en"
  );
}
