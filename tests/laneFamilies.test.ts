import { describe, expect, it } from "vitest";

import {
  dealtNearMissLinks,
  familiesWithoutNearMissLinks,
  laneEquivalenceFamilies,
  laneFamilies,
  laneNumerators,
  nearMissLinks,
  nearMissSignals,
  type LaneFamily,
} from "../src/lanes";
import { testLane } from "./laneTestFixtures";

/**
 * The pool is where a lane's content becomes data. Two rules matter and are asserted here: a value is
 * derived with the engine's own rational arithmetic (never with local arithmetic or string keys), and a
 * value with a single authored form stays out of the pool because its two cards would be the same picture.
 */

function poolLabels(denominatorCatalogue: readonly number[], maxFormsPerFamily?: number): readonly string[] {
  const lane = testLane({ denominatorCatalogue, ...(maxFormsPerFamily === undefined ? {} : { maxFormsPerFamily }) });
  return laneFamilies(lane).map((family) => `${family.canonicalNumerator}/${family.canonicalDenominator}`);
}

describe("lane numerator policy", () => {
  it("offers the proper numerators by default", () => {
    expect(laneNumerators(testLane(), 4)).toEqual([1, 2, 3]);
    expect(laneNumerators(testLane({ numeratorPolicy: undefined }), 2)).toEqual([1]);
  });

  it("adds zero, the whole and improper numerators only when the lane asks", () => {
    expect(laneNumerators(testLane({ numeratorPolicy: { allowZero: true } }), 4)).toEqual([0, 1, 2, 3]);
    expect(laneNumerators(testLane({ numeratorPolicy: { allowWhole: true } }), 4)).toEqual([1, 2, 3, 4]);
    // `allowImproper` adds the largest range that stays inside two wholes, and it does not add the whole
    // itself: `d/d` is the `allowWhole` policy's business.
    expect(laneNumerators(testLane({ numeratorPolicy: { allowImproper: true } }), 3)).toEqual([1, 2, 4, 5]);
    expect(laneNumerators(testLane({ numeratorPolicy: { allowWhole: true, allowImproper: true } }), 3)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      laneNumerators(testLane({ numeratorPolicy: { allowZero: true, allowWhole: true, allowImproper: true } }), 2),
    ).toEqual([0, 1, 2, 3]);
  });
});

describe("the lane pool", () => {
  it("derives every value from the catalogue, with its authored forms in catalogue order", () => {
    const pool = laneFamilies(testLane());

    expect(poolLabels([2, 4, 8])).toEqual(["1/2", "1/4", "3/4"]);
    expect(pool[0]).toEqual({
      familyId: "lane-value-1/2",
      canonicalNumerator: 1,
      canonicalDenominator: 2,
      // Ascending denominators, capped at the default three forms.
      forms: [
        { numerator: 1, denominator: 2 },
        { numerator: 2, denominator: 4 },
        { numerator: 4, denominator: 8 },
      ],
    });
    expect(pool[1]!.forms).toEqual([
      { numerator: 1, denominator: 4 },
      { numerator: 2, denominator: 8 },
    ]);
    expect(pool[2]!.forms).toEqual([
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 8 },
    ]);
  });

  it("treats equivalent authored forms as one value, not two", () => {
    const labels = poolLabels([2, 4, 8, 16]);
    expect(labels).not.toContain("2/4");
    expect(labels).not.toContain("4/8");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("leaves out a value whose catalogue can only write it one way", () => {
    // 1/8 and 7/8 exist in the catalogue but have exactly one authored form each, so neither can be a pair.
    const pool = poolLabels([2, 4, 8]);
    expect(pool).not.toContain("1/8");
    expect(pool).not.toContain("7/8");
    expect(pool).toContain("1/4");
  });

  it("honours the lane's form limit", () => {
    expect(poolLabels([2, 4, 8], 2)).toEqual(["1/2", "1/4", "3/4"]);
    expect(laneFamilies(testLane({ denominatorCatalogue: [2, 4, 8], maxFormsPerFamily: 2 }))[0]!.forms).toEqual([
      { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 4 },
    ]);
  });

  it("sorts and de-duplicates the catalogue before deriving anything", () => {
    // The same catalogue written in a different order is the same lane.
    const sorted = laneFamilies(testLane({ denominatorCatalogue: [2, 4, 8] }));
    const shuffled = laneFamilies(testLane({ denominatorCatalogue: [8, 2, 4] }));

    expect(shuffled).toStrictEqual(sorted);
    expect(poolLabels([8, 8, 4, 2])).toEqual(["1/2", "1/4", "3/4"]);
  });

  it("ignores catalogue entries that are not usable denominators", () => {
    expect(poolLabels([2, 4, 0, 1, 2.5, 8])).toEqual(["1/2", "1/4", "3/4"]);
  });

  it("includes values at or above one whole only when the policy allows them", () => {
    const allowed = laneFamilies(
      testLane({ denominatorCatalogue: [2, 4], numeratorPolicy: { allowWhole: true, allowImproper: true } }),
    );
    const labels = allowed.map((family) => `${family.canonicalNumerator}/${family.canonicalDenominator}`);
    // Quarters drop out at this catalogue size because each of them has only one authored form, while
    // halves and the values above one whole have two each.
    expect(labels).toEqual(["1/2", "1/1", "3/2"]);
    expect(allowed.find((family) => family.familyId === "lane-value-1/1")!.forms).toEqual([
      { numerator: 2, denominator: 2 },
      { numerator: 4, denominator: 4 },
    ]);
  });

  it("hands the engine the pool in the engine's own shape", () => {
    const lane = testLane();
    const families = laneEquivalenceFamilies(lane);
    expect(families).toStrictEqual(
      laneFamilies(lane).map((family) => ({ familyId: family.familyId, forms: family.forms })),
    );
  });
});

describe("near-miss links", () => {
  it("collects the authored signals a value shows on its face, sorted and unique", () => {
    const pool = laneFamilies(testLane());
    expect(nearMissSignals(pool[0]!)).toEqual(["d:2", "d:4", "d:8", "n:1", "n:2", "n:4"]);
    expect(nearMissSignals(pool[1]!)).toEqual(["d:4", "d:8", "n:1", "n:2"]);
  });

  it("classifies every link a pool contains, with the signals that justify it", () => {
    const links = nearMissLinks(laneFamilies(testLane()));

    expect(links.map((link) => [link.leftFamilyId, link.rightFamilyId, link.kind])).toEqual([
      ["lane-value-1/2", "lane-value-1/4", "same-numerator-and-denominator"],
      ["lane-value-1/2", "lane-value-3/4", "same-denominator"],
      ["lane-value-1/4", "lane-value-3/4", "same-denominator"],
    ]);
    expect(links[0]!.sharedSignals).toEqual(["d:4", "d:8", "n:1", "n:2"]);
    expect(links[1]!.sharedSignals).toEqual(["d:4", "d:8"]);
  });

  it("finds a pure same-numerator link when a form limit hides the shared denominator", () => {
    // Both values share the numerator 2; neither reaches 1/2 or 3/4's shared denominators because each value
    // stops at its first two authored forms.
    const links = nearMissLinks(laneFamilies(testLane({ denominatorCatalogue: [2, 3, 4, 6], maxFormsPerFamily: 2 })));
    const kinds = new Set(links.map((link) => link.kind));

    expect(kinds).toContain("same-numerator");
    const numeratorLink = links.find((link) => link.kind === "same-numerator")!;
    expect(numeratorLink.sharedSignals.every((signal) => signal.startsWith("n:"))).toBe(true);
  });

  it("reports a value that shares nothing with any other value in the pool", () => {
    // A shape a valid lane cannot easily produce, which is exactly why validation reports rather than
    // assumes: the isolated value would be a random quiz answer with no plausible distractors.
    const isolated: LaneFamily = {
      familyId: "lane-value-9/7",
      canonicalNumerator: 9,
      canonicalDenominator: 7,
      forms: [
        { numerator: 9, denominator: 7 },
        { numerator: 18, denominator: 14 },
      ],
    };
    const pool = laneFamilies(testLane());

    expect(familiesWithoutNearMissLinks([...pool, isolated])).toEqual(["lane-value-9/7"]);
    expect(familiesWithoutNearMissLinks(pool)).toEqual([]);
    expect(nearMissLinks([...pool, isolated])).toHaveLength(3);
  });

  it("reports the links between the values a board actually dealt", () => {
    const pool = laneFamilies(testLane());
    const all = nearMissLinks(pool);

    expect(dealtNearMissLinks(["lane-value-1/2", "lane-value-1/4"], pool)).toEqual([all[0]]);
    expect(dealtNearMissLinks(["lane-value-1/2"], pool)).toEqual([]);
    expect(dealtNearMissLinks([], pool)).toEqual([]);
    // An id the pool does not contain is simply not a dealt link.
    expect(dealtNearMissLinks(["lane-value-9/9"], pool)).toEqual([]);
    expect(dealtNearMissLinks(["lane-value-1/2", "lane-value-1/4", "lane-value-3/4"], pool)).toEqual(all);
  });
});
