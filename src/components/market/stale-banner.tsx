import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { relativeTime } from "@/lib/utils";

/**
 * Says out loud when the data is old.
 *
 * `now` is passed in rather than read from the clock during render. Two
 * reasons: a component that reads the clock while rendering is not a pure
 * function of its props, and — more practically — every relative time on a
 * page should agree with every other, which only holds if they all measure
 * from the same instant.
 *
 * What "stale" means changed when the database went away. It used to mean the
 * poller had not run; it now means the cached answer is old, which in practice
 * only happens when an upstream has stopped answering — a live fetch refreshes
 * within its window otherwise. A missing timestamp counts as stale, so this
 * also covers "the last attempt failed outright".
 *
 * Still information rather than an alarm: every page renders its cached values
 * underneath, and saying how old they are is the whole point.
 */
export function StaleBanner({
  lastSuccessAt,
  now,
  thresholdMinutes = 45,
}: {
  lastSuccessAt: Date | null;
  now: number;
  thresholdMinutes?: number;
}) {
  const stale = !lastSuccessAt || now - lastSuccessAt.getTime() > thresholdMinutes * 60_000;
  if (!stale) return null;

  return (
    <div className="border-primary/30 bg-primary/5 text-foreground mb-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <AlertTriangle className="text-primary size-4 shrink-0" aria-hidden />
      <span>
        {lastSuccessAt ? (
          <>
            Market data last refreshed{" "}
            <strong className="font-mono font-semibold">
              {relativeTime(lastSuccessAt, new Date(now))}
            </strong>
            . An upstream may have stopped answering.
          </>
        ) : (
          <>NSE did not answer the last time we asked. Figures below are whatever was cached.</>
        )}
      </span>
      <Link href="/health" className="text-primary font-medium underline underline-offset-2">
        Check sources
      </Link>
    </div>
  );
}
