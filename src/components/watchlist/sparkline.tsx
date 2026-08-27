import { cn, directionOf } from "@/lib/utils";

/**
 * Thirty sessions of closes, no axes.
 *
 * Deliberately hand-drawn SVG rather than a chart library: at 72×20 pixels a
 * charting runtime is pure overhead, and this needs to render inside a table
 * cell on the server with no client JavaScript at all.
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return <span className="text-muted-foreground/50 font-mono text-[10px]">—</span>;
  }

  const width = 72;
  const height = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const direction = directionOf(values.at(-1)! - values[0]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={`${values.length}-session trend, ${direction}`}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth="1.3"
        className={cn(
          direction === "up" && "stroke-up",
          direction === "down" && "stroke-down",
          direction === "flat" && "stroke-muted-foreground",
        )}
      />
    </svg>
  );
}
