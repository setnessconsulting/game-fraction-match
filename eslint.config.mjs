import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "playwright-report-host/**",
    "*.tsbuildinfo",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "scripts/**/*.mjs", "*.config.{ts,mjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // The deterministic engine is the mathematical authority. It must stay pure: no React,
    // no DOM, no clock, no ambient entropy, no persistence, no network. The repository
    // `check:purity` script enforces the same rules over source text; this lint layer fails
    // fast in editors as well.
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "Engine modules must not depend on React." },
            { name: "react-dom", message: "Engine modules must not depend on React DOM." },
            { name: "react-dom/client", message: "Engine modules must not depend on React DOM." },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Engine modules must not read browser globals." },
        { name: "document", message: "Engine modules must not read browser globals." },
        { name: "localStorage", message: "Engine modules must not read or write persistence." },
        { name: "sessionStorage", message: "Engine modules must not read or write persistence." },
        { name: "indexedDB", message: "Engine modules must not read or write persistence." },
        { name: "navigator", message: "Engine modules must not read browser globals." },
        { name: "fetch", message: "Engine modules must not perform network access." },
        { name: "crypto", message: "Engine modules must not read ambient entropy; the shell injects a seed." },
        { name: "setTimeout", message: "Engine modules must not schedule timers; timing is a presentation concern." },
        { name: "setInterval", message: "Engine modules must not schedule timers; timing is a presentation concern." },
        { name: "requestAnimationFrame", message: "Engine modules must not schedule frame callbacks." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Engine modules must not use ambient randomness." },
        { object: "Date", property: "now", message: "Engine modules must not read the wall clock." },
        { object: "performance", property: "now", message: "Engine modules must not read a high-resolution clock." },
      ],
    },
  },
);
