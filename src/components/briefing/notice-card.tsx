import Link from "next/link";

import { ChangePill } from "@/components/market/change-pill";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BriefingEntry } from "@/lib/services/briefing/queries";
import { cn, formatInr, relativeTime } from "@/lib/utils";

const FRESH_MS = 30 * 60_000;

/**
 * One share worth attention, with its reasons in words.
 *
 * The score decides the order and is never printed. A reader cannot argue with
 * "96"; they can argue with "board meeting tomorrow, moved 3.1× its usual
 * swing, two stories today" — and being able to argue with it is the point.
 */
export function NoticeCard({ entry, now }: { entry: BriefingEntry; now: number }) {
  const { share, notice, topStory, nextEvent } = entry;
  const high = notice.band === "HIGH";
  const fresh = topStory ? now - topStory.firstSeenAt.getTime() < FRESH_MS : false;

  return (
    <Card className={cn("relative overflow-hidden p-3.5", high && "border-primary/40")}>
      {high ? <span className="bg-primary absolute inset-y-0 left-0 w-[3px]" aria-hidden /> : null}

      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/shares/${share.symbol.toLowerCase()}`}
          className="hover:text-primary font-mono text-sm font-semibold underline-offset-2 hover:underline"
        >
          {share.symbol}
        </Link>
        {share.dayChangePercent != null ? (
          <ChangePill percent={share.dayChangePercent} size="sm" />
        ) : null}
      </div>

      <p className="text-muted-foreground mt-0.5 truncate text-[11px]">{share.name}</p>

      <p className="tabular mt-2 font-mono text-lg font-semibold tracking-tight">
        {share.lastPrice != null ? `₹${formatInr(share.lastPrice)}` : "—"}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1">
        {notice.reasons.slice(0, 4).map((reason) => (
          <Badge
            key={reason.code}
            variant={reason.code.startsWith("EVENT_") || reason.code === "EX_DATE_NEAR" ? "event" : "default"}
          >
            {reason.label}
          </Badge>
        ))}
      </div>

      {topStory ? (
        <a
          href={topStory.url}
          target="_blank"
          rel="noreferrer"
          className="group mt-2.5 block border-t pt-2"
        >
          <p className="group-hover:text-primary text-xs leading-snug">
            {fresh ? (
              <span className="bg-primary text-primary-foreground mr-1.5 rounded px-1 py-px font-mono text-[8.5px] font-bold tracking-[0.1em] align-[1px]">
                NEW
              </span>
            ) : null}
            {topStory.title}
          </p>
          <p className="text-muted-foreground mt-1 font-mono text-[10px]">
            {topStory.source ?? "unknown"} · {relativeTime(topStory.publishedAt, new Date(now))} ·{" "}
            {topStory.categoryLabel}
            {topStory.polarity === "POSITIVE" ? " ▲" : topStory.polarity === "NEGATIVE" ? " ▼" : ""}
          </p>
        </a>
      ) : nextEvent ? (
        <p className="text-muted-foreground mt-2.5 border-t pt-2 text-xs leading-snug">
          {nextEvent.description.slice(0, 110)}
        </p>
      ) : null}
    </Card>
  );
}
