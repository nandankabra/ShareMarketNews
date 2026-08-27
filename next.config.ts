import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone keeps the deployed bundle small; the read-only app is the only
  // thing that ships, the poller runs from the source tree at home.
  output: "standalone",
  // better-sqlite3 is a native addon — it must not be traced into the bundle.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
