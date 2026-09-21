import { describe, expect, it } from "vitest";

import { REPRESENTATION_FAMILIES, type RepresentationFamily } from "../src/representations";
import { laneCoverageReport } from "../src/lanes";
import { laneWithCatalogue, laneWithMix, testLane } from "./laneTestFixtures";

/**
 * Coverage is measured per **authored form**, because that is what a card draws: `1/8` and `2/16` are the
 * same quantity but not the same picture. These tests pin both halves of that: every form is measured, and
 * the two rules that come out of it (at least one legible family, two when a pair must differ) are reported
 * as lane validity problems rather than discovered mid-board.
 */

describe("lane coverage", () => {
  it("measures every authored form in the pool, with its canonical value", () => {
    const report = laneCoverageReport(testLane());

    expect(report.forms.map((form) => form.label)).toEqual(["1/2", "2/4", "4/8", "1/4", "2/8", "3/4", "6/8"]);
    expect(report.forms.map((form) => form.canonicalLabel)).toEqual([
      "1/2",
      "1/2",
      "1/2",
      "1/4",
      "1/4",
      "3/4",
      "3/4",
    ]);
    expect(report.forms.every((form) => form.familyId.startsWith("lane-value-"))).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("counts how many forms each family could draw on its own", () => {
    const report = laneCoverageReport(testLane());

    expect(Object.keys(report.familyFormCounts).sort()).toEqual([...REPRESENTATION_FAMILIES].sort());
    // A family the lane's mix does not offer draws nothing, which is different from being refused.
    expect(report.familyFormCounts["number-line"]).toBe(0);
    expect(report.familyFormCounts.set).toBe(0);
    expect(report.familyFormCounts.bar).toBe(report.forms.length);
    expect(report.familyFormCounts.circle).toBe(report.forms.length);
    expect(report.familyFormCounts.symbolic).toBe(report.forms.length);

    // The collection holds eight objects, so every form of the pool divides it exactly.
    const withSet = laneCoverageReport(laneWithMix([{ family: "set" }, { family: "symbolic" }]));
    expect(withSet.familyFormCounts.set).toBe(withSet.forms.length);
    expect(withSet.problems).toEqual([]);
  });

  it("reports a form that no family in the mix can draw at this card size", () => {
    // Sixteenths at 96 px: the bar is capped at 12 partitions and the axis is too fine.
    const report = laneCoverageReport(
      laneWithMix(
        [
          { family: "bar", maxPartitionCount: 12 },
          { family: "number-line" },
        ],
        {
          denominatorCatalogue: [2, 4, 8, 16],
          whole: { ...testLane().whole, setTotalObjectCount: 16, ticksPerUnit: 16 },
        },
      ),
    );

    const sixteenth = report.forms.find((form) => form.label === "4/16")!;
    expect(sixteenth.legibleFamilies).toEqual([]);
    expect(sixteenth.rejections.map((rejection) => rejection.family)).toEqual(["bar", "number-line"]);
    expect(sixteenth.rejections[0]!.problems[0]).toBe(
      "bar would need 16 partitions, above this lane's declared maxPartitionCount of 12",
    );
    expect(sixteenth.rejections[1]!.problems[0]).toContain("ticks would sit");

    const problem = report.problems.find((entry) => entry.includes("the form 4/16 (1/4) at 96x96 px"))!;
    expect(problem).toContain("has no legible representation in this mix");
    expect(problem).toContain("bar: bar would need 16 partitions");
    expect(problem).toContain("number-line: number-line ticks would sit 5.50px apart");
  });

  it("reports a form with only one legible family when the lane insists on two pictures per pair", () => {
    const report = laneCoverageReport(laneWithMix([{ family: "symbolic" }]));

    expect(report.problems.length).toBe(report.forms.length);
    expect(report.problems[0]).toContain("has only one legible family (symbolic)");
    expect(report.problems[0]).toContain("set requireDistinctRepresentationPerPair to false");
  });

  it("accepts a single legible family when the lane lowers that requirement", () => {
    const report = laneCoverageReport(
      laneWithMix([{ family: "symbolic" }], { requireDistinctRepresentationPerPair: false }),
    );
    expect(report.problems).toEqual([]);
    expect(report.forms.every((form) => form.legibleFamilies.length >= 1)).toBe(true);
  });

  it("records a family that cannot express a value as a rejection, with the contract's wording", () => {
    // A set model can show the whole collection but not a value above one whole, and that must not abort
    // the report: coverage exists to explain, not to throw.
    const report = laneCoverageReport(
      laneWithCatalogue([2, 4], {
        numeratorPolicy: { allowWhole: true, allowImproper: true },
        representationMix: [{ family: "set" }, { family: "symbolic" }],
        requireDistinctRepresentationPerPair: false,
      }),
    );

    const whole = report.forms.find((form) => form.label === "2/2")!;
    expect(whole.legibleFamilies).toEqual(["set", "symbolic"]);
    expect(whole.rejections).toEqual([]);

    const aboveWhole = report.forms.find((form) => form.label === "3/2")!;
    expect(aboveWhole.legibleFamilies).toEqual(["symbolic"]);
    expect(aboveWhole.rejections).toHaveLength(1);
    expect(aboveWhole.rejections[0]!.family).toBe("set");
    expect(aboveWhole.rejections[0]!.problems.join(" ")).toContain("whole");
    expect(report.problems).toEqual([]);
  });

  it("states a reason for every rejection it records", () => {
    const report = laneCoverageReport(laneWithMix([{ family: "symbolic" }]));
    expect(report.forms.length).toBeGreaterThan(0);
    for (const form of report.forms) {
      for (const rejection of form.rejections) {
        expect(rejection.problems.length).toBeGreaterThan(0);
      }
    }
  });

  it("rethrows a failure that is not the contract's own refusal, rather than mislabelling it", () => {
    // An unknown family name is not a legibility judgement: there is no geometry to measure, so the report
    // must fail loudly instead of recording a rejection it cannot explain. This is the reason the catch only
    // absorbs `RepresentationContractError`.
    const lane = laneWithMix([{ family: "spiral" as unknown as RepresentationFamily }], {
      requireDistinctRepresentationPerPair: false,
    });

    expect(() => laneCoverageReport(lane)).toThrow(TypeError);
    expect(() => laneCoverageReport(lane)).not.toThrow(/rejected without a reason/);
  });
});
