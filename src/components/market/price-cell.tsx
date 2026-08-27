import { cn, formatInr, relativeTime } from "@/lib/utils";

/**
 * A price, with how old it is.
 *
 * Prices grey out past thirty minutes rather than pretending to be live. The
 * panel reads from a cache a background poller fills, so a number that looked
 * current but was three hours old would be the app lying quietly — which is
 * what this component exists to prevent.
 *
 * `now` arrives as a prop so the whole page measures staleness from one
 * instant, and so rendering stays a pure function of its inputs.
 */
const STALE_AFTER_MS = 30 * 60_000;

export function PriceCell({
  value,
  quotedAt,
  now,
  source,
  className,
  showAge = false,
}: {
  value: number | null | undefined;
  quotedAt?: Date | null;
  now: number;
  /** Which exchange this price came from. Only shown when it is not NSE. */
  source?: string | null;
  className?: string;
  showAge?: boolean;
}) {
  if (value == null) {
    return (
      <span className={cn("text-muted-foreground font-mono text-xs", className)} title="No quote yet">
        —
      </span>
    );
  }

  const stale = quotedAt ? now - quotedAt.getTime() > STALE_AFTER_MS : true;

  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", className)}>
      <span
        className={cn("tabular font-mono", stale && "text-muted-foreground")}
        title={
          quotedAt
            ? `${source === "BSE" ? "BSE" : "NSE"} price, quoted ${quotedAt.toISOString()}`
            : undefined
        }
      >
        {formatInr(value)}
        {/* NSE is the reference everywhere else in the panel, so a BSE price is
            marked rather than passed off as one. */}
        {source === "BSE" ? (
          <sup className="text-muted-foreground ml-0.5 font-mono text-[8px] tracking-wide">BSE</sup>
        ) : null}
      </span>
      {showAge && quotedAt ? (
        <span className="text-muted-foreground font-mono text-[10px]">
          {relativeTime(quotedAt, new Date(now))}
        </span>
      ) : null}
    </span>
  );
}
