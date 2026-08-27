import Link from "next/link";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ChangePill } from "@/components/market/change-pill";
import { getMarketHeader } from "@/lib/services/market/queries";
import { cn, formatInr, relativeTime } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const header = await getMarketHeader();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-primary block size-2 rotate-45 rounded-[1px]" aria-hidden />
            Watch Desk
          </Link>

          <SidebarNav />

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  header.isOpen ? "bg-up animate-pulse" : "bg-muted-foreground",
                )}
                aria-hidden
              />
              <span className="text-muted-foreground hidden sm:inline">
                {header.isOpen ? "Market open" : header.status === "Unknown" ? "Status unknown" : "Market closed"}
              </span>
              {header.niftyLevel != null ? (
                <>
                  <span className="text-muted-foreground hidden md:inline">NIFTY 50</span>
                  <span className="tabular font-semibold">{formatInr(header.niftyLevel)}</span>
                  <ChangePill percent={header.niftyChangePercent} size="sm" />
                </>
              ) : null}
            </div>
            <ThemeToggle />
          </div>
        </div>
        {header.capturedAt ? (
          <p className="sr-only">Market status captured {relativeTime(header.capturedAt)}</p>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="text-muted-foreground border-t px-4 py-4 text-center font-mono text-[10px] tracking-wide sm:px-6">
        Personal, non-commercial. Data from NSE, Yahoo Finance and Google News — descriptive only,
        never advice.
      </footer>
    </div>
  );
}
