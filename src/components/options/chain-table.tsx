import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OiBuildup } from "@/lib/db/enums";
import type { ChainStrike } from "@/lib/services/options/queries";
import { cn, formatCompact, formatInr } from "@/lib/utils";

/**
 * Buildup labels, kept short enough for a dense ladder. These are the standard
 * readings of price against open interest and are descriptive: they say what
 * has already happened to positioning, not what will happen next.
 */
const BUILDUP: Record<OiBuildup, { short: string; tone: "up" | "down" | "flat" }> = {
  LONG_BUILDUP: { short: "LB", tone: "up" },
  SHORT_BUILDUP: { short: "SB", tone: "down" },
  SHORT_COVERING: { short: "SC", tone: "up" },
  LONG_UNWINDING: { short: "LU", tone: "down" },
  FLAT: { short: "–", tone: "flat" },
};

function BuildupTag({ value }: { value: OiBuildup | null }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>;
  const entry = BUILDUP[value];
  return (
    <span
      title={value.replace(/_/g, " ").toLowerCase()}
      className={cn(
        "font-mono text-[9.5px] font-bold",
        entry.tone === "up" && "text-up",
        entry.tone === "down" && "text-down",
        entry.tone === "flat" && "text-muted-foreground/60",
      )}
    >
      {entry.short}
    </span>
  );
}

function OiChange({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className={cn("tabular font-mono text-[11px]", value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted-foreground")}>
      {value > 0 ? "+" : ""}
      {formatCompact(Math.abs(value)).replace(/^/, value < 0 ? "-" : "")}
    </span>
  );
}

export function ChainTable({
  strikes,
  spot,
  oiSupport,
  oiResistance,
}: {
  strikes: ChainStrike[];
  spot: number;
  oiSupport: number | null;
  oiResistance: number | null;
}) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">OI</TableHead>
          <TableHead className="text-right">Chg OI</TableHead>
          <TableHead className="text-right">Vol</TableHead>
          <TableHead className="text-right">IV</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-center">B</TableHead>
          <TableHead className="text-center">Strike</TableHead>
          <TableHead className="text-center">B</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-right">IV</TableHead>
          <TableHead className="text-right">Vol</TableHead>
          <TableHead className="text-right">Chg OI</TableHead>
          <TableHead className="text-right">OI</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {strikes.map((strike) => {
          const itmCall = strike.strikePrice < spot;
          const itmPut = strike.strikePrice > spot;
          return (
            <TableRow
              key={strike.strikePrice}
              className={cn(strike.isAtm && "bg-primary/10 hover:bg-primary/15")}
            >
              {/* Calls */}
              <TableCell className={cn("tabular text-right font-mono", itmCall && "bg-muted/40")}>
                {formatCompact(strike.ceOi)}
              </TableCell>
              <TableCell className={cn("text-right", itmCall && "bg-muted/40")}>
                <OiChange value={strike.ceOiChange} />
              </TableCell>
              <TableCell className={cn("tabular text-muted-foreground text-right font-mono", itmCall && "bg-muted/40")}>
                {formatCompact(strike.ceVolume)}
              </TableCell>
              <TableCell className={cn("tabular text-muted-foreground text-right font-mono", itmCall && "bg-muted/40")}>
                {strike.ceIv != null ? strike.ceIv.toFixed(1) : "—"}
              </TableCell>
              <TableCell className={cn("tabular text-right font-mono font-semibold", itmCall && "bg-muted/40")}>
                {strike.ceLtp != null ? formatInr(strike.ceLtp) : "—"}
              </TableCell>
              <TableCell className={cn("text-center", itmCall && "bg-muted/40")}>
                <BuildupTag value={strike.ceBuildup} />
              </TableCell>

              <TableCell className="text-center">
                <span
                  className={cn(
                    "tabular font-mono text-[11px] font-bold",
                    strike.isAtm && "text-primary",
                    strike.strikePrice === oiResistance && "text-down",
                    strike.strikePrice === oiSupport && "text-up",
                  )}
                >
                  {strike.strikePrice}
                </span>
              </TableCell>

              {/* Puts */}
              <TableCell className={cn("text-center", itmPut && "bg-muted/40")}>
                <BuildupTag value={strike.peBuildup} />
              </TableCell>
              <TableCell className={cn("tabular text-right font-mono font-semibold", itmPut && "bg-muted/40")}>
                {strike.peLtp != null ? formatInr(strike.peLtp) : "—"}
              </TableCell>
              <TableCell className={cn("tabular text-muted-foreground text-right font-mono", itmPut && "bg-muted/40")}>
                {strike.peIv != null ? strike.peIv.toFixed(1) : "—"}
              </TableCell>
              <TableCell className={cn("tabular text-muted-foreground text-right font-mono", itmPut && "bg-muted/40")}>
                {formatCompact(strike.peVolume)}
              </TableCell>
              <TableCell className={cn("text-right", itmPut && "bg-muted/40")}>
                <OiChange value={strike.peOiChange} />
              </TableCell>
              <TableCell className={cn("tabular text-right font-mono", itmPut && "bg-muted/40")}>
                {formatCompact(strike.peOi)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
