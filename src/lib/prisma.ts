import path from "node:path";

import { createRequire } from "node:module";

import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

import { env } from "@/env";

/**
 * Resolve a SQLite URL the way the Prisma CLI does — relative to the directory
 * holding schema.prisma, not to the working directory.
 *
 * Getting this wrong is silent and confusing: `prisma migrate` creates the
 * tables in one file while the adapter opens a different, empty one, and the
 * only symptom is "the table Sector does not exist" against a database that
 * demonstrably has it. Anchoring both to the same rule is the fix.
 */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url; // libsql:// in production

  const target = url.slice("file:".length);
  if (path.isAbsolute(target)) return `file:${target}`;

  const schemaDir = path.resolve(process.cwd(), "prisma");
  return `file:${path.resolve(schemaDir, target)}`;
}

/**
 * `next dev` and `npm run poller` both write this file. Under SQLite's default
 * rollback journal that is a straight SQLITE_BUSY. WAL gives concurrent readers
 * alongside a single writer, and a busy timeout absorbs the brief contention
 * when a poller batch overlaps a page render instead of throwing instantly.
 *
 * The adapter exposes no connect hook, so the two settings arrive by different
 * routes: better-sqlite3's `timeout` option is the busy timeout, and the
 * journal mode is set with a pragma on first use. WAL is persistent — a
 * property of the file rather than of the connection — so setting it once is
 * enough and setting it again is harmless.
 *
 * In production the database moves to Turso and this file swaps to
 * @prisma/adapter-libsql, where both become the server's problem.
 */
/** Resolved at call time, so a remote deployment never touches the addon. */
function loadBetterSqlite3(): typeof import("@prisma/adapter-better-sqlite3") {
  return createRequire(import.meta.url)("@prisma/adapter-better-sqlite3");
}

function createClient(): PrismaClient {
  // libSQL *is* SQLite, so nothing about the schema changes between the two —
  // same provider, same absent enums and JSON. Only the transport differs, and
  // with it who is responsible for concurrency: the pragmas below are ours to
  // set on a local file and Turso's problem on a remote one.
  const remote = env.DATABASE_URL.startsWith("libsql:") || env.DATABASE_URL.startsWith("https:");

  // better-sqlite3 is a native addon, and it is required lazily rather than
  // imported at the top of the file on purpose: a Turso deployment never uses
  // it, and a static import would still pull the binary into the serverless
  // bundle and fail at load on a platform it was not compiled for.
  const adapter = remote
    ? new PrismaLibSQL({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
    : new (loadBetterSqlite3().PrismaBetterSQLite3)({
        url: resolveDatabaseUrl(env.DATABASE_URL),
        timeout: 5_000,
      });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** True when this process is talking to a hosted database rather than a file. */
export function isRemoteDatabase(): boolean {
  return env.DATABASE_URL.startsWith("libsql:") || env.DATABASE_URL.startsWith("https:");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPragmas?: Promise<void>;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Applied once per process, lazily. Failures are warned rather than thrown: a
 * libSQL/Turso connection rejects these pragmas, and that is expected — the
 * server already handles concurrency there.
 */
export function ensurePragmas(): Promise<void> {
  globalForPrisma.prismaPragmas ??= (async () => {
    // Meaningless against Turso, which manages its own concurrency.
    if (isRemoteDatabase()) return;

    try {
      await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL");
      // NORMAL rather than FULL: one fsync per checkpoint instead of one per
      // write. The failure mode is losing the last transactions on an OS crash,
      // which for a re-fetchable market cache is not a real loss.
      await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
    } catch (error) {
      console.warn("[prisma] pragmas not applied:", error instanceof Error ? error.message : error);
    }
  })();

  return globalForPrisma.prismaPragmas;
}
