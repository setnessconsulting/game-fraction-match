import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENGINE_AMBIENT_RULES,
  REPRESENTATION_ALLOWED_PACKAGES,
  REPRESENTATION_ROOT,
  REPRESENTATION_STYLE_PATH,
  collectFiles,
  findImportSpecifiers,
  findPatternViolations,
  findRepresentationStyleViolations,
  isEngineImport,
  isOutOfSourceImport,
  isRepresentationInternalImport,
  parseCssBlocks,
  resolveSpecifier,
  stripCommentsAndStrings,
} from "../scripts/lib/guardRules.mjs";
import {
  DIVISION_LINE_THICKNESS_CSS_PX,
  MIN_CARD_SIZE_CSS_PX,
  REPRESENTATION_FAMILIES,
  RepresentationLegibilityError,
  evaluateLegibility,
  planRepresentationComparison,
  requireLegibleRepresentation,
} from "../src/representations";
import {
  GALLERY_CANDIDATES,
  GALLERY_COMPARISONS,
  GALLERY_DEFAULT_CARD_BOX,
  GALLERY_DEFAULT_CARD_SIZE_CSS_PX,
  GALLERY_DEFAULT_ROWS,
  GALLERY_MIN_CARD_BOX,
  GALLERY_MIN_ROWS,
  GALLERY_REFUSALS,
  GALLERY_VISUAL_ONLY_CANDIDATES,
} from "../src/app/representationGalleryFixture";

/**
 * The representation layer is a projection, and this file is where that claim is enforced rather than
 * believed: it re-runs the repository guard's own scanners over the real layer, checks the stylesheet
 * invariants that make the legibility floors meaningful, and proves the gallery only ever renders
 * decisions the layer actually made.
 *
 * These tests are the reason the guard is worth trusting: the scanners are exercised on synthetic
 * violating input as well as on the repository's own source.
 */

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const representationRoot = resolve(repositoryRoot, REPRESENTATION_ROOT);
const stylePath = resolve(repositoryRoot, REPRESENTATION_STYLE_PATH);
const globalsCssPath = resolve(repositoryRoot, "src/app/globals.css");

function readRepoFile(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8");
}

function repoPath(absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
}

function tokenValue(source: string, selectorIncludes: string, token: string): string {
  for (const block of parseCssBlocks(source)) {
    if (!block.selector.includes(selectorIncludes)) continue;
    const declaration = block.declarations.find((candidate) => candidate.property === token);
    if (declaration !== undefined) return declaration.value;
  }
  throw new Error(`no declaration of ${token} found in a block matching "${selectorIncludes}"`);
}

describe("guard scanner behaviour", () => {
  it("classifies engine, tooling and representation-internal imports", () => {
    expect(isEngineImport("src/engine")).toBe(true);
    expect(isEngineImport("src/engine/rational")).toBe(true);
    expect(isEngineImport("src/representations/contract")).toBe(false);
    expect(isEngineImport(null)).toBe(false);

    expect(isRepresentationInternalImport("src/representations/geometry/bar")).toBe(true);
    expect(isRepresentationInternalImport("src/representations")).toBe(true);
    expect(isRepresentationInternalImport("src/app/RepresentationGallery")).toBe(false);
    expect(isRepresentationInternalImport(null)).toBe(false);

    expect(isOutOfSourceImport(resolveSpecifier("src/representations/contract.ts", "../../scripts/lib/guardRules.mjs"))).toBe(true);
  });

  it("flags a style violation of every guarded kind, and permits the declared exceptions", () => {
    const violating = [
      ".fm-partition { transform: scale(2); }",
      ".fm-partition { transition: opacity 200ms ease; }",
      ".fm-partition { animation: spin 1s linear infinite; }",
      ".fm-symbol__digit { font-size: 12px; }",
      ".fm-number-line__label { font-size: 0.75rem; }",
    ].join("\n");

    const ruleIds = new Set(findRepresentationStyleViolations(violating).map((violation) => violation.ruleId));
    expect(ruleIds).toEqual(
      new Set([
        "representation-style-transform",
        "representation-style-transition",
        "representation-style-animation",
        "representation-style-locked-font-size",
        "representation-style-forced-colors",
        "representation-style-reduced-motion",
        "representation-style-sr-only",
      ]),
    );

    const permitted = [
      ".fm-sr-only { clip-path: inset(50%); }",
      "@media (prefers-reduced-motion: reduce) { .fm-representation * { transition: none !important; animation: none !important; } }",
      "@media (forced-colors: active) { .fm-partition[data-fill='filled'] { fill: CanvasText; } }",
      ".fm-sr-only { border: 0; }",
    ].join("\n");
    expect(findRepresentationStyleViolations(permitted)).toEqual([]);
  });

  it("parses nested at-rule chunks with accurate line numbers", () => {
    const source = [
      "/* a comment that mentions font-size: 99px */",
      ".a {",
      "  color: currentColor;",
      "}",
      "",
      "@media (forced-colors: active) {",
      "  .fm-symbol__digit,",
      "  .fm-number-line__label {",
      "    fill: CanvasText;",
      "  }",
      "}",
    ].join("\n");

    const blocks = parseCssBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.selector).toBe(".a");
    expect(blocks[0]!.declarations[0]).toEqual({ property: "color", value: "currentColor", line: 3 });
    expect(blocks[1]!.selector).toContain("@media (forced-colors: active)");
    expect(blocks[1]!.declarations[0]).toEqual({ property: "fill", value: "CanvasText", line: 9 });
    // The commented font-size is inert, which is why the scanners strip comments first.
    expect(blocks.flatMap((block) => block.declarations).some((declaration) => declaration.property === "font-size")).toBe(false);
  });

  it("flags an engine import and a banned package in the layer's own terms", () => {
    const source = ['import { createFractionForm } from "../engine";', 'import lodash from "lodash";'].join("\n");
    const findings = findImportSpecifiers(source).map((entry) => ({
      specifier: entry.specifier,
      resolved: resolveSpecifier("src/representations/contract.ts", entry.specifier),
    }));

    expect(findings[0]).toEqual({ specifier: "../engine", resolved: "src/engine" });
    expect(isEngineImport(findings[0]!.resolved)).toBe(true);
    expect(findings[1]!.resolved).toBeNull();
    expect(REPRESENTATION_ALLOWED_PACKAGES).toEqual(["react", "react-dom"]);
  });
});

describe("the repository's representation layer", () => {
  const sourceFiles = collectFiles(representationRoot, (path) => /\.(ts|tsx)$/.test(path));

  it("has source files to scan at all", () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it("imports no engine code and nothing outside itself or React", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      const path = repoPath(absolutePath);
      const source = readRepoFile(absolutePath);

      for (const { specifier, line } of findImportSpecifiers(source)) {
        const resolved = resolveSpecifier(path, specifier);
        if (isEngineImport(resolved)) violations.push(`${path}:${line} imports the engine via "${specifier}"`);
        else if (resolved === null) {
          const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
          if (!REPRESENTATION_ALLOWED_PACKAGES.includes(packageName ?? "")) {
            violations.push(`${path}:${line} imports the package "${specifier}"`);
          }
        } else if (!isRepresentationInternalImport(resolved)) {
          violations.push(`${path}:${line} resolves outside the layer to "${resolved}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("reads no ambient state: no clock, entropy, timers, storage or network", () => {
    const violations: string[] = [];

    for (const absolutePath of sourceFiles) {
      for (const violation of findPatternViolations(stripCommentsAndStrings(readRepoFile(absolutePath)), ENGINE_AMBIENT_RULES)) {
        violations.push(`${repoPath(absolutePath)}:${violation.line} ${violation.ruleId}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps one stylesheet that satisfies every guarded style invariant", () => {
    expect(findRepresentationStyleViolations(readRepoFile(stylePath))).toEqual([]);
  });

  it("draws ink only: no hue, no colour literal, no transform anywhere in the primitives", () => {
    const source = readRepoFile(stylePath);
    const declarations = parseCssBlocks(source).flatMap((block) => block.declarations);

    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|lab)\(/);
    expect(declarations.some((declaration) => declaration.property === "transform")).toBe(false);

    // Filled parts are solid ink and empty parts are outlines, which is what survives forced colors.
    expect(source).toContain('.fm-partition[data-fill="filled"]');
    expect(source).toContain('.fm-partition[data-fill="empty"]');
    expect(tokenValue(source, '.fm-partition[data-fill="filled"]', "fill")).toBe("currentColor");
    expect(tokenValue(source, '.fm-partition[data-fill="empty"]', "fill")).toBe("none");
  });

  it("declares division lines and strokes at the shared thickness the floors measure", () => {
    const source = readRepoFile(stylePath);
    for (const selector of [".fm-partition", ".fm-division", ".fm-whole-frame"]) {
      expect(tokenValue(source, selector, "stroke-width"), selector).toBe(String(DIVISION_LINE_THICKNESS_CSS_PX));
    }
    expect(tokenValue(source, ".fm-division", "fill")).toBe("currentColor");
  });
});

describe("gallery and palette stay in step with the layer", () => {
  it("keeps the declared palette tokens identical to the layer's contrast pair", () => {
    const source = readRepoFile(globalsCssPath);

    expect(tokenValue(source, ":root", "--fm-text")).toBe("#1d2430");
    expect(tokenValue(source, ":root", "--fm-surface")).toBe("#ffffff");
    expect(tokenValue(source, "prefers-color-scheme: dark", "--fm-text")).toBe("#eef1f5");
    expect(tokenValue(source, "prefers-color-scheme: dark", "--fm-surface")).toBe("#1c222b");
  });

  it("sizes the gallery cards exactly as the geometry was qualified", () => {
    const source = readRepoFile(globalsCssPath);

    expect(tokenValue(source, ":root", "--fm-gallery-min-card-size")).toBe(`${MIN_CARD_SIZE_CSS_PX}px`);
    expect(tokenValue(source, ":root", "--fm-gallery-default-card-size")).toBe(`${GALLERY_DEFAULT_CARD_SIZE_CSS_PX}px`);
    expect(GALLERY_MIN_CARD_BOX).toEqual({ width: MIN_CARD_SIZE_CSS_PX, height: MIN_CARD_SIZE_CSS_PX });
    expect(GALLERY_DEFAULT_CARD_BOX.width).toBe(GALLERY_DEFAULT_CARD_SIZE_CSS_PX);

    // The card surface is what the contrast floor is measured against.
    expect(tokenValue(source, ".fm-card", "background")).toBe("var(--fm-surface)");
    expect(tokenValue(source, ".fm-card", "color")).toBe("var(--fm-text)");
  });
});

describe("the gallery only renders decisions the layer made", () => {
  it("resolves every smallest-card row, in the lane's declared order", () => {
    expect(GALLERY_MIN_ROWS.map((row) => row.value.label)).toEqual([
      "1/2",
      "2/4",
      "2/3",
      "3/4",
      "5/6",
      "7/8",
      "1/100",
    ]);

    for (const row of GALLERY_MIN_ROWS) {
      expect(row.family, row.value.label).not.toBeNull();
      expect(row.whole, row.value.label).not.toBeNull();
      expect(row.selection.ok).toBe(true);

      // The rejections are exactly the candidates that came earlier in the lane order.
      const chosenIndex = GALLERY_CANDIDATES.findIndex((candidate) => candidate.family === row.family);
      expect(row.rejections.map((rejection) => rejection.family)).toEqual(
        GALLERY_CANDIDATES.slice(0, chosenIndex).map((candidate) => candidate.family),
      );
      for (const rejection of row.rejections) expect(rejection.problems.length).toBeGreaterThan(0);
    }
  });

  it("shows the documented fallbacks: an eighth needs the circle, a hundredth needs the symbol", () => {
    const eighth = GALLERY_MIN_ROWS.find((row) => row.value.label === "7/8")!;
    expect(eighth.family).toBe("circle");
    expect(eighth.rejections.map((rejection) => rejection.family)).toEqual(["bar"]);
    expect(eighth.rejections[0]!.problems[0]).toContain("partition is 5.50px wide");

    const hundredth = GALLERY_MIN_ROWS.find((row) => row.value.label === "1/100")!;
    expect(hundredth.family).toBe("symbolic");
    expect(hundredth.rejections.map((rejection) => rejection.family)).toEqual(["bar", "circle", "set", "number-line"]);
  });

  it("draws one legible representation of every family at the default card", () => {
    expect(GALLERY_DEFAULT_ROWS.map((row) => row.family)).toEqual([...REPRESENTATION_FAMILIES]);

    for (const row of GALLERY_DEFAULT_ROWS) {
      const verdict = evaluateLegibility({
        family: row.family,
        fraction: row.value.form,
        box: GALLERY_DEFAULT_CARD_BOX,
        whole: row.whole,
      });
      expect(verdict.problems, `${row.family} at the default card`).toEqual([]);
    }
  });

  it("only compares pairs the whole contract accepts, with both sides legible", () => {
    expect(GALLERY_COMPARISONS.map((comparison) => comparison.key)).toEqual([
      "symbolic-vs-bar",
      "symbolic-vs-circle",
      "symbolic-vs-set",
      "symbolic-vs-number-line",
      "bar-vs-circle",
      "set-vs-set",
      "number-line-vs-number-line",
    ]);

    for (const comparison of GALLERY_COMPARISONS) {
      const plan = planRepresentationComparison(
        { family: comparison.left.family, fraction: comparison.left.value.form, whole: comparison.left.whole },
        { family: comparison.right.family, fraction: comparison.right.value.form, whole: comparison.right.whole },
      );
      expect(plan.problems, comparison.key).toEqual([]);

      for (const side of [comparison.left, comparison.right]) {
        const verdict = evaluateLegibility({
          family: side.family,
          fraction: side.value.form,
          box: GALLERY_DEFAULT_CARD_BOX,
          whole: side.whole,
        });
        expect(verdict.problems, `${comparison.key} ${side.family}`).toEqual([]);
      }
    }
  });

  it("shares the collection total in the set pair and the axis scale in the number-line pair", () => {
    const setPair = GALLERY_COMPARISONS.find((comparison) => comparison.key === "set-vs-set")!;
    expect(setPair.left.whole.kind).toBe("discrete-set");
    expect(setPair.right.whole.kind).toBe("discrete-set");
    expect(setPair.left.whole).toBe(setPair.right.whole);

    const linePair = GALLERY_COMPARISONS.find((comparison) => comparison.key === "number-line-vs-number-line")!;
    expect(linePair.left.whole.kind).toBe("number-line-axis");
    expect(linePair.left.whole.wholeId).toBe(linePair.right.whole.wholeId);
    expect(linePair.left.whole).toBe(linePair.right.whole);

    // A symbolic card draws nothing but must still declare the whole it is read against.
    const symbolicSet = GALLERY_COMPARISONS.find((comparison) => comparison.key === "symbolic-vs-set")!;
    expect(symbolicSet.left.whole.kind).toBe("discrete-set");
    expect(symbolicSet.left.whole).toBe(symbolicSet.right.whole);
  });

  it("surfaces both refusals with the problems the layer reported", () => {
    expect(GALLERY_REFUSALS.map((refusal) => refusal.key)).toEqual(["legibility", "comparison"]);

    const legibility = GALLERY_REFUSALS[0]!;
    expect(legibility.detail).toContain("1/1000");
    expect(legibility.problems).toHaveLength(7);
    expect(legibility.problems.every((problem) => /^(bar|circle|set|number-line): /.test(problem))).toBe(true);

    const comparison = GALLERY_REFUSALS[1]!;
    expect(comparison.problems[0]).toContain("bar and set cannot be compared");

    // The visual-only lane genuinely cannot resolve this value, which is what makes the row honest.
    expect(() =>
      requireLegibleRepresentation(GALLERY_VISUAL_ONLY_CANDIDATES, {
        fraction: GALLERY_MIN_ROWS.at(-1)!.value.form,
        box: GALLERY_MIN_CARD_BOX,
        wholeFor: GALLERY_MIN_ROWS.at(-1)!.value.wholes,
      }),
    ).toThrow(RepresentationLegibilityError);
  });
});
