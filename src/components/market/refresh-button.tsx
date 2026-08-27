"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { refreshSource } from "@/lib/actions/refresh/actions";
import { cn } from "@/lib/utils";

/**
 * Runs one source's refresh task in-process.
 *
 * The same code the poller runs, which is why a machine with no poller is still
 * a usable app rather than a stale one.
 */
export function RefreshButton({ source, label }: { source: string; label?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Refresh ${label ?? source} now`}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshSource(source);
          if (result.ok) toast.success(`${label ?? source} refreshed`, { description: result.data.message });
          else toast.error(`${label ?? source} not refreshed`, { description: result.error });
        })
      }
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-[10px] transition-colors disabled:opacity-50",
      )}
    >
      <RefreshCw className={cn("size-3", pending && "animate-spin")} aria-hidden />
      {pending ? "running" : "refresh"}
    </button>
  );
}
