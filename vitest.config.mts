import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: every tested module here is pure logic — parsers,
    // indicators, the notice rule. Nothing under test touches the DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/ta/**", "src/lib/providers/**", "src/lib/notice/**", "src/lib/news/**"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
