import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/layout/page-header";
import { ChainTable } from "@/components/options/chain-table";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { serverNow } from "@/lib/server-now";
import { getChainView, listUnderlyings } from "@/lib/services/options/queries";
import { cn, formatCompact, formatInr, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "F&O" };
export const dynamic = "force-dynamic";

const BUILDUP_LABEL: Record<string, string> = {
  LONG_BUILDUP: "long buildup",
  SHORT_BUILDUP: "short buildup",
  SHORT_COVERING: "short covering",
  LONG_UNWINDING: "long unwinding",
  FLAT: "flat",
};

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; expiry?: string }>;
}) {
  const params = await searchParams;
  const symbol = (params.symbol ?? "NIFTY").toUpperCase();

  const [chain, underlyings, now] = await Promise.all([
    getChainView(symbol, params.expiry),
    listUnderlyings(),
    serverNow(),
  ]);

  if (!chain) {
    return (
      <PageShell>
        <PageHeader eyebrow="Derivatives" title="Option chain" />
        <EmptyState
          title={`No chain captured for ${symbol}`}
          description="NSE did not return a chain for this underlying. Chains are re-read every five minutes; check /health to see whether NSE is answering at all."
        />
      </PageShell>
    );
  }

  // PCR above 1 means more puts are open than calls. It is a crowd-position
  // measure, not a signal, and the wording keeps that distinction.
  const pcrReading =
    chain.pcrOi > 1.2 ? "more puts open than calls" : chain.pcrOi < 0.8 ? "more calls open than puts" : "broadly balanced";

  const tiles = [
    { label: "Spot", value: formatInr(chain.underlyingValue), hint: chain.displayName },
    { label: "ATM strike", value: String(chain.atmStrike), hint: chain.atmIv != null ? `IV ${chain.atmIv.toFixed(1)}%` : "IV —" },
    { label: "PCR (OI)", value: chain.pcrOi.toFixed(2), hint: pcrReading },
    { label: "Max pain", value: String(chain.maxPainStrike), hint: "where writers lose least" },
    { label: "Most call OI", value: chain.oiResistance != null ? String(chain.oiResistance) : "—", hint: "read as resistance" },
    { label: "Most put OI", value: chain.oiSupport != null ? String(chain.oiSupport) : "—", hint: "read as support" },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Derivatives"
        title={`${chain.displayName} option chain`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Expiry {chain.expiryDate} · captured {relativeTime(chain.capturedAt, new Date(now))}
            </span>
            {underlyings.length > 1 ? (
              <span className="flex gap-1">
                {underlyings.map((entry) => (
                  <Link key={entry.symbol} href={`/options?symbol=${entry.symbol}`}>
                    <Badge variant={entry.symbol === chain.symbol ? "event" : "default"}>{entry.symbol}</Badge>
                  </Link>
                ))}
              </span>
            ) : null}
          </span>
        }
        actions={
          chain.expiries.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {chain.expiries.slice(0, 4).map((expiry) => (
                <Link key={expiry} href={`/options?symbol=${chain.symbol}&expiry=${expiry}`}>
                  <Badge variant={expiry === chain.expiryDate ? "event" : "default"}>{expiry}</Badge>
                </Link>
              ))}
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Card key={tile.label} className="px-3 py-2.5">
            <p className="text-muted-foreground font-mono text-[9.5px] tracking-[0.11em] uppercase">
              {tile.label}
            </p>
            <p className="tabular mt-1 font-mono text-base font-semibold">{tile.value}</p>
            <p className="text-muted-foreground mt-0.5 text-[10px] leading-tight">{tile.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <h2 className="text-muted-foreground font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Calls ← strike → Puts
            </h2>
            <span className="text-muted-foreground font-mono text-[9.5px]">
              LB long buildup · SB short buildup · SC short covering · LU long unwinding
            </span>
          </div>
          <ChainTable
            strikes={chain.strikes}
            spot={chain.underlyingValue}
            oiSupport={chain.oiSupport}
            oiResistance={chain.oiResistance}
          />
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Busiest contracts
            </h2>
            <ul className="flex flex-col">
              {chain.mostTraded.map((entry) => (
                <li
                  key={`${entry.strikePrice}${entry.side}`}
                  className="flex items-baseline justify-between gap-2 border-b py-1.5 text-xs last:border-0"
                >
                  <span className="tabular font-mono font-semibold">
                    {entry.strikePrice}
                    <span className={cn("ml-1", entry.side === "CE" ? "text-up" : "text-down")}>
                      {entry.side}
                    </span>
                  </span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {formatCompact(entry.volume)} traded ·{" "}
                    {entry.buildup ? BUILDUP_LABEL[entry.buildup] : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-muted-foreground mb-2 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase">
              Open interest
            </h2>
            <dl className="flex flex-col text-xs">
              <div className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">Total call OI</dt>
                <dd className="tabular font-mono font-semibold">{formatCompact(chain.totalCeOi)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">Total put OI</dt>
                <dd className="tabular font-mono font-semibold">{formatCompact(chain.totalPeOi)}</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-muted-foreground">PCR by volume</dt>
                <dd className="tabular font-mono font-semibold">{chain.pcrVolume.toFixed(2)}</dd>
              </div>
            </dl>
          </Card>

          <div className="border-primary/30 bg-primary/5 rounded-lg border p-3.5">
            <p className="text-primary mb-1.5 font-mono text-[10px] font-semibold tracking-[0.13em] uppercase">
              How to read this
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Everything on this page describes positions that are already open — where open
              interest sits, how it changed since the last capture, and what has traded. Max pain
              is where option writers would lose least, not a prediction of where the index will
              settle. <strong className="text-foreground font-semibold">None of this is a
              recommendation to buy or sell anything.</strong>
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
