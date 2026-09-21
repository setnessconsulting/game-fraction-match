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
    // The lane layer (GAME-187) is content plus rules, sitting between two authorities it must not replace:
    // the engine chooses the values and the representation layer chooses the pictures. It may consume both
    // public boundaries and nothing else, may never reach an internal of either, and takes no package at all,
    // so a lane stays testable in plain Node. `check:lanes` enforces the same rules over source text; this
    // layer fails fast in editors as well.
    files: ["src/lanes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/engine/**"],
              message:
                "A lane may import the public engine boundary only: reaching an engine internal would let a lane re-derive a value.",
            },
            {
              group: ["**/representations/**"],
              message:
                "A lane may import the public representation boundary only: reaching inside it would let a lane pick its own picture.",
            },
            {
              group: ["react", "react-dom", "react-dom/*", "**/app/**", "**/scripts/**"],
              message: "A lane is content and rules, not UI: it must stay testable without a renderer.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Lane content must not read browser globals; it is data plus rules." },
        { name: "document", message: "Lane content must not touch the DOM." },
        { name: "localStorage", message: "Lane content must not read or write persistence." },
        { name: "sessionStorage", message: "Lane content must not read or write persistence." },
        { name: "indexedDB", message: "Lane content must not read or write persistence." },
        { name: "navigator", message: "Lane content must not read browser globals." },
        { name: "fetch", message: "Lane content must not perform network access." },
        { name: "crypto", message: "Lane content must not read ambient entropy; the engine's seeded generator is the only source of selection." },
        { name: "setTimeout", message: "Lane content must not schedule timers; a board is a value, not a schedule." },
        { name: "setInterval", message: "Lane content must not schedule timers." },
        { name: "requestAnimationFrame", message: "Lane content must not schedule frame callbacks." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "A lane must not use ambient randomness; selection belongs to the engine's seeded generator." },
        { object: "Date", property: "now", message: "A lane must not read the wall clock; latency is diagnostic and arrives as data." },
        { object: "performance", property: "now", message: "A lane must not read a high-resolution clock." },
      ],
    },
  },
  {
    // The design layer (GAME-188) is an authority about appearance: sizes, surfaces, states, motion and the
    // responsive contract. It must import nothing at all — not the engine, which owns mathematics, not the
    // representations, which own pictures, not the lanes, which own content, and no package, so a design
    // decision stays answerable in plain Node. `check:design` enforces the same rules over source text; this
    // layer fails fast in editors as well.
    files: ["src/design/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/engine", "**/engine/**", "**/representations", "**/representations/**", "**/lanes", "**/lanes/**", "**/app/**"],
              message:
                "The design layer declares appearance only: import nothing but its own modules, so the others stay measurable against it.",
            },
            {
              group: ["react", "react-dom", "react-dom/*", "**/scripts/**"],
              message: "The design layer is data and pure functions; it must stay answerable without a renderer.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "The design layer must not read browser globals; it is a pure contract." },
        { name: "document", message: "The design layer must not touch the DOM; the fit planner answers without one." },
        { name: "localStorage", message: "The design layer must not read or write persistence." },
        { name: "sessionStorage", message: "The design layer must not read or write persistence." },
        { name: "indexedDB", message: "The design layer must not read or write persistence." },
        { name: "navigator", message: "The design layer must not read browser globals." },
        { name: "fetch", message: "The design layer must not perform network access." },
        { name: "crypto", message: "The design layer must not read ambient entropy." },
        { name: "setTimeout", message: "The design layer declares motion timings as data; it does not schedule them." },
        { name: "setInterval", message: "The design layer declares motion timings as data; it does not schedule them." },
        { name: "requestAnimationFrame", message: "The design layer must not schedule frame callbacks." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "The design layer must be deterministic." },
        { object: "Date", property: "now", message: "The design layer must not read the wall clock." },
        { object: "performance", property: "now", message: "The design layer must not read a high-resolution clock." },
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
