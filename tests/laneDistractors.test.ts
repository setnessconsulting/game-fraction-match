import { describe, expect, it } from "vitest";

import {
  laneFamilies,
  minimumPoolTickGap,
  poolTickPositions,
  validateLaneConfig,
  type LaneConfig,
} from "../src/lanes";
import { laneWithCatalogue, testLane } from "./laneTestFixtures";

/**
 * The three new pool-level policies share one idea: a distractor is only a fair question if it is both
 * *plausible* (it shares a written signal) and *distinguishable* (it is not the same amount). The
 * scale-factor set governs which equivalent notations exist at all, the tick helpers make the gap an exact
 * integer comparison on the lane's own axis, and the class check refuses a lane that asks for a relationship
 * its pool never realizes.
 */

function formsOf(lane: LaneConfig, numerator: number, denominator: number): readonly string[] | null {
  const value = laneFamilies(lane).find(
    (family) => family.canonicalNumerator === numerator && family.canonicalDenominator === denominator,
  );
  return value === undefined ? null : value.forms.map((form) => `${form.numerator}/${form.denominator}`);
}

describe("the declared scale-factor set", () => {
  it("defaults to every factor the catalogue affords", () => {
    expect(formsOf(testLane(), 1, 2)).toEqual(["1/2", "2/4", "4/8"]);
  });

  it("restricts the equivalent notations written on top of a value's own form", () => {
    expect(formsOf(testLane({ scaleFactors: [2] }), 1, 2)).toEqual(["1/2", "2/4"]);
    expect(formsOf(testLane({ scaleFactors: [4] }), 1, 2)).toEqual(["1/2", "4/8"]);
    expect(formsOf(testLane({ maxFormsPerFamily: 2, scaleFactors: [2, 4] }), 1, 2)).toEqual(["1/2", "2/4"]);
  });

  it("can thin a pool enough to drop a value that no longer has two authored forms", () => {
    // Scale factor 3 writes no second form of a value over a [2, 4, 8] catalogue, so 1/2 stops being a pair.
    expect(formsOf(testLane({ scaleFactors: [3] }), 1, 2)).toBeNull();
    expect(laneFamilies(testLane({ scaleFactors: [3] }))).toEqual([]);
  });

  it("always keeps the value's own authored form first, and drops a value left with only that form", () => {
    for (const scaleFactors of [[2], [4], [2, 3, 4]]) {
      expect(formsOf(testLane({ scaleFactors }), 1, 2)?.[0], String(scaleFactors)).toBe("1/2");
    }

    // Scale factor 8 writes no second notation of 1/2 over [2, 4, 8], so the value stops being a pair rather
    // than surviving with a single form.
    expect(formsOf(testLane({ scaleFactors: [8] }), 1, 2)).toBeNull();
    expect(formsOf(testLane({ scaleFactors: [2] }), 1, 4)).toEqual(["1/4", "2/8"]);
  });
});

describe("exact axis positions", () => {
  it("places every pool value in whole ticks of the lane's own axis", () => {
    const lane = testLane();
    expect(poolTickPositions(laneFamilies(lane), lane.whole.ticksPerUnit)).toEqual([
      { familyId: "lane-value-1/2", ticks: 4 },
      { familyId: "lane-value-1/4", ticks: 2 },
      { familyId: "lane-value-3/4", ticks: 6 },
    ]);
    expect(minimumPoolTickGap(laneFamilies(lane), 8)).toBe(2);
  });

  it("refuses to place a value the axis cannot carry instead of rounding it", () => {
    expect(poolTickPositions(laneFamilies(testLane()), 6)).toBeNull();
    expect(poolTickPositions(laneFamilies(testLane()), 0)).toBeNull();
    expect(poolTickPositions(laneFamilies(testLane()), 2.5)).toBeNull();
    expect(minimumPoolTickGap(laneFamilies(testLane()), 6)).toBeNull();
  });

  it("reports no gap at all for a pool of one value", () => {
    const single = laneWithCatalogue([2, 4]);
    expect(laneFamilies(single)).toHaveLength(1);
    expect(minimumPoolTickGap(laneFamilies(single), 4)).toBeNull();
  });
});

describe("the declared distractor gap", () => {
  it("must land on an axis tick, because a gap is compared in whole ticks", () => {
    const lane = testLane({ distractorPolicy: { minimumRationalGap: { numerator: 1, denominator: 3 } } });
    expect(validateLaneConfig(lane)).toContain(
      "the declared distractor gap 1/3 cannot be placed on the lane's axis of 8 parts per unit; " +
        "a gap is compared in whole ticks, so its denominator must divide ticksPerUnit",
    );
  });

  it("fails when two pool values sit closer than the gap allows", () => {
    const lane = testLane({ distractorPolicy: { minimumRationalGap: { numerator: 3, denominator: 8 } } });
    expect(validateLaneConfig(lane)).toContain(
      "the pool's closest two values sit 2 tick(s) apart, closer than the declared distractor gap of 3/8 (3 tick(s)); " +
        "widen the catalogue or lower the gap",
    );
  });

  it("accepts a gap the pool actually meets, at the boundary exactly", () => {
    const exact = testLane({ distractorPolicy: { minimumRationalGap: { numerator: 1, denominator: 4 } } });
    expect(validateLaneConfig(exact)).toEqual([]);

    const loose = testLane({ distractorPolicy: { minimumRationalGap: { numerator: 0, denominator: 1 } } });
    expect(validateLaneConfig(loose)).toEqual([]);
  });
});

describe("the declared distractor classes", () => {
  it("accepts a lane that asks only for relationships its pool realizes", () => {
    const lane = testLane({
      distractorPolicy: { families: ["same-numerator", "same-denominator"] },
    });
    expect(validateLaneConfig(lane)).toEqual([]);
  });

  it("refuses a lane that asks for a class the pool never realizes", () => {
    // A `[2, 4]` catalogue yields one usable value, so the pool has no near-miss link of any class.
    const lane = laneWithCatalogue([2, 4], { distractorPolicy: { families: ["same-denominator"] } });
    const problems = validateLaneConfig(lane);

    expect(problems).toContain(
      "the pool never realizes the declared distractor class(es) same-denominator; it only realizes none. " +
        "Add a denominator whose values share the missing signal",
    );
  });
});
