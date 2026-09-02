"use client";

import { useSyncExternalStore } from "react";

/**
 * What every chart on the site draws, decided once.
 *
 * These are preferences about reading, not about a share: someone who wants
 * RSI under the price and three levels either side of it wants that on the
 * daily chart, on the one-minute pane beside it, and on the next share they
 * open. So the settings live in one store that every `CandleChart` subscribes
 * to, rather than as state inside each one — change them anywhere and every
 * chart on the page follows in the same tick.
 */
export type ChartSettings = {
  rsi: boolean;
  rsiPeriod: number;
  /** How many supports and how many resistances to draw, each. 0 draws none. */
  levelCount: number;
};

export const DEFAULT_SETTINGS: ChartSettings = { rsi: false, rsiPeriod: 14, levelCount: 3 };

export const RSI_PERIODS = [7, 9, 14, 21] as const;
export const LEVEL_COUNTS = [0, 1, 2, 3, 5, 8] as const;

const STORAGE_KEY = "wd:chart-settings";

let current: ChartSettings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function read(): ChartSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;

    const saved = parsed as Partial<ChartSettings>;
    return {
      rsi: typeof saved.rsi === "boolean" ? saved.rsi : DEFAULT_SETTINGS.rsi,
      rsiPeriod: (RSI_PERIODS as readonly number[]).includes(saved.rsiPeriod ?? -1)
        ? saved.rsiPeriod!
        : DEFAULT_SETTINGS.rsiPeriod,
      levelCount: (LEVEL_COUNTS as readonly number[]).includes(saved.levelCount ?? -1)
        ? saved.levelCount!
        : DEFAULT_SETTINGS.levelCount,
    };
  } catch {
    // Site data blocked, or a settings shape from an older version: the
    // defaults are a working chart either way.
    return DEFAULT_SETTINGS;
  }
}

/**
 * Subscribing is also when the saved settings are picked up.
 *
 * The server has no localStorage, so the first render — and hydration with it —
 * must use the defaults. React calls `subscribe` after that, which is the first
 * safe moment to read the real values and tell everyone.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!hydrated) {
    hydrated = true;
    const saved = read();
    if (
      saved.rsi !== current.rsi ||
      saved.rsiPeriod !== current.rsiPeriod ||
      saved.levelCount !== current.levelCount
    ) {
      current = saved;
      emit();
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

export function updateChartSettings(patch: Partial<ChartSettings>) {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Not being able to remember the choice is no reason to refuse it.
  }
  emit();
}

export function useChartSettings(): ChartSettings {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_SETTINGS,
  );
}
