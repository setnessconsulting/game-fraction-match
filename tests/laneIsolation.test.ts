import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENGINE_ROOT,
  LANE_ALLOWED_PACKAGES,
  LANE_ROOT,
  REPRESENTATION_ROOT,
  collectFiles,
  findLaneAmbientViolations,
  findLaneImportViolations,
  findLaneViolations,
  isDeepEngineImport,
  isLaneInternalImport,
  isOutOfSourceImport,
  resolveSpecifier,
} from "../scripts/lib/guardRules.mjs";
import { CURRICULUM_MAP, curriculumLanes, laneLadder, validateLaneConfig } from "../src/lanes";

/**
 * The lane layer sits between two authorities it must not replace, and this file is where that claim is
 * enforced rather than believed. It runs the repository guard's own scanners over synthetic violating input
 * — so the scanner behaviour is asserted directly — and then over the real layer, so the guard cannot pass by
 * finding nothing to scan.
 *
 * It also checks that the two enforcement surfaces have not drifted: the build guard must actually use the
 * shared scanners, and the ESLint block must mirror them.
 */

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const laneRoot = resolve(repositoryRoot, LANE_ROOT);

function readRepoFile(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8");
}

function repoPath(absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
}

function ruleIdsOf(source: string, path = "src/lanes/example.ts"): readonly string[] {
  return findLaneViolations(path, source).map((finding) => finding.ruleId);
}

describe("lane guard scanner behaviour", () => {
  it("classifies each kind of import a lane could attempt", () => {
    const source = [
      'import { rational } from "../engine/rational";',
      'import { barGeometry } from "../representations/geometry/bar";',
      'import { readFileSync } from "node:fs";',
      'import React from "react";',
      'import { App } from "../app/App";',
      'import { helper } from "./schema";',
    ].join("\n");

    const findings = findLaneImportViolations("src/lanes/example.ts", source);
    expect(findings.map((finding) => `${finding.ruleId}:${finding.specifier}`)).toEqual([
      "lane-deep-engine-import:../engine/rational",
      "lane-deep-representation-import:../representations/geometry/bar",
      "lane-package-import:node:fs",
      "lane-package-import:react",
      "lane-foreign-import:../app/App",
    ]);

    // The two public boundaries and the layer's own modules are the only allowed dependencies.
    const allowed = [
      'import { createDeck } from "../engine";',
      'import { RepresentationByFamily } from "../representations";',
      'import type { RepresentationFamily } from "../representations";',
      'import { laneFamilies } from "./families";',
    ].join("\n");
    expect(findLaneImportViolations("src/lanes/example.ts", allowed)).toEqual([]);
    expect(LANE_ALLOWED_PACKAGES).toEqual([]);
  });

  it("agrees with the shared path classifiers", () => {
    expect(isDeepEngineImport(resolveSpecifier("src/lanes/example.ts", "../engine/rational"))).toBe(true);
    expect(isDeepEngineImport(resolveSpecifier("src/lanes/example.ts", "../engine"))).toBe(false);
    expect(isLaneInternalImport(resolveSpecifier("src/lanes/example.ts", "./families"))).toBe(true);
    expect(isOutOfSourceImport(resolveSpecifier("src/lanes/example.ts", "../../scripts/lib/guardRules.mjs"))).toBe(true);
    expect(ENGINE_ROOT).toBe("src/engine");
    expect(REPRESENTATION_ROOT).toBe("src/representations");
  });

  it("flags ambient capability, and ignores prose that merely mentions it", () => {
    const violating = [
      "const seed = Math.random();",
      "const started = Date.now();",
      "const elapsed = performance.now();",
      "localStorage.setItem('x', 'y');",
      "void fetch('/telemetry');",
      "setTimeout(() => {}, 10);",
    ].join("\n");

    const ruleIds = findLaneAmbientViolations(violating).map((violation) => violation.ruleId);
    expect(ruleIds).toEqual([
      "lane-ambient-randomness",
      "lane-wall-clock",
      "lane-high-resolution-clock",
      "lane-browser-global",
      "lane-network",
      "lane-timer",
    ]);

    const innocent = [
      "// setTimeout is a presentation concern and Math.random would be a second generator",
      'const note = "Date.now() and localStorage are not lane concerns";',
    ].join("\n");
    expect(findLaneAmbientViolations(innocent)).toEqual([]);
  });

  it("reports both import and ambient findings through one entry point", () => {
    const source = ['import React from "react";', "const seed = Math.random();"].join("\n");
    expect(ruleIdsOf(source)).toEqual(["lane-package-import", "lane-ambient-randomness"]);
  });
});

describe("the repository's lane layer", () => {
  const sourceFiles = collectFiles(laneRoot, (path) => /\.(ts|tsx)$/.test(path));

  it("has source files to scan at all", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(9);
  });

  it("consumes only the two public boundaries and imports no package", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      const path = repoPath(absolutePath);
      for (const finding of findLaneImportViolations(path, readRepoFile(absolutePath))) {
        violations.push(`${path}:${finding.line} ${finding.ruleId} ${finding.specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("reads no ambient state, so selection stays the engine's seeded decision", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      for (const violation of findLaneAmbientViolations(readRepoFile(absolutePath))) {
        violations.push(`${repoPath(absolutePath)}:${violation.line} ${violation.ruleId}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("reports nothing at all through the combined scanner the build guard uses", () => {
    for (const absolutePath of sourceFiles) {
      expect(findLaneViolations(repoPath(absolutePath), readRepoFile(absolutePath)), repoPath(absolutePath)).toEqual([]);
    }
  });

  it("ships lanes whose own adapters stay inside the layer", () => {
    // A cheap end-to-end proof that the scanned surface is the one that actually runs: every shipped lane
    // validates, and every ladder is derived from lane data rather than from anything outside the layer.
    expect(validateLaneConfig).toBeTypeOf("function");
    for (const lane of curriculumLanes()) {
      expect(validateLaneConfig(lane), lane.laneId).toEqual([]);
      expect(laneLadder(lane).laneId).toBe(lane.laneId);
    }
    expect(CURRICULUM_MAP).toHaveLength(3);
  });

  it("keeps the build guard and the lint block wired to the shared scanners", () => {
    const guardSource = readRepoFile(resolve(repositoryRoot, "scripts/check-lane-isolation.mjs"));
    expect(guardSource).toContain('from "./lib/guardRules.mjs"');
    expect(guardSource).toContain("findLaneViolations");

    const eslintSource = readRepoFile(resolve(repositoryRoot, "eslint.config.mjs"));
    expect(eslintSource).toContain('files: ["src/lanes/**/*.{ts,tsx}"]');
    expect(eslintSource).toContain('group: ["**/engine/**"]');
    expect(eslintSource).toContain('group: ["**/representations/**"]');
  });
});
