import { REACTION_DISCLAIMER, describeReaction, type Reaction } from "@/lib/news/reaction";
import type { Level } from "@/lib/ta/levels";
import { formatInr } from "@/lib/utils";

/**
 * What this share has historically done on its own biggest-news days.
 *
 * Not a forecast, and the panel says so in as many words. Everything here is
 * realised history: the share's ordinary swing, its ATR, the spread of moves on
 * days it was most covered, and where the nearest levels sit. Where the sample
 * is thin it says that instead of quoting a range built on two points.
 */
export function ReactionPanel({
  reaction,
  symbol,
  support,
  resistance,
}: {
  reaction: Reaction;
  symbol: string;
  support: Level | null;
  resistance: Level | null;
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Typical daily swing",
      value: reaction.typicalPercent != null ? `±${reaction.typicalPercent.toFixed(1)}%` : "—",
    },
    { label: "ATR (14)", value: reaction.atrPercent != null ? `${reaction.atrPercent.toFixed(1)}%` : "—" },
    {
      label: reaction.kind === "RANGE" ? `Its ${reaction.sampleSize} heaviest-news days` : "Heaviest-news days",
      value:
        reaction.kind === "RANGE"
          ? `${reaction.lowPercent.toFixed(1)}% – ${reaction.highPercent.toFixed(1)}%`
          : "not enough history",
    },
    {
      label: "Nearest support",
      value: support ? `₹${formatInr(support.price)} · ${Math.abs(support.distancePercent).toFixed(1)}% below` : "—",
    },
    {
      label: "Nearest resistance",
      value: resistance
        ? `₹${formatInr(resistance.price)} · ${Math.abs(resistance.distancePercent).toFixed(1)}% above`
        : "—",
    },
  ];

  return (
    <div className="border-primary/30 bg-primary/5 rounded-lg border p-4">
      <p className="text-primary mb-3 font-mono text-[10px] font-semibold tracking-[0.13em] uppercase">
        What {symbol} usually does
      </p>

      <dl className="flex flex-col">
        {rows.map((row) => (
          <div key={row.label} className="border-primary/15 flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="tabular font-mono font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="border-primary/20 text-muted-foreground mt-3 border-t pt-2.5 text-xs leading-relaxed">
        <strong className="text-primary font-semibold">{REACTION_DISCLAIMER}</strong>{" "}
        {describeReaction(reaction, symbol)}
      </p>
    </div>
  );
}
