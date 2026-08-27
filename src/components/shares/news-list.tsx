import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ShareDetail } from "@/lib/services/shares/queries";
import { relativeTime } from "@/lib/utils";

const FRESH_MS = 30 * 60_000;

export function NewsList({ news, now }: { news: ShareDetail["news"]; now: number }) {
  if (news.length === 0) {
    return <p className="text-muted-foreground text-sm">No coverage found in the last week.</p>;
  }

  return (
    <ul className="flex flex-col">
      {news.map((item) => {
        // "New" means new to you — first seen by the sweep, not published date.
        // A story from this morning that we only just found should still blink.
        const fresh = now - item.firstSeenAt.getTime() < FRESH_MS;

        return (
          <li key={item.id} className="border-b py-2.5 last:border-0">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2 text-sm leading-snug"
            >
              {fresh ? (
                <span className="bg-primary text-primary-foreground mt-0.5 shrink-0 rounded px-1 py-px font-mono text-[8.5px] font-bold tracking-[0.1em]">
                  NEW
                </span>
              ) : null}
              <span className="group-hover:text-primary">{item.title}</span>
              <ExternalLink className="text-muted-foreground/50 mt-0.5 size-3 shrink-0" aria-hidden />
            </a>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={
                  item.polarity === "POSITIVE" ? "up" : item.polarity === "NEGATIVE" ? "down" : "default"
                }
                title={item.matchedTerms ? `Matched: ${item.matchedTerms}` : undefined}
              >
                {item.categoryLabel}
                {item.polarity === "POSITIVE" ? " ▲" : item.polarity === "NEGATIVE" ? " ▼" : ""}
              </Badge>
              <span className="text-muted-foreground font-mono text-[10px]">
                {item.source ?? "unknown"} · {relativeTime(item.publishedAt, new Date(now))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
