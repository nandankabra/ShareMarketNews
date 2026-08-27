"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { addToWatchlist } from "@/lib/actions/watchlist/actions";
import type { SearchHitRow } from "@/lib/services/watchlist/queries";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;

export function AddShare() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHitRow[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Derived, not stored: below two characters there is nothing to show, and
  // clearing state in an effect to express that is both a cascading render and
  // a chance for stale results to flash back.
  const visible = query.trim().length >= 2 ? results : [];

  useEffect(() => {
    if (query.trim().length < 2) return;

    // Every keystroke cancels the previous request, so a slow one cannot land
    // after a newer one and overwrite fresher results.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/shares?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: { results: SearchHitRow[] } = await response.json();
        setResults(data.results);
        setOpen(true);
      } catch {
        // Aborted or offline — the next keystroke will try again.
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  function add(symbol: string) {
    startTransition(async () => {
      const result = await addToWatchlist(symbol);
      if (result.ok) {
        toast.success(`${result.data.symbol} added`, { description: "Now refreshed every 5 minutes while the market is open." });
        setQuery("");
        setResults([]);
        setOpen(false);
      } else {
        toast.error("Could not add that share", { description: result.error });
      }
    });
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="bg-card focus-within:border-primary/50 flex items-center gap-2 rounded-md border px-3 py-2">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => visible.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) add(query.trim());
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Add a share — type a name or symbol"
          aria-label="Search shares to add to your watchlist"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
        />
        {pending ? <span className="text-muted-foreground font-mono text-[10px]">adding…</span> : null}
      </div>

      {open && visible.length > 0 ? (
        <ul className="bg-popover absolute z-30 mt-1 w-full overflow-hidden rounded-md border shadow-lg">
          {visible.map((hit) => (
            <li key={hit.symbol}>
              <button
                type="button"
                disabled={hit.inWatchlist || pending}
                onClick={() => add(hit.symbol)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                  hit.inWatchlist ? "text-muted-foreground cursor-not-allowed" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{hit.symbol}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{hit.name}</span>
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {hit.inWatchlist ? "on list" : (hit.sector ?? "NSE")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query.trim().length >= 2 && visible.length === 0 ? (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Nothing tracked matches that.{" "}
          <button type="button" onClick={() => add(query.trim())} className="text-primary underline underline-offset-2">
            <Plus className="inline size-3" aria-hidden /> Try adding {query.trim().toUpperCase()} anyway
          </button>
        </p>
      ) : null}
    </div>
  );
}
