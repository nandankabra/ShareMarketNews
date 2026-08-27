import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env first.");
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations"), seed: "tsx prisma/seed.ts" },
});
