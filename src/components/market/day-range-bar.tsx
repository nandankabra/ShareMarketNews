import { cn } from "@/lib/utils";

/**
 * Where the last price sits inside the day's range.
 *
 * A number pair ("3,128 – 3,206") makes a reader do the arithmetic; a marker
 * on a bar answers "near the high or near the low" at a glance, which is the
 * only question the column is really asked.
 */
export function DayRangeBar({
  low,
  high,
  last,
  className,
}: {
  low: number | null | undefined;
  high: number | null | undefined;
  last: number | null | undefined;
  className?: string;
}) {
  if (low == null || high == null || last == null || high <= low) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const position = Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));

  return (
    <span
      className={cn("bg-muted relative inline-block h-1 w-20 rounded-full align-middle", className)}
      title={`${low.toFixed(2)} – ${high.toFixed(2)}, last ${last.toFixed(2)}`}
      role="img"
      aria-label={`Day range ${low.toFixed(2)} to ${high.toFixed(2)}, last ${last.toFixed(2)}`}
    >
      <span
        className="bg-foreground absolute -top-[3px] h-[7px] w-[2px] rounded-full"
        style={{ left: `calc(${position}% - 1px)` }}
      />
    </span>
  );
}
