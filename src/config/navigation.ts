import type { LucideIcon } from "lucide-react";
import { Activity, CandlestickChart, Heart, LayoutGrid, Sparkles } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/**
 * The order is the order of a morning: what needs attention, then where it came
 * from, then the derivatives view, then your own list, then whether the data
 * can be trusted at all.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", icon: Sparkles, exact: true },
  { href: "/sectors", label: "Sectors", icon: LayoutGrid },
  { href: "/options", label: "F&O", icon: CandlestickChart },
  { href: "/watchlist", label: "Watchlist", icon: Heart },
  { href: "/health", label: "Health", icon: Activity },
];
