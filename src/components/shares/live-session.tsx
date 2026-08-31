"use client";

import { createContext, useContext } from "react";

import { useLiveSession, type LiveSession } from "@/lib/hooks/use-live-session";

/**
 * One poller for the whole page.
 *
 * The header price and the chart both want the live session, and both are far
 * apart in the tree. Giving each its own hook would double the polling for the
 * same bytes, so the page opens one and shares it.
 */
const SessionContext = createContext<{ session: LiveSession | null; stale: boolean }>({
  session: null,
  stale: false,
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
