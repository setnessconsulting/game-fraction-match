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
    // The representation layer is a one-way projection of engine *values*: it draws data it is handed
    // and never reaches for the mathematics. Importing the engine at all would let a picture re-derive
    // or second-guess a value, so even the public boundary is off limits here. `check:representations`
    // enforces the same rules over source text; this layer fails fast in editors as well.
    files: ["src/representations/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/engine", "**/engine/**", "**/engine/*"],
              message:
                "The representation layer must not import the engine: it draws supplied values and never computes them.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Representation geometry must not read browser globals; it is a pure projection." },
        { name: "document", message: "Representation geometry must not touch the DOM; it returns geometry data." },
        { name: "localStorage", message: "Representation code must not read or write persistence." },
        { name: "sessionStorage", message: "Representation code must not read or write persistence." },
        { name: "indexedDB", message: "Representation code must not read or write persistence." },
        { name: "navigator", message: "Representation code must not read browser globals." },
        { name: "fetch", message: "Representation code must not perform network access." },
        { name: "crypto", message: "Representation code must not read ambient entropy; geometry is deterministic." },
        { name: "setTimeout", message: "Representation primitives are static; no timers." },
        { name: "setInterval", message: "Representation primitives are static; no timers." },
        { name: "requestAnimationFrame", message: "Representation primitives are static; no frame callbacks." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Representation geometry must be deterministic." },
        { object: "Date", property: "now", message: "Representation geometry must not read the wall clock." },
        { object: "performance", property: "now", message: "Representation geometry must not read a high-resolution clock." },
      ],
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
