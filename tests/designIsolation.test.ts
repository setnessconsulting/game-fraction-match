import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DESIGN_ALLOWED_PACKAGES,
  DESIGN_ROOT,
  ENGINE_AMBIENT_RULES,
  collectFiles,
  findDesignImportViolations,
  findDesignViolations,
  findPatternViolations,
  isDesignInternalImport,
  isOutOfSourceImport,
  resolveSpecifier,
  stripCommentsAndStrings,
} from "../scripts/lib/guardRules.mjs";

/**
 * The design guard, tested against violating input as well as against this repository.
 *
 * A guard that is only ever run against compliant source is indistinguishable from a guard that does nothing,
 * so every rule here is first fired deliberately on a synthetic file. The final block then runs the same
 * scanners over the real `src/design` tree, which is what makes "the design layer imports nothing" a
 * property of the repository rather than a property of the scanner.
 */

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const designRoot = resolve(repositoryRoot, DESIGN_ROOT);

function readRepoFile(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8");
}

function repoPath(absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
}

describe("design import classification", () => {
  it("recognises its own modules and nothing else", () => {
    expect(isDesignInternalImport("src/design")).toBe(true);
    expect(isDesignInternalImport("src/design/tokens")).toBe(true);
    expect(isDesignInternalImport("src/design/responsive")).toBe(true);
    expect(isDesignInternalImport("src/representations")).toBe(false);
    expect(isDesignInternalImport("src/lanes/plan")).toBe(false);
    expect(isDesignInternalImport(null)).toBe(false);

    expect(isOutOfSourceImport(resolveSpecifier("src/design/tokens.ts", "../../scripts/lib/guardRules.mjs"))).toBe(true);
  });

  it("flags a package, a foreign module and repository tooling in the layer's own terms", () => {
    const source = [
      'import { createFractionForm } from "../engine";',
      'import { LaneConfig } from "../lanes";',
      'import { FractionBar } from "../representations";',
      'import lodash from "lodash";',
      'import { guardRules } from "../../scripts/lib/guardRules.mjs";',
    ].join("\n");

    const findings = findDesignImportViolations("src/design/index.ts", source);
    const byRule = findings.map((finding) => finding.ruleId);

    expect(byRule).toEqual([
      "design-foreign-import",
      "design-foreign-import",
      "design-foreign-import",
      "design-package-import",
      "design-out-of-source-import",
    ]);
    expect(findings[0]!.message).toContain("Mathematics belongs to the engine");
    expect(findings[3]!.message).toContain("import no package at all");
  });

  it("permits the layer's own modules", () => {
    const source = ['import { DESIGN_PALETTE } from "./tokens";', 'import { planBoardLayout } from "./responsive";'].join("\n");
    expect(findDesignImportViolations("src/design/index.ts", source)).toEqual([]);
  });

  it("flags ambient capability without being fooled by prose about it", () => {
    const violating = [
      "const width = window.innerWidth;",
      "const seed = Math.random();",
      "setTimeout(() => {}, 100);",
      "const now = Date.now();",
    ].join("\n");

    const ruleIds = new Set(findDesignViolations("src/design/responsive.ts", violating).map((finding) => finding.ruleId));
    expect(ruleIds).toEqual(new Set(["design-browser-global", "design-ambient-randomness", "design-timer", "design-wall-clock"]));

    // Comments and string literals are stripped first, so a token *named* after a clock is not a finding.
    const prose = [
      "// The layout plan must never read Date.now() or call setTimeout, and this sentence says so.",
      'const note = "window.innerWidth is read by the panel, not by the plan";',
    ].join("\n");
    expect(findDesignViolations("src/design/responsive.ts", prose)).toEqual([]);
  });
});

describe("the repository's design layer", () => {
  const sourceFiles = collectFiles(designRoot, (path) => /\.(ts|tsx)$/.test(path));

  it("has source files to scan at all", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(5);
  });

  it("imports nothing but its own modules, and no package", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      const path = repoPath(absolutePath);
      for (const finding of findDesignImportViolations(path, readRepoFile(absolutePath))) {
        violations.push(`${path}:${finding.line} ${finding.ruleId} ${finding.message}`);
      }
    }

    expect(violations).toEqual([]);
    expect(DESIGN_ALLOWED_PACKAGES).toEqual([]);
  });

  it("reads no ambient state: no clock, entropy, timers, storage or network", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      const source = stripCommentsAndStrings(readRepoFile(absolutePath));
      for (const violation of findPatternViolations(source, ENGINE_AMBIENT_RULES)) {
        violations.push(`${repoPath(absolutePath)}:${violation.line} ${violation.ruleId}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
