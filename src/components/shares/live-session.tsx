"use client";

import { createContext, useContext } from "react";

import { useLiveSession, type LiveSession } from "@/lib/hooks/use-live-session";
import type { LivePoint } from "@/lib/live/intraday";

/**
 * One poller for the whole page.
 *
 * The header price and the chart both want the live session, and both are far
 * apart in the tree. Giving each its own hook would double the polling for the
 * same bytes, so the page opens one and shares it.
 */
const SessionContext = createContext<{
  session: LiveSession | null;
  stale: boolean;
  /** Prices this page has watched go by, which is range the published series does not carry. */
  ticks: LivePoint[];
}>({
  session: null,
  stale: false,
  ticks: [],
});

export function LiveSessionProvider({
  symbol,
  enabled,
  children,
}: {
  symbol: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const value = useLiveSession(symbol, enabled);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSharedSession() {
  return useContext(SessionContext);
}
