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
 * The poller is expected to be off much of the time, since it runs on a home
 * machine rather than in the cloud (NSE refuses datacenter IPs). So "stale" is
 * a normal state, and this reads as information rather than an alarm.
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
        Prices last updated{" "}
        <strong className="font-mono font-semibold">{relativeTime(lastSuccessAt, new Date(now))}</strong>. The
        background poller may not be running.
      </span>
      <Link href="/health" className="text-primary font-medium underline underline-offset-2">
        Check sources
      </Link>
    </div>
  );
}
