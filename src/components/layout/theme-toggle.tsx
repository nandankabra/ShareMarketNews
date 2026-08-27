"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Both icons are always rendered and CSS picks one.
 *
 * The usual next-themes pattern — a `mounted` flag set in an effect — cannot
 * work on the server, so the first paint is always wrong and then corrects,
 * which is both a visible flash and a synchronous setState inside an effect.
 * Letting the `dark` class on <html> decide means the correct icon is right
 * from the very first paint, with no state at all.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Switch between light and dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" aria-hidden />
      <Moon className="hidden dark:block" aria-hidden />
    </Button>
  );
}
