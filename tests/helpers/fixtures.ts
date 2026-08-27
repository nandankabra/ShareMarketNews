import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Fixtures are real payloads, captured live from each upstream and committed.
 * Testing parsers against saved bodies rather than hand-written objects is what
 * catches a shape change: a synthetic fixture only ever proves the parser
 * agrees with the assumptions of whoever wrote it.
 */
export function fixture(name: string): string {
  const path = fileURLToPath(new URL(`../fixtures/providers/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}
