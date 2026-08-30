import { z } from "zod";

/**
 * Validated process environment.
 *
 * Imported by the web app and by the poller, which run as separate processes
 * from the same source tree — and, in production, from different machines
 * entirely. Both parse the same schema at module load, so a missing or
 * malformed variable fails at boot with a readable list rather than as an
 * `undefined` threaded three layers into Prisma or a fetch URL.
 *
 * Deliberately free of `server-only`: the poller is a plain Node process and
 * would be rejected by that guard.
 */

/** Env vars arrive as strings; "" means "not set" for optional numerics. */
const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? fallback : Number(value)))
    .pipe(z.number().int().nonnegative());

const csv = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === ""
        ? fallback
        : value
            .split(",")
            .map((part) => part.trim().toUpperCase())
            .filter(Boolean),
    );

const schema = z.object({
  /**
   * Optional since the read path moved off the database.
   *
   * The deployed app answers from upstream APIs behind a shared cache and never
   * opens a database at all. Only the local poller and the maintenance scripts
   * still need this, and they fail loudly at the point of use rather than
   * taking the whole web app down at import time — which is exactly what a
   * required value did: an unset variable in the hosting dashboard broke the
   * *build*, three layers away from anything that wanted a database.
   */
  DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),

  /** Unset means the access gate is off — correct for localhost. */
  ACCESS_PASSWORD: z.string().optional(),

  POLLER_TICK_MS: numeric(60_000),
  QUOTE_BUDGET_PER_TICK: numeric(20),
  NEWS_BUDGET_PER_RUN: numeric(10),
  NEWS_TTL_MINUTES: numeric(30),
  NEWS_RETENTION_DAYS: numeric(30),
  INTRADAY_RETENTION_DAYS: numeric(7),

  FETCH_TIMEOUT_MS: numeric(12_000),
  POLITE_MIN_GAP_MS: numeric(0),

  OPTION_UNDERLYINGS: csv(["NIFTY"]),
  OPTION_EXPIRY_DEPTH: numeric(1),
  OPTION_RETENTION_DAYS: numeric(14),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n${lines.join("\n")}`);
}

export const env = parsed.data;
