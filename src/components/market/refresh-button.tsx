"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { refreshSource } from "@/lib/actions/refresh/actions";
import { cn } from "@/lib/utils";

/**
 * Drops one source's cached answer, so the next load fetches it again.
 *
 * This used to run the poller's task for that source. There is no poller, and
 * "refresh" now means only what you would expect it to mean.
 *
 * Worth knowing while clicking it: the cache is shared by everyone, so this is
 * not a private act — it sends the next render out to the upstream. The action
 * enforces a cooldown for that reason.
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
