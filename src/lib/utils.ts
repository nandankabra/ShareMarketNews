import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian-format currency. Prices are shown to two decimals throughout. */
export function formatInr(value: number | null | undefined, options: { decimals?: number } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = options.decimals ?? 2;
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percentage, always with its sign so a column reads consistently. */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** Volumes get abbreviated — a nine-digit number in a table teaches nobody anything. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * How old a number is, in words. The panel shows this next to every price
 * rather than implying everything on screen is live.
 */
export function relativeTime(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "never";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function directionOf(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}
