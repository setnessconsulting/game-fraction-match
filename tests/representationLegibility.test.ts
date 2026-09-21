import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  DIVISION_LINE_TOKENS,
  MIN_CARD_SIZE_CSS_PX,
  MIN_DIVISION_CONTRAST_RATIO,
  MIN_DIVISION_LINE_CSS_PX,
  MIN_PARTITION_REGION_CSS_PX,
  MIN_SYMBOL_GLYPH_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  MIN_TICK_SPACING_CSS_PX,
  REPRESENTATION_FAMILIES,
  RepresentationContractError,
  RepresentationLegibilityError,
  allRepresentationCandidates,
  contrastRatio,
  divisionLineContrastRatio,
  evaluateLegibility,
  legibilityReport,
  measureGeometry,
  relativeLuminance,
  representationWholes,
  requireLegibleRepresentation,
  selectLegibleRepresentation,
  type LegibilityRequest,
  type LegibilityVerdict,
  type RepresentationCandidate,
} from "../src/representations";
import {
  SWEEP_BOXES,
  SWEEP_PROPER_VALUES,
  TEST_CONTINUOUS_WHOLE,
  representationFixture,
  testSetWhole,
} from "./representationFixtures";

/**
 * The legibility policy is the mechanism behind GAME-97's rule that a lane must choose another allowed
 * representation rather than shrink a fraction until it cannot be read. These tests pin the floors, the
 * measured reasons, and the properties a lane depends on: deterministic choice, first-legible-wins, and
 * a failure that carries every rejection.
 */

const MIN_BOX = { width: MIN_CARD_SIZE_CSS_PX, height: MIN_CARD_SIZE_CSS_PX } as const;
const DEFAULT_BOX = { width: 96, height: 96 } as const;

function evaluate(request: LegibilityRequest): LegibilityVerdict {
  return evaluateLegibility(request);
}

describe("contrast arithmetic", () => {
  it("computes WCAG relative luminance and contrast ratios", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#1d2430", "#ffffff")).toBeGreaterThan(3);
  });

  it("refuses a colour it cannot read rather than guessing", () => {
    expect(() => contrastRatio("#fff", "#000")).toThrow(/expected a six-digit hex colour; received "#fff"/);
    expect(() => relativeLuminance("white")).toThrow(/expected a six-digit hex colour/);
  });

  it("clears the division-line floor in every declared theme", () => {
    expect(divisionLineContrastRatio()).toBeGreaterThanOrEqual(MIN_DIVISION_CONTRAST_RATIO);
    for (const theme of Object.values(DIVISION_LINE_TOKENS)) {
      expect(contrastRatio(theme.line, theme.surface)).toBeGreaterThanOrEqual(MIN_DIVISION_CONTRAST_RATIO);
    }
  });
});

describe("measured floors", () => {
  it("rejects the bar model of an eighth at the smallest card, with the measurement in the reason", () => {
    const fixture = representationFixture(7, 8);
    const verdict = evaluate({
      family: "bar",
      fraction: fixture.form,
      box: MIN_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
    });

    expect(verdict.legible).toBe(false);
    expect(verdict.problems).toEqual([
      `bar partition is 5.50px wide, below the ${MIN_PARTITION_REGION_CSS_PX}px floor`,
    ]);
    expect(verdict.metrics.partitionRegion).toEqual({ width: 5.5, height: 46 });
  });

  it("accepts the circle model of the same value in the same box", () => {
    const fixture = representationFixture(7, 8);
    const verdict = evaluate({
      family: "circle",
      fraction: fixture.form,
      box: MIN_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
    });
    expect(verdict.legible).toBe(true);
    expect(verdict.problems).toEqual([]);
  });

  it("rejects every discrete family for a hundredth at the smallest card", () => {
    const fixture = representationFixture(1, 100);

    const set = evaluate({ family: "set", fraction: fixture.form, box: MIN_BOX, whole: fixture.set });
    expect(set.legible).toBe(false);
    expect(set.problems).toEqual([
      `set partition is 4.00px wide, below the ${MIN_PARTITION_REGION_CSS_PX}px floor`,
      `set partition is 4.00px tall, below the ${MIN_PARTITION_REGION_CSS_PX}px floor`,
    ]);

    const line = evaluate({
      family: "number-line",
      fraction: fixture.form,
      box: MIN_BOX,
      whole: fixture.numberLine,
    });
    expect(line.legible).toBe(false);
    expect(line.problems).toContain(
      `number-line ticks would sit 0.60px apart, below the ${MIN_TICK_SPACING_CSS_PX}px floor`,
    );
    expect(line.problems).toContain(
      "number-line labels would collapse to 1 label(s); at least 2 are required to read the axis",
    );
  });

  it("accepts the symbolic fallback for a hundredth", () => {
    const fixture = representationFixture(1, 100);
    const verdict = evaluate({
      family: "symbolic",
      fraction: fixture.form,
      box: MIN_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
    });
    expect(verdict.legible).toBe(true);
    expect(verdict.metrics.glyphPx).toBeGreaterThanOrEqual(MIN_SYMBOL_GLYPH_CSS_PX);
  });

  it("rejects a symbol whose glyphs would fall below the readable height", () => {
    const verdict = evaluate({
      family: "symbolic",
      fraction: createFractionForm(1, 2),
      box: { width: 20, height: 20 },
      whole: TEST_CONTINUOUS_WHOLE,
    });
    expect(verdict.legible).toBe(false);
    expect(verdict.problems).toEqual([
      `symbolic digits would render at 4.92px, below the ${MIN_SYMBOL_GLYPH_CSS_PX}px floor`,
    ]);
  });

  it("honours a lane's declared partition cap separately from the physical floors", () => {
    const fixture = representationFixture(2, 4);
    const verdict = evaluate({
      family: "bar",
      fraction: fixture.form,
      box: DEFAULT_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
      maxPartitionCount: 3,
    });

    expect(verdict.legible).toBe(false);
    expect(verdict.problems).toEqual([
      "bar would need 4 partitions, above this lane's declared maxPartitionCount of 3",
    ]);
    expect(evaluate({
      family: "bar",
      fraction: fixture.form,
      box: DEFAULT_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
      maxPartitionCount: 4,
    }).legible).toBe(true);
  });

  it("reports the same measurements the policy judged on", () => {
    const fixture = representationFixture(2, 4);
    const request: LegibilityRequest = {
      family: "bar",
      fraction: fixture.form,
      box: DEFAULT_BOX,
      whole: TEST_CONTINUOUS_WHOLE,
    };
    expect(measureGeometry(request)).toEqual(evaluate(request).metrics);
    expect(evaluate(request).divisionLineContrastRatio).toBeCloseTo(divisionLineContrastRatio(), 10);
    expect(MIN_DIVISION_LINE_CSS_PX).toBe(2);
    expect(MIN_TICK_LABEL_SPACING_CSS_PX).toBe(14);
  });

  it("fails loudly when a declared whole cannot represent the value at all", () => {
    const fixture = representationFixture(5, 4);
    expect(() =>
      evaluate({ family: "set", fraction: fixture.form, box: DEFAULT_BOX, whole: testSetWhole(8) }),
    ).toThrow(RepresentationContractError);

    expect(() =>
      evaluate({
        family: "number-line",
        fraction: representationFixture(2, 4).form,
        box: DEFAULT_BOX,
        whole: testSetWhole(4),
      }),
    ).toThrow(/requires a number-line-axis whole/);
  });
});

describe("candidate selection", () => {
  const candidates: readonly RepresentationCandidate[] = [
    { family: "bar" },
    { family: "circle" },
    { family: "set" },
    { family: "number-line" },
    { family: "symbolic" },
  ];

  it("takes the first legible candidate in the lane's declared order", () => {
    const fixture = representationFixture(2, 4);
    const selection = selectLegibleRepresentation([{ family: "set" }, { family: "bar" }], {
      fraction: fixture.form,
      box: DEFAULT_BOX,
      wholeFor: fixture.wholes,
    });

    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.family).toBe("set");
    expect(selection.rejections).toEqual([]);
  });

  it("accumulates the rejected candidates that came first, with their measured reasons", () => {
    const fixture = representationFixture(7, 8);
    const selection = selectLegibleRepresentation(candidates, {
      fraction: fixture.form,
      box: MIN_BOX,
      wholeFor: fixture.wholes,
    });

    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.family).toBe("circle");
    expect(selection.rejections.map((rejection) => rejection.family)).toEqual(["bar"]);
    expect(selection.rejections[0]!.problems[0]).toContain("bar partition is 5.50px wide");
  });

  it("falls back to the symbolic family when no picture fits", () => {
    const fixture = representationFixture(1, 100);
    const selection = selectLegibleRepresentation(candidates, {
      fraction: fixture.form,
      box: MIN_BOX,
      wholeFor: fixture.wholes,
    });

    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.family).toBe("symbolic");
    expect(selection.rejections.map((rejection) => rejection.family)).toEqual(["bar", "circle", "set", "number-line"]);
  });

  it("rejects a family the lane declares no whole for, instead of guessing one", () => {
    const fixture = representationFixture(2, 4);
    const selection = selectLegibleRepresentation([{ family: "set" }], {
      fraction: fixture.form,
      box: DEFAULT_BOX,
      wholeFor: () => null,
    });

    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.problems).toEqual([
      "set: no whole is declared for set in this lane, so the family cannot be drawn",
    ]);
    expect(selection.rejections[0]!.family).toBe("set");
  });

  it("explains an empty candidate list instead of returning a silent failure", () => {
    const fixture = representationFixture(2, 4);
    const selection = selectLegibleRepresentation([], {
      fraction: fixture.form,
      box: DEFAULT_BOX,
      wholeFor: fixture.wholes,
    });

    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.problems).toEqual([
      "no representation candidates were supplied; a lane must declare at least one",
    ]);
    expect(selection.rejections).toEqual([]);
  });

  it("names the value and the box when nothing can be drawn", () => {
    const fixture = representationFixture(1, 100);
    const visualOnly: readonly RepresentationCandidate[] = [
      { family: "bar" },
      { family: "circle" },
      { family: "set" },
      { family: "number-line" },
    ];

    expect(() =>
      requireLegibleRepresentation(visualOnly, {
        fraction: fixture.form,
        box: MIN_BOX,
        wholeFor: fixture.wholes,
      }),
    ).toThrow(RepresentationLegibilityError);

    try {
      requireLegibleRepresentation(visualOnly, {
        fraction: fixture.form,
        box: MIN_BOX,
        wholeFor: fixture.wholes,
      });
    } catch (error) {
      const legibilityError = error as RepresentationLegibilityError;
      expect(legibilityError.message).toContain("no legible representation for 1/100 in a 68x68px box:");
      // One problem line per measured failure, each prefixed with the family that reported it.
      expect(legibilityError.problems).toHaveLength(7);
      expect(legibilityError.problems.map((problem) => problem.split(":")[0])).toEqual([
        "bar",
        "circle",
        "set",
        "set",
        "number-line",
        "number-line",
        "number-line",
      ]);
      expect(legibilityError.name).toBe("RepresentationLegibilityError");
    }
  });

  it("returns the verdict for a generator that must not fail quietly", () => {
    const fixture = representationFixture(2, 4);
    const chosen = requireLegibleRepresentation(candidates, {
      fraction: fixture.form,
      box: MIN_BOX,
      wholeFor: fixture.wholes,
    });
    expect(chosen.family).toBe("bar");
    expect(chosen.verdict.legible).toBe(true);
  });

  it("is deterministic across repeated calls", () => {
    const fixture = representationFixture(5, 6);
    const request = { fraction: fixture.form, box: MIN_BOX, wholeFor: fixture.wholes };
    expect(selectLegibleRepresentation(candidates, request)).toEqual(selectLegibleRepresentation(candidates, request));
  });

  it("describes every family for diagnostics, in canonical order", () => {
    const fixture = representationFixture(1, 100);
    const report = legibilityReport({
      fraction: fixture.form,
      box: MIN_BOX,
      wholeFor: fixture.wholes,
    });

    expect(report.map((entry) => entry.family)).toEqual([...REPRESENTATION_FAMILIES]);
    expect(report.filter((entry) => entry.legible).map((entry) => entry.family)).toEqual(["symbolic"]);
    expect(report.every((entry) => entry.legible || entry.problems.length > 0)).toBe(true);
  });

  it("maps the three whole kinds onto the five families", () => {
    const fixture = representationFixture(2, 4);
    const resolver = representationWholes({ continuous: TEST_CONTINUOUS_WHOLE, set: fixture.set });
    expect(resolver("symbolic")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(resolver("bar")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(resolver("circle")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(resolver("set")).toBe(fixture.set);
    expect(resolver("number-line")).toBeNull();
  });

  it("offers every family as a diagnostic candidate list", () => {
    expect(allRepresentationCandidates().map((candidate) => candidate.family)).toEqual([...REPRESENTATION_FAMILIES]);
  });
});

describe("legibility properties", () => {
  it("never selects a family that violates a floor, and always selects the first legible one", () => {
    for (const value of SWEEP_PROPER_VALUES) {
      const fixture = representationFixture(value.numerator, value.denominator);

      for (const box of SWEEP_BOXES) {
        const request = { fraction: fixture.form, box, wholeFor: fixture.wholes };
        const selection = selectLegibleRepresentation(allRepresentationCandidates(), request);
        const label = `${value.numerator}/${value.denominator} in ${box.width}x${box.height}`;

        expect(selection.ok, `${label} should always resolve while a readable family exists`).toBe(true);
        if (!selection.ok) continue;

        const verdict = evaluateLegibility({
          family: selection.family,
          fraction: fixture.form,
          box,
          whole: fixture.wholes(selection.family) ?? TEST_CONTINUOUS_WHOLE,
        });
        expect(verdict.problems, label).toEqual([]);

        // Every floor, stated directly against the measurements the policy used.
        const metrics = verdict.metrics;
        if (metrics.partitionRegion !== null) {
          expect(metrics.partitionRegion.width, label).toBeGreaterThanOrEqual(MIN_PARTITION_REGION_CSS_PX);
          expect(metrics.partitionRegion.height, label).toBeGreaterThanOrEqual(MIN_PARTITION_REGION_CSS_PX);
        }
        expect(metrics.divisionLineThicknessPx, label).toBeGreaterThanOrEqual(MIN_DIVISION_LINE_CSS_PX);
        if (metrics.glyphPx !== null) expect(metrics.glyphPx, label).toBeGreaterThanOrEqual(MIN_SYMBOL_GLYPH_CSS_PX);
        if (metrics.tickSpacingPx !== null) expect(metrics.tickSpacingPx, label).toBeGreaterThanOrEqual(MIN_TICK_SPACING_CSS_PX);
        if (metrics.tickLabelSpacingPx !== null) {
          expect(metrics.tickLabelSpacingPx, label).toBeGreaterThanOrEqual(MIN_TICK_LABEL_SPACING_CSS_PX);
        }
        if (metrics.tickLabelCount !== null) expect(metrics.tickLabelCount, label).toBeGreaterThanOrEqual(2);

        // The chosen family is the first one the report calls legible, in lane order.
        const firstLegible = legibilityReport(request).find((entry) => entry.legible);
        expect(selection.family, label).toBe(firstLegible?.family);
      }
    }
  });

  it("recognises the smallest shipped card in every sweep", () => {
    expect(SWEEP_BOXES[0]).toEqual({ width: MIN_CARD_SIZE_CSS_PX, height: MIN_CARD_SIZE_CSS_PX });
  });
});
