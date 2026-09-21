import { describe, expect, it } from "vitest";

import {
  REPRESENTATION_FAMILIES,
  REPRESENTATION_FAMILY_LABELS,
  representationWholes,
  type RepresentationFamily,
} from "../src/representations";
import {
  laneWholeFor,
  laneWholeProblems,
  laneWholeSummary,
  laneWholes,
  type LaneConfig,
} from "../src/lanes";
import { TEST_LANE_WHOLE, laneWithCatalogue, testLane } from "./laneTestFixtures";

/**
 * A lane declares one continuous whole, one countable collection and one axis, and every card draws
 * against them. These tests pin the two halves of that promise: the wholes are the *declared* ones, and
 * the divisibility rule that makes them usable is reported rather than enforced silently.
 */

describe("lane wholes", () => {
  it("derives all three whole kinds from the declaration, with the declared identities", () => {
    const wholes = laneWholes(testLane());

    expect(wholes.continuous).toEqual({
      kind: "continuous-whole",
      wholeId: TEST_LANE_WHOLE.continuousWholeId,
      description: TEST_LANE_WHOLE.continuousWholeDescription,
    });
    expect(wholes.set.kind).toBe("discrete-set");
    expect(wholes.set.wholeId).toBe(TEST_LANE_WHOLE.setWholeId);
    expect(wholes.set.totalObjectCount).toBe(TEST_LANE_WHOLE.setTotalObjectCount);
    expect(wholes.numberLine.kind).toBe("number-line-axis");
    expect(wholes.axis).toBe(wholes.numberLine.axis);
    expect(wholes.axis.axisId).toBe(TEST_LANE_WHOLE.axisId);
    expect(wholes.axis.ticksPerUnit).toBe(TEST_LANE_WHOLE.ticksPerUnit);
    expect(wholes.axis.domainStart).toBe(0);
    expect(wholes.axis.domainEnd).toBe(1);
  });

  it("is total: every family resolves, and the mapping is the representation layer's", () => {
    const wholes = laneWholes(testLane());
    const asDeclared = representationWholes({
      continuous: wholes.continuous,
      set: wholes.set,
      numberLine: wholes.numberLine,
    });

    for (const family of REPRESENTATION_FAMILIES) {
      expect(wholes.resolver(family), REPRESENTATION_FAMILY_LABELS[family]).not.toBeNull();
      // The lane layer must not invent its own rule for which whole a family draws.
      expect(wholes.resolver(family)).toBe(asDeclared(family));
    }

    expect(wholes.resolver("symbolic")).toBe(wholes.continuous);
    expect(wholes.resolver("bar")).toBe(wholes.continuous);
    expect(wholes.resolver("circle")).toBe(wholes.continuous);
    expect(wholes.resolver("set")).toBe(wholes.set);
    expect(wholes.resolver("number-line")).toBe(wholes.numberLine);
  });

  it("exposes the same resolver through laneWholeFor", () => {
    const lane = testLane();
    const wholes = laneWholes(lane);
    for (const family of REPRESENTATION_FAMILIES) {
      expect(laneWholeFor(lane, family)).toStrictEqual(wholes.resolver(family));
      expect(laneWholeFor(lane, family)).toStrictEqual(laneWholes(lane).resolver(family as RepresentationFamily));
    }
  });

  it("defaults the collection and axis identities when the declaration omits them", () => {
    const lane = testLane({
      whole: {
        continuousWholeId: "unit",
        continuousWholeDescription: "one whole unit",
        setTotalObjectCount: 4,
        axisId: "axis-0-1-in-4",
        ticksPerUnit: 4,
      },
    });
    const wholes = laneWholes(lane);

    // The identities stay stable and non-empty, and the descriptions are the layer's own human wording
    // rather than an id leaking into an accessible name.
    expect(wholes.set.wholeId).toContain("4");
    expect(wholes.set.description).toBe("one collection of 4 objects");
    expect(wholes.numberLine.description).toBe("one number-line axis from 0 to 1 marked in 4 equal parts per whole");
    expect(wholes.numberLine.wholeId).not.toContain(" " );
    expect(wholes.numberLine.wholeId).toContain("axis-0-1-in-4");
  });

  it("honours a declared domain and an explicit number-line description", () => {
    const lane = testLane({
      whole: {
        ...TEST_LANE_WHOLE,
        domainStart: 0,
        domainEnd: 2,
        ticksPerUnit: 4,
        numberLineWholeDescription: "one axis from zero to two",
      },
    });
    const wholes = laneWholes(lane);

    expect(wholes.axis.domainEnd).toBe(2);
    expect(wholes.numberLine.description).toBe("one axis from zero to two");
  });
});

describe("lane whole divisibility", () => {
  it("accepts a declaration that carries its whole catalogue", () => {
    expect(laneWholeProblems(testLane())).toEqual([]);
  });

  it("reports every denominator that will not divide the collection or the axis", () => {
    const lane = laneWithCatalogue([2, 3, 4], {
      whole: { ...TEST_LANE_WHOLE, setTotalObjectCount: 8, ticksPerUnit: 8 },
    });
    const problems = laneWholeProblems(lane);

    expect(problems).toEqual([
      "the declared collection of 8 objects is not a multiple of denominator 3; " +
        "a set model must divide its collection exactly, so every catalogue denominator must divide the total",
      "the declared axis of 8 parts per unit is not a multiple of denominator 3; " +
        "a number line must place every catalogue value on a real tick",
    ]);
  });

  it("says nothing about a declaration it cannot read", () => {
    // Structure validation owns these; divisibility is only meaningful once the shape is known.
    expect(laneWholeProblems(testLane({ whole: undefined as unknown as LaneConfig["whole"] }))).toEqual([]);
    expect(
      laneWholeProblems(laneWithCatalogue(undefined as unknown as readonly number[])),
    ).toEqual([]);
  });

  it("ignores catalogue entries that are not usable denominators", () => {
    const lane = laneWithCatalogue([2, 0, 3.5], {
      whole: { ...TEST_LANE_WHOLE, setTotalObjectCount: 8, ticksPerUnit: 8 },
    });
    expect(laneWholeProblems(lane)).toEqual([]);
  });
});

describe("lane whole summary", () => {
  it("states the three wholes, including the declared domain", () => {
    expect(laneWholeSummary(TEST_LANE_WHOLE)).toBe(
      'continuous "test-lane-unit-whole", collection of 8, axis "test-lane-axis-0-1-in-8" 0..1 in 8 parts',
    );
    expect(laneWholeSummary({ ...TEST_LANE_WHOLE, domainStart: 0, domainEnd: 3, ticksPerUnit: 12 })).toContain(
      "0..3 in 12 parts",
    );
  });
});
