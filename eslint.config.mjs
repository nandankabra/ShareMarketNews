import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config, imported natively rather than through FlatCompat.
 *
 * eslint-config-next 16 ships flat configs directly; routing them through
 * FlatCompat instead throws "Converting circular structure to JSON" from deep
 * inside the eslintrc shim, which is a memorably unhelpful way to be told the
 * compatibility layer is no longer needed.
 */
export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "node_modules/**", "prisma/migrations/**", "src/generated/**"]),
]);
