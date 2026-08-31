import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Watch Desk", template: "%s · Watch Desk" },
  description: "NSE sectors, news and corporate events on one screen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      {/*
        suppressHydrationWarning on <body> as well as <html>. Extensions write
        attributes onto the body before React hydrates — ColorZilla adds
        `cz-shortcut-listen`, Grammarly adds its own — and React reports the
        mismatch as an error the reader cannot act on.

        The reason to silence it is not tidiness: a log that always contains a
        hydration error is a log where a real hydration bug goes unnoticed. This
        suppresses attribute mismatches on this element only, not anywhere else
        in the tree.
      */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
