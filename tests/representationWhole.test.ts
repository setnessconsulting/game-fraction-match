import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  DEFAULT_CONTINUOUS_WHOLE_ID,
  REPRESENTATION_FAMILIES,
  RepresentationContractError,
  assertComparisonAllowed,
  axisOfWhole,
  axisPosition,
  axisText,
  comparisonRuleFor,
  continuousWhole,
  discreteSetWhole,
  discreteSetWholeOf,
  numberLineAxis,
  numberLineWhole,
  numberLineWholeOf,
  planRepresentationComparison,
  requireComparisonPlan,
  setSelection,
  wholeText,
  type ComparisonSide,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../src/representations";
import {
  TEST_CONTINUOUS_WHOLE,
  representationFixture,
  testNumberLineWhole,
  testSetWhole,
} from "./representationFixtures";

/**
 * A visual comparison is only meaningful when both sides declare the *same* whole, and GAME-97's rules
 * spell out what "same" means per family pair. These tests hold the rules as behaviour: the planner
 * reports what is incompatible, and the helpers refuse to draw a whole they were not handed.
 */

describe("continuous whole", () => {
  it("carries a stable identity and a description that can be read aloud", () => {
    expect(continuousWhole()).toEqual({
      kind: "continuous-whole",
      wholeId: DEFAULT_CONTINUOUS_WHOLE_ID,
      description: "one whole shape",
    });
    expect(TEST_CONTINUOUS_WHOLE.wholeId).toBe("test-unit-whole");
    expect(Object.isFrozen(TEST_CONTINUOUS_WHOLE)).toBe(true);
  });

  it("refuses an empty identity or description", () => {
    expect(() => continuousWhole({ wholeId: "   " })).toThrow(/wholeId must be a non-empty string/);
    expect(() => continuousWhole({ description: "" })).toThrow(/description must be a non-empty string/);
  });
});

describe("discrete set whole", () => {
  it("derives a default identity and description from the collection size", () => {
    expect(discreteSetWhole({ totalObjectCount: 8 })).toEqual({
      kind: "discrete-set",
      wholeId: "discrete-set-whole-8",
      description: "one collection of 8 objects",
      totalObjectCount: 8,
    });
  });

  it("requires a positive safe-integer total", () => {
    expect(() => discreteSetWhole({ totalObjectCount: 0 })).toThrow(/totalObjectCount must be greater than zero/);
    expect(() => discreteSetWhole({ totalObjectCount: -4 })).toThrow(/greater than zero; received -4/);
    expect(() => discreteSetWhole({ totalObjectCount: 2.5 })).toThrow(/totalObjectCount must be a safe integer/);
  });

  it("states the total in its readable form, because the total is part of the whole", () => {
    expect(wholeText(testSetWhole(8))).toBe("one collection of 8 objects (8 objects in total)");
  });
});

describe("number-line axis and whole", () => {
  it("derives a default identity from the domain and scale", () => {
    expect(numberLineAxis({ ticksPerUnit: 4 })).toEqual({
      axisId: "axis-0-1-4",
      domainStart: 0,
      domainEnd: 1,
      ticksPerUnit: 4,
    });
  });

  it("rejects an impossible axis", () => {
    expect(() => numberLineAxis({ ticksPerUnit: 0 })).toThrow(/ticksPerUnit must be at least 1; received 0/);
    expect(() => numberLineAxis({ ticksPerUnit: 4, domainStart: 2, domainEnd: 1 })).toThrow(
      /domainEnd must be greater than domainStart; received 2\.\.1/,
    );
  });

  it("names the axis in words, singular and plural", () => {
    expect(axisText(numberLineAxis({ ticksPerUnit: 4 }))).toBe(
      "one number-line axis from 0 to 1 marked in 4 equal parts per whole",
    );
    expect(axisText(numberLineAxis({ ticksPerUnit: 1 }))).toBe(
      "one number-line axis from 0 to 1 marked in 1 equal part per whole",
    );
  });

  it("derives its whole identity from the axis, so two axes can never be one whole", () => {
    const whole = numberLineWhole({ axis: numberLineAxis({ axisId: "shared-axis", ticksPerUnit: 8 }) });
    expect(whole.wholeId).toBe("number-line-whole-shared-axis");
    expect(wholeText(whole)).toContain("one number-line axis from 0 to 1 marked in 8 equal parts per whole");
  });
});

describe("counting into a declared collection", () => {
  it("selects an exact number of objects", () => {
    expect(setSelection(createFractionForm(2, 4), testSetWhole(8))).toEqual({
      selectedCount: 4,
      totalObjectCount: 8,
    });
    expect(setSelection(createFractionForm(1, 100), testSetWhole(100))).toEqual({
      selectedCount: 1,
      totalObjectCount: 100,
    });
    expect(setSelection(createFractionForm(0, 4), testSetWhole(4))).toEqual({
      selectedCount: 0,
      totalObjectCount: 4,
    });
    expect(setSelection(createFractionForm(4, 4), testSetWhole(4))).toEqual({
      selectedCount: 4,
      totalObjectCount: 4,
    });
  });

  it("refuses a collection it cannot divide exactly", () => {
    expect(() => setSelection(createFractionForm(2, 4), testSetWhole(6))).toThrow(
      /a set model must divide its collection exactly: 6 objects is not a multiple of denominator 4/,
    );
  });

  it("refuses a set model of a value at or above one whole, and says which family to use instead", () => {
    expect(() => setSelection(createFractionForm(5, 4), testSetWhole(8))).toThrow(RepresentationContractError);
    expect(() => setSelection(createFractionForm(5, 4), testSetWhole(8))).toThrow(
      /numerator 5 exceeds denominator 4\. Use a bar, circle or number line/,
    );
  });

  it("validates the supplied value before counting", () => {
    expect(() =>
      setSelection({ numerator: 1, denominator: 0, canonical: { numerator: 1, denominator: 1 } }, testSetWhole(4)),
    ).toThrow(/setSelection denominator must be greater than zero/);
  });
});

describe("placing a value on a shared axis", () => {
  it("lands on a real tick when the scale is a multiple of the denominator", () => {
    expect(axisPosition(createFractionForm(2, 4), numberLineAxis({ ticksPerUnit: 8 }))).toEqual({
      tickIndex: 4,
      totalTicks: 8,
      ticksPerUnit: 8,
      positionInUnits: { numerator: 2, denominator: 4 },
    });
    // Equivalent forms land on the same tick of one shared scale, which is the whole point.
    expect(axisPosition(createFractionForm(1, 2), numberLineAxis({ ticksPerUnit: 8 })).tickIndex).toBe(4);
    expect(axisPosition(createFractionForm(6, 8), numberLineAxis({ ticksPerUnit: 8 })).tickIndex).toBe(6);
  });

  it("refuses a scale that would put the point between ticks", () => {
    expect(() => axisPosition(createFractionForm(2, 4), numberLineAxis({ ticksPerUnit: 6 }))).toThrow(
      /axis scale 6 parts per unit is not a multiple of denominator 4/,
    );
  });

  it("refuses a value outside the declared domain", () => {
    expect(() => axisPosition(createFractionForm(5, 4), numberLineAxis({ ticksPerUnit: 4 }))).toThrow(
      /value 5\/4 is outside the declared domain 0\.\.1/,
    );
    expect(axisPosition(createFractionForm(5, 4), numberLineAxis({ ticksPerUnit: 4, domainEnd: 2 })).tickIndex).toBe(5);
  });

  it("reports a scale problem and an out-of-domain problem together", () => {
    let caught: unknown;
    try {
      // 9/8 is past the end of the declared domain *and* cannot land on the 3-parts-per-unit scale.
      axisPosition(createFractionForm(9, 8), numberLineAxis({ ticksPerUnit: 3, domainStart: 0, domainEnd: 1 }));
    } catch (error) {
      caught = error;
    }
    expect((caught as RepresentationContractError).problems).toEqual([
      "a number line must share one scale: axis scale 3 parts per unit is not a multiple of denominator 8",
      "value 9/8 is outside the declared domain 0..1",
    ]);
  });
});

describe("supported comparison matrix", () => {
  /** GAME-97's supported pairs, written out once, keyed by pair. */
  const expectedRule = (left: RepresentationFamily, right: RepresentationFamily) => {
    const isAreaModel = (family: RepresentationFamily) => family === "bar" || family === "circle";
    if (left === "symbolic" || right === "symbolic") return "shared-whole";
    if (left === "set" && right === "set") return "shared-set-total";
    if (left === "number-line" && right === "number-line") return "shared-axis";
    if (isAreaModel(left) && isAreaModel(right)) return "shared-whole";
    return null;
  };

  it("covers every family pair, both orders, and refuses the pairs with no shared whole", () => {
    for (const left of REPRESENTATION_FAMILIES) {
      for (const right of REPRESENTATION_FAMILIES) {
        expect(comparisonRuleFor(left, right), `${left} vs ${right}`).toBe(expectedRule(left, right));
      }
    }
  });

  it("refuses a pair whose values could never share one whole definition", () => {
    expect(comparisonRuleFor("bar", "set")).toBeNull();
    expect(comparisonRuleFor("set", "bar")).toBeNull();
    expect(comparisonRuleFor("circle", "number-line")).toBeNull();
    expect(comparisonRuleFor("set", "number-line")).toBeNull();
  });
});

describe("comparison planning", () => {
  const side = (family: RepresentationFamily, whole: RepresentationWhole): ComparisonSide => ({
    family,
    fraction: createFractionForm(2, 4),
    whole,
  });

  it("accepts two area models on one declared whole", () => {
    const plan = planRepresentationComparison(side("bar", TEST_CONTINUOUS_WHOLE), side("circle", TEST_CONTINUOUS_WHOLE));
    expect(plan).toEqual({
      rule: "shared-whole",
      sharedWholeId: "test-unit-whole",
      sharedAxis: null,
      problems: [],
    });
    expect(() => assertComparisonAllowed(plan)).not.toThrow();
  });

  it("accepts a symbolic side beside any visual whole, because a symbol states the whole in words", () => {
    const plan = planRepresentationComparison(side("symbolic", testSetWhole(8)), side("set", testSetWhole(8)));
    expect(plan.rule).toBe("shared-whole");
    expect(plan.problems).toEqual([]);
  });

  it("refuses two different whole identities", () => {
    const plan = planRepresentationComparison(
      side("bar", continuousWhole({ wholeId: "whole-a" })),
      side("circle", continuousWhole({ wholeId: "whole-b" })),
    );
    expect(plan.problems).toEqual([
      'both sides must declare the same whole identity; received "whole-a" and "whole-b"',
    ]);
    expect(plan.sharedWholeId).toBeNull();
    expect(() => assertComparisonAllowed(plan)).toThrow(/same whole identity/);
  });

  it("refuses a set pair whose collection totals differ, even under one identity", () => {
    const plan = planRepresentationComparison(
      side("set", testSetWhole(8, "shared-collection")),
      side("set", testSetWhole(4, "shared-collection")),
    );
    expect(plan.problems).toEqual([
      "a set comparison must keep the total object count fixed; received 8 and 4 objects",
    ]);
  });

  it("refuses a number-line pair that does not share one domain and scale", () => {
    const sameIdDifferentScale = testNumberLineWhole(8, { axisId: "shared-axis" });
    const otherScale = testNumberLineWhole(4, { axisId: "shared-axis" });
    const plan = planRepresentationComparison(side("number-line", sameIdDifferentScale), side("number-line", otherScale));
    expect(plan.problems).toEqual([
      "both number lines must share one domain and scale; received 0..1 in 8 parts and 0..1 in 4 parts",
    ]);

    const otherDomain = testNumberLineWhole(8, { axisId: "shared-axis", domainEnd: 2 });
    const domainPlan = planRepresentationComparison(side("number-line", sameIdDifferentScale), side("number-line", otherDomain));
    expect(domainPlan.problems).toHaveLength(1);
    expect(domainPlan.problems[0]).toMatch(/received 0\.\.1 in 8 parts and 0\.\.2 in 8 parts/);
  });

  it("requires matching whole kinds for the rules that depend on them", () => {
    const setAgainstContinuous = planRepresentationComparison(
      side("set", continuousWhole({ wholeId: "mismatched" })),
      side("set", testSetWhole(4, "mismatched")),
    );
    expect(setAgainstContinuous.problems).toEqual([
      "a set comparison requires both sides to declare a discrete-set whole",
    ]);

    const axisAgainstSet = planRepresentationComparison(
      side("number-line", testSetWhole(4, "mismatched")),
      // The identity matches on purpose: this asserts the *kind* rule on its own, so a shared id cannot
      // hide behind the separate identity problem.
      side(
        "number-line",
        numberLineWhole({ axis: numberLineAxis({ ticksPerUnit: 4 }), wholeId: "mismatched" }),
      ),
    );
    expect(axisAgainstSet.problems).toEqual([
      "a number-line comparison requires both sides to declare a number-line-axis whole",
    ]);
  });

  it("refuses an unsupported pair before looking at any whole", () => {
    const plan = planRepresentationComparison(side("bar", TEST_CONTINUOUS_WHOLE), side("set", testSetWhole(4)));
    expect(plan.rule).toBeNull();
    expect(plan.sharedWholeId).toBeNull();
    expect(plan.sharedAxis).toBeNull();
    expect(plan.problems).toEqual([
      "bar and set cannot be compared: this pair is outside the supported comparison matrix, so it has no shared whole definition",
    ]);
  });

  it("exposes the shared axis for a valid number-line comparison", () => {
    const axis = numberLineAxis({ axisId: "shared-axis", ticksPerUnit: 8 });
    const whole = numberLineWhole({ axis });
    const plan = requireComparisonPlan(side("number-line", whole), side("number-line", whole));
    expect(plan.sharedAxis).toEqual(axis);
  });

  it("validates both values before planning", () => {
    expect(() =>
      planRepresentationComparison(
        { family: "bar", fraction: { numerator: 2, denominator: 0, canonical: { numerator: 1, denominator: 1 } }, whole: TEST_CONTINUOUS_WHOLE },
        side("circle", TEST_CONTINUOUS_WHOLE),
      ),
    ).toThrow(/comparison left denominator must be greater than zero/);
  });
});

describe("whole narrowing helpers", () => {
  it("returns the axis of a number-line whole", () => {
    expect(axisOfWhole(testNumberLineWhole(4, { axisId: "a" }), "test").axisId).toBe("a");
  });

  it("refuses a whole of the wrong kind with an actionable message", () => {
    expect(() => discreteSetWholeOf(TEST_CONTINUOUS_WHOLE, "FractionSet")).toThrow(
      /FractionSet requires a discrete-set whole; received continuous-whole\. Choose a family that shares this whole kind\./,
    );
    expect(() => numberLineWholeOf(TEST_CONTINUOUS_WHOLE, "FractionNumberLine")).toThrow(
      /requires a number-line-axis whole; received continuous-whole/,
    );
    expect(() => axisOfWhole(testSetWhole(4), "number-line legibility")).toThrow(/requires a number-line-axis whole/);
  });

  it("agrees with the fixture resolver about which family gets which whole", () => {
    const fixture = representationFixture(2, 4);
    expect(fixture.wholes("symbolic")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(fixture.wholes("bar")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(fixture.wholes("circle")).toBe(TEST_CONTINUOUS_WHOLE);
    expect(fixture.wholes("set")).toBe(fixture.set);
    expect(fixture.wholes("number-line")).toBe(fixture.numberLine);
  });
});
