import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `.tsx` is allowed so the representation primitives can be rendered and asserted as markup
    // without a DOM: `react-dom/server` returns the exact projection the browser will receive.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      // Every executable engine module must meet the thresholds below. `src/engine/index.ts` is
      // included so that any logic added to the boundary in future is measured too; today it is a
      // pure re-export module with no executable statements, so v8 reports it as an empty file.
      //
      // The GAME-186 representation layer is measured the same way. It is a projection rather than an
      // authority, but the legibility floors are geometry, and geometry that is not measured is not
      // guaranteed: the pure modules and the React primitives are both covered here.
      //
      // The GAME-187 lane layer is measured too, and for a harder reason: it is the only place that decides
      // *content* — which denominators may be dealt, how a lane narrows under adaptation and when a review
      // is scheduled. Content rules that are not measured are content rules that drift.
      include: [
        "src/engine/index.ts",
        "src/engine/rational.ts",
        "src/engine/fractionForm.ts",
        "src/engine/rng.ts",
        "src/engine/deck.ts",
        "src/engine/gameState.ts",
        "src/representations/**/*.ts",
        "src/representations/**/*.tsx",
        "src/lanes/**/*.ts",
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
