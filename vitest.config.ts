import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Every executable engine module must meet the thresholds below. `src/engine/index.ts` is
      // included so that any logic added to the boundary in future is measured too; today it is a
      // pure re-export module with no executable statements, so v8 reports it as an empty file.
      include: [
        "src/engine/index.ts",
        "src/engine/rational.ts",
        "src/engine/fractionForm.ts",
        "src/engine/rng.ts",
        "src/engine/deck.ts",
        "src/engine/gameState.ts",
      ],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        perFile: true,
      },
    },
  },
});
