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

/**
 * The representation layer, which must stay a one-way projection of engine values.
 *
 * It may read the fields of a fraction value, but it may not import the engine at all — not even for a
 * type — so the mathematics can never be re-derived, second-guessed or duplicated inside a picture, and
 * the layer can be extracted into a shared package without moving any mathematical authority.
 */
export const REPRESENTATION_ROOT = "src/representations";

/** The one stylesheet the primitives own. Its invariants are guarded as strict source text. */
export const REPRESENTATION_STYLE_PATH = `${REPRESENTATION_ROOT}/fractionRepresentation.css`;

/** Packages the representation layer may import. React is the only rendering dependency it needs. */
export const REPRESENTATION_ALLOWED_PACKAGES = ["react", "react-dom"];

/**
 * The lane layer (GAME-187), which turns content into a plan.
 *
 * It sits between two authorities it must not replace: the engine chooses the values and GAME-186's
 * legibility policy chooses the pictures. A lane therefore may import the public engine boundary and the
 * public representation boundary, and nothing else — not the shell, not repository tooling, and no package
 * at all, so a lane stays testable in plain Node and cannot smuggle a UI decision into content.
 */
export const LANE_ROOT = "src/lanes";

/** Hidden engine internals a lane may never reach: only the boundary module is a public surface. */
export const LANE_DEEP_ENGINE_SEGMENTS = 1;

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

/**
 * Whether a resolved path is the engine boundary *or* anything inside it.
 *
 * Presentation code is allowed the boundary; the representation layer is allowed neither.
 */
export function isEngineImport(resolvedPath) {
  if (resolvedPath === null) return false;
  return resolvedPath === ENGINE_ROOT || resolvedPath.startsWith(`${ENGINE_ROOT}/`);
}

/** Whether a resolved path stays inside the representation layer. */
export function isRepresentationInternalImport(resolvedPath) {
  if (resolvedPath === null) return false;
  return resolvedPath === REPRESENTATION_ROOT || resolvedPath.startsWith(`${REPRESENTATION_ROOT}/`);
}

/** Whether a resolved path stays inside the lane layer. */
export function isLaneInternalImport(resolvedPath) {
  if (resolvedPath === null) return false;
  return resolvedPath === LANE_ROOT || resolvedPath.startsWith(`${LANE_ROOT}/`);
}

/**
 * Whether a resolved path is one of the two public boundaries a lane is allowed to consume.
 *
 * `src/engine` and `src/representations` are the boundaries; anything deeper resolves to a path that
 * starts with `src/engine/` or `src/representations/` and is refused by {@link isDeepEngineImport}
 * and {@link isRepresentationInternalImport} at the call site.
 */
export function isAllowedLaneDependency(resolvedPath) {
  if (resolvedPath === null) return false;
  return (
    resolvedPath === ENGINE_PUBLIC_BOUNDARY ||
    resolvedPath === REPRESENTATION_ROOT ||
    isLaneInternalImport(resolvedPath)
  );
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
 * Lane isolation scanners
 * ------------------------------------------------------------------ */

/**
 * Packages a lane module may import. None: a lane is content plus rules, and it stays testable without a
 * renderer, so React, the DOM and every utility library are all out.
 */
export const LANE_ALLOWED_PACKAGES = Object.freeze([]);

/**
 * Every import violation in one lane module.
 *
 * Returns `{ ruleId, line, specifier, resolved, message }[]`. The rule ids are stable so a caller (or a
 * unit test) can assert *which* rule fired rather than matching prose.
 */
export function findLaneImportViolations(repoPath, source) {
  const findings = [];

  for (const { specifier, line } of findImportSpecifiers(source)) {
    const resolved = resolveSpecifier(repoPath, specifier);

    if (isDeepEngineImport(resolved)) {
      findings.push({
        ruleId: "lane-deep-engine-import",
        line,
        specifier,
        resolved,
        message: `a lane may import the public engine boundary only; "${specifier}" reaches engine internals (resolved "${resolved}")`,
      });
      continue;
    }

    if (resolved !== null && resolved.startsWith(`${REPRESENTATION_ROOT}/`)) {
      findings.push({
        ruleId: "lane-deep-representation-import",
        line,
        specifier,
        resolved,
        message: `a lane may import the public representation boundary only; "${specifier}" reaches its internals (resolved "${resolved}")`,
      });
      continue;
    }

    if (isOutOfSourceImport(resolved)) {
      findings.push({
        ruleId: "lane-out-of-source-import",
        line,
        specifier,
        resolved,
        message: `a lane must not import repository tooling (resolved "${resolved}")`,
      });
      continue;
    }

    if (resolved === null) {
      findings.push({
        ruleId: "lane-package-import",
        line,
        specifier,
        resolved,
        message:
          `a lane must import no package at all; "${specifier}" is not application source. ` +
          "A lane is content and rules, and it stays testable without a renderer.",
      });
      continue;
    }

    if (resolved === ENGINE_ROOT || resolved === REPRESENTATION_ROOT) continue;

    if (!isLaneInternalImport(resolved)) {
      findings.push({
        ruleId: "lane-foreign-import",
        line,
        specifier,
        resolved,
        message: `a lane must stay self-contained or consume a public boundary; "${specifier}" resolves to "${resolved}"`,
      });
    }
  }

  return findings;
}

/**
 * Ambient-capability violations in one lane module.
 *
 * Selection belongs to the engine's seeded generator, so a lane that could reach for entropy would be a
 * second generator. Comments and string literals are stripped first, so prose about a clock is not a
 * finding.
 */
export function findLaneAmbientViolations(source) {
  return findPatternViolations(stripCommentsAndStrings(source), ENGINE_AMBIENT_RULES).map((violation) => ({
    ruleId: `lane-${violation.ruleId}`,
    line: violation.line,
    message: violation.message,
    excerpt: violation.excerpt,
  }));
}

/** Every lane-layer violation in one module: imports first, then ambient capability. */
export function findLaneViolations(repoPath, source) {
  const findings = findLaneImportViolations(repoPath, source).map((finding) => ({
    ruleId: finding.ruleId,
    line: finding.line,
    detail: finding.message,
  }));

  for (const violation of findLaneAmbientViolations(source)) {
    findings.push({
      ruleId: violation.ruleId,
      line: violation.line,
      detail: `${violation.message} (${violation.excerpt})`,
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Representation style invariants
 * ------------------------------------------------------------------ */

/**
 * CSS declarations the primitives may never carry, and the only values they may carry.
 *
 * A `transform` would move geometry that the legibility floors measured at authored coordinates, and a
 * transition or animation would let motion change what a learner can read. `none` is therefore the only
 * permitted value for the two motion properties: the reduced-motion block states the promise explicitly
 * rather than relying on nothing being declared.
 */
export const REPRESENTATION_STYLE_DECLARATION_RULES = [
  {
    id: "representation-style-transform",
    property: "transform",
    allowed: [],
    message:
      "representation geometry must not be transformed; the legibility floors measure the authored box",
  },
  {
    id: "representation-style-transition",
    property: "transition",
    allowed: ["none", "none !important"],
    message: "representation primitives are static; only `transition: none` is permitted",
  },
  {
    id: "representation-style-animation",
    property: "animation",
    allowed: ["none", "none !important"],
    message: "representation primitives are static; only `animation: none` is permitted",
  },
];

/**
 * Selectors whose `font-size` is owned by geometry.
 *
 * Symbolic digits and number-line labels are sized from the box so the glyph-height and label-spacing
 * floors describe the picture. A stylesheet that set `font-size` on either would silently invalidate
 * both floors.
 */
export const REPRESENTATION_STYLE_SIZE_LOCKED_SELECTORS = [".fm-symbol__digit", ".fm-number-line__label"];

/** Structural markers the stylesheet must keep. */
export const REPRESENTATION_STYLE_REQUIRED_MARKERS = [
  {
    id: "representation-style-forced-colors",
    marker: "forced-colors: active",
    message: "the primitives must state their forced-colors behaviour explicitly, not rely on the UA",
  },
  {
    id: "representation-style-reduced-motion",
    marker: "prefers-reduced-motion: reduce",
    message: "the primitives must state that reduced motion changes no geometry",
  },
  {
    id: "representation-style-sr-only",
    marker: ".fm-sr-only",
    message: "the visually hidden text alternative utility must stay available",
  },
];

/** Remove `/* ... *\/` comments from CSS, preserving line breaks. */
export function stripCssComments(source) {
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] === "/" && source[index + 1] === "*") {
      index += 2;
      output += "  ";
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        output += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      index += 2;
      output += "  ";
      continue;
    }
    output += source[index];
    index += 1;
  }
  return output;
}

/**
 * Split a stylesheet into selector/declaration blocks.
 *
 * The split is deliberately simple: chunks are separated by `}`, and a chunk's declarations are the text
 * after its last `{`. A nested at-rule therefore collapses into one chunk whose "selector" text carries
 * the at-rule prelude, which is exactly what the size-lock and declaration checks need and is asserted
 * directly in `tests/architectureGuards.test.ts`.
 */
export function parseCssBlocks(source) {
  const text = stripCssComments(source);
  const blocks = [];
  let chunkStart = 0;

  for (const chunk of text.split("}")) {
    const braceIndex = chunk.lastIndexOf("{");
    if (braceIndex !== -1) {
      const bodyStart = chunkStart + braceIndex + 1;
      const declarations = [];
      for (const match of chunk.slice(braceIndex + 1).matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
        declarations.push({
          property: match[1].toLowerCase(),
          value: match[2].trim(),
          line: lineOf(text, bodyStart + (match.index ?? 0)),
        });
      }
      blocks.push({
        selector: chunk.slice(0, braceIndex).trim(),
        declarations,
        line: lineOf(text, chunkStart),
      });
    }
    // +1 accounts for the `}` that `split` consumed.
    chunkStart += chunk.length + 1;
  }

  return blocks;
}

/** Every invariant violation in the representation stylesheet, as rule findings. */
export function findRepresentationStyleViolations(source) {
  const violations = [];

  for (const block of parseCssBlocks(source)) {
    const sizeLocked = REPRESENTATION_STYLE_SIZE_LOCKED_SELECTORS.some((selector) => block.selector.includes(selector));

    for (const declaration of block.declarations) {
      const rule = REPRESENTATION_STYLE_DECLARATION_RULES.find(
        (candidate) => candidate.property === declaration.property,
      );
      if (rule !== undefined && !rule.allowed.includes(declaration.value)) {
        violations.push({
          ruleId: rule.id,
          line: declaration.line,
          message: rule.message,
          excerpt: `${declaration.property}: ${declaration.value}`,
        });
      }
      if (sizeLocked && declaration.property === "font-size") {
        violations.push({
          ruleId: "representation-style-locked-font-size",
          line: declaration.line,
          message:
            "this selector's font size is owned by geometry; a CSS font size would invalidate the legibility floor",
          excerpt: `${block.selector} { font-size: ${declaration.value} }`,
        });
      }
    }
  }

  for (const required of REPRESENTATION_STYLE_REQUIRED_MARKERS) {
    if (!source.includes(required.marker)) {
      violations.push({
        ruleId: required.id,
        line: 1,
        message: required.message,
        excerpt: `missing marker "${required.marker}"`,
      });
    }
  }

  return violations;
}

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
