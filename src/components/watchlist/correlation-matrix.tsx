import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_SESSIONS, type CorrelationMatrix as CorrelationMatrixData } from "@/lib/ta/correlation";
import { cn } from "@/lib/utils";

/** Background tint by strength, not direction alone — a weak correlation should not read as loud as a strong one. */
function cellClass(value: number | null): string {
  if (value == null) return "bg-transparent text-muted-foreground/50";
  const magnitude = Math.abs(value);
  if (value >= 0.99) return "bg-muted text-muted-foreground"; // the diagonal
  if (magnitude < 0.3) return "bg-transparent text-muted-foreground";
  const strong = magnitude >= 0.7;
  if (value > 0) return strong ? "bg-up/25 text-foreground" : "bg-up/10 text-foreground";
  return strong ? "bg-down/25 text-foreground" : "bg-down/10 text-foreground";
}

export function CorrelationMatrix({ correlation }: { correlation: CorrelationMatrixData | null }) {
  if (!correlation || correlation.symbols.length < 2) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm">How your watchlist moves together</CardTitle>
        <CardDescription>
          Correlation of daily returns over the last {MAX_SESSIONS} sessions — descriptive, not a diversification
          score.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1.5 text-left font-mono font-medium" />
              {correlation.symbols.map((symbol) => (
                <th key={symbol} className="text-muted-foreground p-1.5 text-center font-mono font-medium">
                  {symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlation.symbols.map((symbol, i) => (
              <tr key={symbol}>
                <th className="text-muted-foreground p-1.5 text-left font-mono font-medium whitespace-nowrap">
                  {symbol}
                </th>
                {correlation.matrix[i].map((value, j) => (
                  <td key={correlation.symbols[j]} className={cn("p-1.5 text-center tabular-nums", cellClass(value))}>
                    {value == null ? "—" : value.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
