import { politeFetch } from "../http";

import { parseNewsRss, type NewsItem } from "./parse-rss";
import { buildNewsUrl, type NewsWindow } from "./query";

export async function fetchNews(companyName: string, window: NewsWindow = "7d"): Promise<NewsItem[]> {
  const url = buildNewsUrl(companyName, window);
  const response = await politeFetch(url, {
    source: "GOOGLE_NEWS",
    accept: "application/rss+xml,application/xml,text/xml,*/*",
  });
  return parseNewsRss(response.text);
}

export { buildNewsUrl };
export type { NewsWindow, NewsItem };
