import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` does not need a database — it only reads the schema — but
 * `migrate` and `seed` do. Throwing here on a missing DATABASE_URL broke the
 * one command that never needed it: on a deployment there is no .env file, so
 * generation failed before the build could start, and the whole app then
 * type-checked against an ungenerated client (every Prisma callback becoming
 * `any`).
 *
 * So warn rather than throw. Commands that genuinely need a connection still
 * fail, with Prisma's own message, and the app itself validates the variable
 * properly at boot in src/env.ts.
 */
if (!process.env.DATABASE_URL) {
  console.warn(
    "[prisma] DATABASE_URL is not set. `generate` will work; `migrate` and `seed` will not.",
  );
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations"), seed: "tsx prisma/seed.ts" },
});
