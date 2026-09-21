import { describe, expect, it } from "vitest";

import {
  ALLOWED_RUNTIME_DEPENDENCIES,
  ENGINE_AMBIENT_RULES,
  ENGINE_PUBLIC_BOUNDARY,
  ENGINE_ROOT,
  PRIVACY_RULES,
  PRIVACY_SOURCE_ONLY_RULES,
  findImportSpecifiers,
  findPatternViolations,
  isDeepEngineImport,
  isOutOfSourceImport,
  normalizeRepoPath,
  resolveSpecifier,
  stripComments,
  stripCommentsAndStrings,
} from "../scripts/lib/guardRules.mjs";
import { NESTED_BASE_PATH } from "../scripts/lib/nestedHostPath.mjs";

/**
 * The guards are the mechanism that keeps comparison authority out of the UI and ambient state out
 * of the engine, so the guards themselves are tested directly — including the negative cases that
 * would otherwise let a guard pass by accident.
 */

const AMBIENT_SAMPLE = [
  "export function bad(seed: number) {",
  "  const a = Math.random();",
  "  const b = Date.now();",
  "  const c = performance.now();",
  "  const d = window.localStorage.getItem('x');",
  "  void fetch('/api');",
  "  void crypto.getRandomValues(new Uint8Array(1));",
  "  setTimeout(() => {}, 10);",
  "  return [a, b, c, d, seed];",
  "}",
].join("\n");

const CLEAN_SAMPLE = [
  "// Math.random() appears only in this comment",
  "export function ok() {",
  "  const label = 'Date.now() and localStorage are inert inside a string';",
  "  return label.length;",
  "}",
].join("\n");

describe("comment and string stripping", () => {
  it("removes comments without shifting line numbers", () => {
    const source = ["line1", "// hidden", "line3", "/* block", "still block */", "line6"].join("\n");
    const stripped = stripComments(source);
    expect(stripped.split("\n")).toHaveLength(6);
    expect(stripped).not.toContain("hidden");
    expect(stripped).not.toContain("block");
    expect(stripped.split("\n")[0]).toBe("line1");
    expect(stripped.split("\n")[5]).toBe("line6");
  });

  it("blanks string contents while keeping line positions", () => {
    const stripped = stripCommentsAndStrings("const a = 'Math.random()';\nconst b = 1;");
    expect(stripped).not.toContain("Math.random");
    expect(stripped.split("\n")).toHaveLength(2);
    expect(stripped).toContain("const b = 1;");
  });
});

describe("engine ambient-API rules", () => {
  it("flags every forbidden ambient capability with its line number", () => {
    const text = stripCommentsAndStrings(AMBIENT_SAMPLE);
    const violations = findPatternViolations(text, ENGINE_AMBIENT_RULES);
    const ids = violations.map((violation) => violation.ruleId);

    expect(ids).toContain("ambient-randomness");
    expect(ids).toContain("wall-clock");
    expect(ids).toContain("high-resolution-clock");
    expect(ids).toContain("browser-global");
    expect(ids).toContain("network");
    expect(ids).toContain("ambient-entropy");
    expect(ids).toContain("timer");

    expect(violations.find((violation) => violation.ruleId === "ambient-randomness")?.line).toBe(2);
    expect(violations.find((violation) => violation.ruleId === "timer")?.line).toBe(8);
  });

  it("does not flag the same tokens inside comments or string literals", () => {
    expect(findPatternViolations(stripCommentsAndStrings(CLEAN_SAMPLE), ENGINE_AMBIENT_RULES)).toEqual([]);

    // Comment stripping alone deliberately leaves string contents intact, which is exactly why the
    // engine purity scan uses the comment-and-string stripper instead.
    const commentOnly = findPatternViolations(stripComments(CLEAN_SAMPLE), ENGINE_AMBIENT_RULES);
    expect(commentOnly.length).toBeGreaterThan(0);
    expect(commentOnly.every((violation) => violation.excerpt.includes("inert inside a string"))).toBe(true);
  });

  it("matches whole words only", () => {
    const text = "const a = Math.randomish;\nconst b = windowed;\nconst c = documents;";
    expect(findPatternViolations(text, ENGINE_AMBIENT_RULES)).toEqual([]);
  });

  it("flags a new-Date construction and a UTC read", () => {
    const text = "const a = new Date();\nconst b = Date.UTC(2026, 0, 1);";
    const ids = findPatternViolations(text, ENGINE_AMBIENT_RULES).map((violation) => violation.ruleId);
    expect(ids).toEqual(["wall-clock", "wall-clock"]);
  });
});

describe("import scanning", () => {
  it("finds every import form and ignores commented-out imports", () => {
    const source = [
      'import { a } from "./alpha";',
      '// import { b } from "./beta";',
      'export { c } from "./gamma";',
      'import "./delta";',
      'const lazy = () => import("./epsilon");',
    ].join("\n");

    const specifiers = findImportSpecifiers(source).map((entry) => entry.specifier);
    expect(specifiers).toEqual(["./alpha", "./gamma", "./delta", "./epsilon"]);
  });

  it("resolves relative, parent and alias specifiers", () => {
    expect(resolveSpecifier("src/App.tsx", "./engine")).toBe("src/engine");
    expect(resolveSpecifier("src/App.tsx", "./engine/index")).toBe("src/engine");
    expect(resolveSpecifier("src/App.tsx", "./engine/index.ts")).toBe("src/engine");
    expect(resolveSpecifier("src/App.tsx", "./engine/rational")).toBe("src/engine/rational");
    expect(resolveSpecifier("src/App.tsx", "@/engine/deck")).toBe("src/engine/deck");
    expect(resolveSpecifier("src/app/deep/file.ts", "../../engine/rng")).toBe("src/engine/rng");
    expect(resolveSpecifier("src/App.tsx", "react")).toBeNull();
    expect(resolveSpecifier("src/App.tsx", "node:fs")).toBeNull();
  });

  it("classifies deep engine imports and out-of-source imports", () => {
    expect(ENGINE_ROOT).toBe("src/engine");
    expect(ENGINE_PUBLIC_BOUNDARY).toBe("src/engine");
    expect(isDeepEngineImport("src/engine")).toBe(false);
    expect(isDeepEngineImport("src/engine/rational")).toBe(true);
    expect(isDeepEngineImport("src/app/App")).toBe(false);
    expect(isDeepEngineImport(null)).toBe(false);

    expect(isOutOfSourceImport("scripts/lib/guardRules")).toBe(true);
    expect(isOutOfSourceImport("tests/fixtures")).toBe(true);
    expect(isOutOfSourceImport("src/app/App")).toBe(false);
    expect(isOutOfSourceImport(null)).toBe(false);
  });

  it("normalizes repository paths", () => {
    expect(normalizeRepoPath("./src/engine/index.ts")).toBe("src/engine");
    expect(normalizeRepoPath("src/engine/deck.tsx")).toBe("src/engine/deck");
    expect(normalizeRepoPath("index")).toBe("index");
  });
});

describe("privacy rules", () => {
  it("flags persistence, network and telemetry markers", () => {
    const sample = [
      "window.localStorage.setItem('moves', String(moves));",
      "document.cookie = 'x=1';",
      "void fetch('/telemetry');",
      "void navigator.sendBeacon('/x', 'y');",
      "import * as Sentry from '@sentry/browser';",
      "posthog.capture('move');",
      "gtag('event', 'move');",
    ].join("\n");

    const shared = new Set(findPatternViolations(sample, PRIVACY_RULES).map((violation) => violation.ruleId));
    expect(shared).toEqual(new Set(["gameplay-persistence", "network-api", "telemetry-vendor", "remote-analytics"]));

    const sourceOnly = new Set(
      findPatternViolations(sample, PRIVACY_SOURCE_ONLY_RULES).map((violation) => violation.ruleId),
    );
    expect(sourceOnly).toEqual(new Set(["outbound-fetch"]));
  });

  it("permits the framework's static-asset preload fetch in bundled output but not in source", () => {
    // This is the exact shape Vite's modulepreload polyfill produces in the production bundle.
    const bundled = "function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}";
    expect(findPatternViolations(bundled, PRIVACY_RULES)).toEqual([]);
    expect(findPatternViolations(bundled, PRIVACY_SOURCE_ONLY_RULES)).toHaveLength(1);
  });

  it("leaves clean presentation source alone", () => {
    const sample = [
      "const [state, setState] = useState(0);",
      "const seed = sampleEntropySeed();",
      "return <button onClick={() => setState(state + 1)}>Go</button>;",
    ].join("\n");
    expect(findPatternViolations(sample, PRIVACY_RULES)).toEqual([]);
    expect(findPatternViolations(sample, PRIVACY_SOURCE_ONLY_RULES)).toEqual([]);
  });

  it("allows exactly React and React DOM as runtime dependencies", () => {
    expect([...ALLOWED_RUNTIME_DEPENDENCIES]).toEqual(["react", "react-dom"]);
  });
});

describe("nested host base", () => {
  it("matches the versioned games-site prefix shape", () => {
    expect(NESTED_BASE_PATH).toMatch(/^\/game-assets\/fraction-match\/[^/]+$/);
  });
});
