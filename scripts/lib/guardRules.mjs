/**
 * Shared architecture-guard primitives.
 *
 * These are deliberately small, dependency-free text/AST-lite scanners rather than a heavyweight
 * architecture tool. The repository checks (`check:architecture`, `check:privacy`) and the unit
 * tests in `tests/architectureGuards.test.ts` both consume this module, so the guards themselves
 * are directly tested rather than trusted.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * After path normalization the public boundary and its directory both collapse to this value, so
 * `./engine`, `./engine/index` and `@/engine` are all accepted while deeper modules are not.
 */
export const ENGINE_ROOT = "src/engine";
export const ENGINE_PUBLIC_BOUNDARY = ENGINE_ROOT;

/* ------------------------------------------------------------------ *
 * Source stripping
 * ------------------------------------------------------------------ */

/**
 * Remove `//` and block comments while preserving newlines so line numbers stay accurate.
 *
 * String literals are passed through verbatim, so `"http://x"` is not mistaken for a comment and
 * import specifiers survive this pass. Use {@link stripCommentsAndStrings} when the scan is about
 * code tokens rather than module specifiers.
 */
export function stripComments(source) {
  let output = "";
  let index = 0;
  let state = "code";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line-comment";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block-comment";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        state = char;
        output += char;
        index += 1;
        continue;
      }
      output += char;
      index += 1;
      continue;
    }

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else {
        output += " ";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        output += "  ";
        index += 2;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    // Inside a string literal: copy verbatim until the closing quote.
    if (char === "\\") {
      output += char;
      if (next !== undefined) output += next;
      index += 2;
      continue;
    }
    output += char;
    if (char === state) state = "code";
    index += 1;
  }

  return output;
}

/** Remove comments and blank out string literals (including template literals). */
export function stripCommentsAndStrings(source) {
  const withoutComments = stripComments(source);
  let output = "";
  let index = 0;
  let quote = null;

  while (index < withoutComments.length) {
    const char = withoutComments[index];
    if (quote === null) {
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        output += char;
      } else {
        output += char;
      }
      index += 1;
      continue;
    }
    if (char === "\\") {
      output += "  ";
      index += 2;
      continue;
    }
    if (char === quote) {
      quote = null;
      output += char;
      index += 1;
      continue;
    }
    output += char === "\n" ? "\n" : " ";
    index += 1;
  }

  return output;
}

/* ------------------------------------------------------------------ *
 * Pattern scanning
 * ------------------------------------------------------------------ */

export function lineOf(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

function excerptAt(source, index) {
  const start = source.lastIndexOf("\n", index) + 1;
  const end = source.indexOf("\n", index);
  const line = source.slice(start, end === -1 ? source.length : end);
  return line.trim().slice(0, 160);
}

/**
 * Find every occurrence of every rule in `text`.
 * Rules are `{ id, pattern, message }` with `pattern` a global RegExp.
 * Returns `{ ruleId, line, message, excerpt }[]`.
 */
export function findPatternViolations(text, rules) {
  const violations = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      violations.push({
        ruleId: rule.id,
        line: lineOf(text, match.index ?? 0),
        message: rule.message,
        excerpt: excerptAt(text, match.index ?? 0),
      });
    }
  }
  return violations;
}

/* ------------------------------------------------------------------ *
 * Import scanning
 * ------------------------------------------------------------------ */

const IMPORT_SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g,
];

/**
 * Every module specifier referenced by `source`, with its line number, in source order.
 * Commented-out imports are ignored.
 */
export function findImportSpecifiers(source) {
  const stripped = stripComments(source);
  const specifiers = [];
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of stripped.matchAll(pattern)) {
      specifiers.push({ specifier: match[1], line: lineOf(stripped, match.index ?? 0), column: match.index ?? 0 });
    }
  }
  return specifiers.sort((left, right) => left.column - right.column || left.specifier.localeCompare(right.specifier));
}

/** Normalize a repository-relative path to forward slashes with no extension or trailing `/index`. */
export function normalizeRepoPath(path) {
  let normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  normalized = normalized.replace(/\.(ts|tsx|mts|mjs|js|jsx)$/, "");
  if (normalized === "index") return "index";
  normalized = normalized.replace(/\/index$/, "");
  return normalized;
}

/**
 * Resolve a specifier relative to the importing file.
 * Returns the normalized repository-relative path, or `null` for bare/package or non-local
 * specifiers (for example `react` or `node:fs`).
 */
export function resolveSpecifier(importerRepoPath, specifier) {
  if (specifier.startsWith("@/")) return normalizeRepoPath(`src/${specifier.slice(2)}`);
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const joined = normalizePathPosix(join(dirname(importerRepoPath), specifier));
  return normalizeRepoPath(joined);
}

function normalizePathPosix(path) {
  const segments = path.replaceAll("\\", "/").split("/");
  const stack = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join("/");
}

/** Whether a resolved path reaches past the public engine boundary into an engine internal. */
export function isDeepEngineImport(resolvedPath) {
  if (resolvedPath === null) return false;
  return resolvedPath.startsWith(`${ENGINE_ROOT}/`);
}

/** Whether a resolved path is outside application source (for example repository tooling). */
export function isOutOfSourceImport(resolvedPath) {
  if (resolvedPath === null) return false;
  return !resolvedPath.startsWith("src/");
}

/* ------------------------------------------------------------------ *
 * Rule sets
 * ------------------------------------------------------------------ */

/** Ambient capabilities the deterministic engine may never touch. */
export const ENGINE_AMBIENT_RULES = [
  {
    id: "ambient-randomness",
    pattern: /\bMath\s*\.\s*random\b/g,
    message: "engine must not use ambient randomness; a seed is supplied as data",
  },
  {
    id: "wall-clock",
    pattern: /\b(?:new\s+Date\b|Date\s*\.\s*(?:now|UTC)\b)/g,
    message: "engine must not read the wall clock",
  },
  {
    id: "high-resolution-clock",
    pattern: /\bperformance\s*\.\s*now\b/g,
    message: "engine must not read a high-resolution clock",
  },
  {
    id: "browser-global",
    pattern: /\b(?:window|document|localStorage|sessionStorage|indexedDB|navigator|location)\b/g,
    message: "engine must not read browser/DOM globals",
  },
  {
    id: "network",
    pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g,
    message: "engine must not perform network access",
  },
  {
    id: "ambient-entropy",
    pattern: /\bcrypto\b/g,
    message: "engine must not read ambient entropy; the shell injects the seed",
  },
  {
    id: "timer",
    pattern: /\b(?:setTimeout|setInterval|clearTimeout|clearInterval|queueMicrotask|requestAnimationFrame)\b/g,
    message: "engine must not schedule timers or frames; timing is a presentation concern",
  },
  {
    id: "process-environment",
    pattern: /\bprocess\s*\.\s*env\b/g,
    message: "engine must not read process environment state",
  },
];

/** Runtime-dependency allowlist for the learner bundle. */
export const ALLOWED_RUNTIME_DEPENDENCIES = ["react", "react-dom"];

/**
 * Forbidden in shipped presentation source and in the production bundle.
 *
 * `fetch(` is deliberately absent here: Vite's modulepreload polyfill legitimately contains a
 * single static-asset `fetch`, which is exactly the one browser network requirement GAME-185
 * allows. Outbound use is guarded by {@link PRIVACY_SOURCE_ONLY_RULES} over repository source and
 * by the browser smoke test, which asserts that a play session issues no requests after the
 * initial static load.
 */
export const PRIVACY_RULES = [
  {
    id: "gameplay-persistence",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/g,
    message: "no gameplay persistence may be introduced",
  },
  {
    id: "network-api",
    pattern: /\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/g,
    message: "the play loop must make no network requests after static asset loading",
  },
  {
    id: "telemetry-vendor",
    pattern: /\b(?:sentry|posthog|datadog|newrelic|new-relic|bugsnag|rollbar|fullstory|mixpanel|amplitude|hotjar|segment\.io|clarity\.ms)\b/gi,
    message: "no telemetry, observability or session-replay dependency may be introduced",
  },
  {
    id: "remote-analytics",
    pattern: /\b(?:gtag|googletagmanager|google-analytics|plausible\.io|matomo|umami)\b/gi,
    message: "no analytics may be introduced",
  },
];

/** Additional rules applied to repository source but not to the bundled third-party output. */
export const PRIVACY_SOURCE_ONLY_RULES = [
  {
    id: "outbound-fetch",
    pattern: /\bfetch\s*\(/g,
    message: "game source must not call fetch; static asset loading is the only network requirement",
  },
];

/* ------------------------------------------------------------------ *
 * Filesystem helpers
 * ------------------------------------------------------------------ */

export function collectFiles(absoluteRoot, filter) {
  if (!existsSync(absoluteRoot)) return [];
  const stat = statSync(absoluteRoot);
  if (stat.isFile()) return filter(absoluteRoot) ? [absoluteRoot] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const child = join(absoluteRoot, entry.name);
    return entry.isDirectory() ? collectFiles(child, filter) : filter(child) ? [child] : [];
  });
}

export function readTextFile(absolutePath) {
  const contents = readFileSync(absolutePath, "utf8");
  return contents.includes("\0") ? null : contents;
}
