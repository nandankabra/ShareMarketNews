import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone everywhere except Vercel.
   *
   * Standalone keeps a self-hosted bundle small, which is why it is here. On
   * Vercel it breaks the build outright: their `onBuildComplete` step runs its
   * own dependency tracing and opens `.next/next-server.js.nft.json`, which
   * standalone mode does not emit — the build compiles, typechecks and renders
   * every page, then dies with ENOENT at the very last step.
   *
   * Vercel traces the bundle itself, so there is nothing to replace here.
   */
  output: process.env.VERCEL ? undefined : "standalone",

  // better-sqlite3 is a native addon — it must not be traced into the bundle.
  // Nothing on the deployed read path loads it (the client is built lazily and
  // only for a file: URL), but tracing it in would still try to resolve a
  // binary that was never compiled for the platform.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
