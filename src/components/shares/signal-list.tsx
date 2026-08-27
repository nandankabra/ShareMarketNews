import type { Signal } from "@/lib/ta/signals";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<Signal["tone"], string> = {
  GOOD: "bg-up",
  BAD: "bg-down",
  WATCH: "bg-primary",
  NEUTRAL: "bg-muted-foreground/40",
};

/**
 * Indicator values as sentences.
 *
 * "RSI 28" means nothing to a reader who does not already know what 28
 * implies. "RSI 28 — oversold" does the work, and the dot repeats the tone so
 * it is not carried by wording alone.
 */
export function SignalList({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Not enough daily history yet — indicators need about thirty sessions.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {signals.map((signal) => (
        <li key={signal.code} className="flex items-start gap-2.5 border-b py-2 text-sm last:border-0">
          <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_DOT[signal.tone])} aria-hidden />
          <span className={cn("text-muted-foreground", signal.strong && "text-foreground")}>
            {signal.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
