import { cn, directionOf, formatPercent } from "@/lib/utils";

/**
 * A percentage change, coloured by direction and carrying an arrow.
 *
 * The arrow is not decoration: colour alone fails for a red-green colourblind
 * reader, which is a meaningful slice of anyone looking at a market screen.
 */
export function ChangePill({
  percent,
  absolute,
  className,
  size = "default",
}: {
  percent: number | null | undefined;
  absolute?: number | null;
  className?: string;
  size?: "default" | "sm";
}) {
  const direction = directionOf(percent);

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 rounded-md font-mono font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        direction === "up" && "bg-up-muted text-up",
        direction === "down" && "bg-down-muted text-down",
        direction === "flat" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden>{direction === "up" ? "▲" : direction === "down" ? "▼" : "–"}</span>
      {absolute != null && Number.isFinite(absolute) ? (
        <span>
          {absolute >= 0 ? "+" : ""}
          {absolute.toFixed(2)}
        </span>
      ) : null}
      <span>{formatPercent(percent)}</span>
    </span>
  );
}
