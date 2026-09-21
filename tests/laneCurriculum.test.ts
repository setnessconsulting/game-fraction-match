import { describe, expect, it } from "vitest";

import {
  CURRICULUM_CLAIMS,
  CURRICULUM_MAP,
  GRADE_BAND_DENOMINATOR_CATALOGUES,
  HUNDRED_PART_DENOMINATOR,
  curriculumLanes,
  curriculumLineFor,
  curriculumLineProblems,
  curriculumProblems,
  gradeBandDenominatorProblems,
  isSatisfiableLane,
  laneHundredPartGridProblems,
  validateLaneConfig,
  type CurriculumLine,
  type GradeBand,
  type LaneConfig,
} from "../src/lanes";
import { laneWithCatalogue, laneWithMix, testLane } from "./laneTestFixtures";

/**
 * The curriculum map is a claim, so it is tested like one: the catalogues are pinned to the story's exact
 * sets, every shipped lane must survive the lane layer's own validation, and the two rules that keep the
 * claims honest — the grade-band catalogue and the denominator-100 rule — are each shown failing on input
 * that breaks them.
 */

describe("the checked-in curriculum map", () => {
  it("is internally honest and ships all three grade bands", () => {
    expect(curriculumProblems()).toEqual([]);
    expect(CURRICULUM_MAP.map((line) => line.gradeBand)).toEqual(["grade-3", "grade-4", "grade-5"]);
    expect(CURRICULUM_CLAIMS).toEqual(["primary", "supporting", "review-only"]);
  });

  it("pins the story's exact denominator catalogues", () => {
    expect(GRADE_BAND_DENOMINATOR_CATALOGUES["grade-3"]).toEqual([2, 3, 4, 6, 8]);
    expect(GRADE_BAND_DENOMINATOR_CATALOGUES["grade-4"]).toEqual([2, 3, 4, 5, 6, 8, 10, 12, 100]);
    // Grade 5 adds no denominator of its own; it reuses the union of grades 3 and 4.
    expect(GRADE_BAND_DENOMINATOR_CATALOGUES["grade-5"]).toEqual([...GRADE_BAND_DENOMINATOR_CATALOGUES["grade-4"]]);
    expect(HUNDRED_PART_DENOMINATOR).toBe(100);
  });

  it("publishes every shipped lane as a satisfiable lane on its own terms", () => {
    const lanes = curriculumLanes();
    expect(lanes.length).toBeGreaterThanOrEqual(3);
    for (const lane of lanes) {
      expect(validateLaneConfig(lane), lane.laneId).toEqual([]);
      expect(isSatisfiableLane(lane), lane.laneId).toBe(true);
    }
  });

  it("distinguishes primary, supporting and review-only claims exactly", () => {
    const claimsOf = (band: GradeBand) =>
      (curriculumLineFor(band)?.standards ?? []).map((standard) => `${standard.code}:${standard.claim}`);

    expect(claimsOf("grade-3")).toEqual([
      "3.NF.A.2:primary",
      "3.NF.A.3a:primary",
      "3.NF.A.3b:primary",
      "3.NF.A.3c:primary",
    ]);
    expect(claimsOf("grade-4")).toEqual(["4.NF.A.1:primary", "4.NF.A.2:supporting"]);
    // Review-only: the game does not add, subtract, multiply or divide fractions, so nothing here is a
    // primary claim about grade-5 operations.
    expect(claimsOf("grade-5")).toEqual([
      "5.NF.A.1:review-only",
      "5.NF.A.2:review-only",
      "5.NF.B.5b:review-only",
    ]);
    // Grade 5 is the one band whose claims are all review-only: it supports prerequisite content without
    // claiming to teach or assess grade-5 operations.
    expect(curriculumLineForKey("grade-5").standards.every((standard) => standard.claim === "review-only")).toBe(true);
    for (const band of ["grade-3", "grade-4"] as const) {
      expect(curriculumLineForKey(band).standards.some((standard) => standard.claim === "primary")).toBe(true);
    }
  });

  it("states its exclusions and keeps them attached to the grade they limit", () => {
    for (const line of CURRICULUM_MAP) {
      expect(line.exclusions.length, line.gradeBand).toBeGreaterThan(0);
    }
    expect(curriculumLineFor("grade-5")!.exclusions.join(" ")).toContain("does not add, subtract, multiply or divide fractions");
    expect(curriculumLineFor("grade-4")!.exclusions.join(" ")).toContain("never drawn as a 100-part card grid");
    expect(curriculumLineForKey("grade-3").exclusions.join(" ")).toContain("no denominator outside 2, 3, 4, 6 and 8");
  });

  it("keeps each band's declared families equal to what its lanes actually ship", () => {
    for (const line of CURRICULUM_MAP) {
      const shipped = new Set(line.lanes.flatMap((lane) => lane.representationMix.map((candidate) => candidate.family)));
      expect([...shipped].sort(), line.gradeBand).toEqual([...line.representationFamilies].sort());
    }
    // Grade 3 is the only band that can offer the number line, because only its narrow lane has an axis
    // coarse enough to stay legible.
    expect(curriculumLineFor("grade-3")!.representationFamilies).toContain("number-line");
  });
});

function curriculumLineForKey(band: GradeBand): CurriculumLine {
  const line = curriculumLineFor(band);
  if (line === null) throw new Error(`no curriculum line for ${band}`);
  return line;
}

describe("the grade-band denominator rule", () => {
  it("refuses a ninth at grade 3 and a 1000th at grade 4", () => {
    expect(gradeBandDenominatorProblems(testLane({ gradeBand: "grade-3", denominatorCatalogue: [2, 9] }))).toEqual([
      "denominatorCatalogue[1] is 9, outside the published grade-3 catalogue [2,3,4,6,8]",
    ]);    expect(gradeBandDenominatorProblems(testLane({ gradeBand: "grade-4", denominatorCatalogue: [2, 1000] }))[0],
    ).toContain("outside the published grade-4 catalogue");

    // A lane that is not an object, holds no catalogue array, or carries a band the map never publishes
    // cannot be judged against a catalogue, so the rule stays silent instead of inventing a problem.
    expect(gradeBandDenominatorProblems(undefined as unknown as LaneConfig)).toEqual([]);
    expect(
      gradeBandDenominatorProblems(testLane({ denominatorCatalogue: "eighths" as unknown as readonly number[] })),
    ).toEqual([]);
    expect(gradeBandDenominatorProblems(testLane({ gradeBand: "grade-9" as unknown as GradeBand }))).toEqual([]);

    // The published catalogues themselves are accepted verbatim.
    expect(gradeBandDenominatorProblems(testLane({ gradeBand: "grade-3", denominatorCatalogue: [2, 3, 4, 6, 8] }))).toEqual([]);
    expect(
      gradeBandDenominatorProblems(testLane({ gradeBand: "grade-4", denominatorCatalogue: [2, 3, 4, 5, 6, 8, 10, 12, 100] })),
    ).toEqual([]);
  });

  it("leaves the neutral fixture lanes alone, because they make no standards claim", () => {
    // A grade label on a fixture is an ordering hint, not a curriculum statement, so the rule is only
    // binding through the map. That is the documented reason it is not part of `validateLaneConfig`.
    const fixture = laneWithCatalogue([2, 4, 8, 16], {
      gradeBand: "grade-3",
      whole: { ...testLane().whole, setTotalObjectCount: 16, ticksPerUnit: 16 },
    });

    expect(gradeBandDenominatorProblems(fixture)).toEqual([
      "denominatorCatalogue[3] is 16, outside the published grade-3 catalogue [2,3,4,6,8]",
    ]);
    expect(validateLaneConfig(fixture).some((problem) => problem.includes("outside the published"))).toBe(false);
  });
});

describe("the denominator-100 rule", () => {
  it("refuses a family that could still draw a hundred-part grid", () => {
    const lane = laneWithCatalogue([2, 100], {
      representationMix: [{ family: "bar" }, { family: "symbolic" }],
      whole: { ...testLane().whole, setTotalObjectCount: 100, ticksPerUnit: 100 },
    });

    expect(laneHundredPartGridProblems(lane)).toEqual([
      "representationMix[0] offers bar to a catalogue containing 100, but that family can still be asked for 100 partitions; " +
        "a hundredth must resolve to a symbolic or number-line treatment rather than a 100-part card grid",
    ]);
    expect(validateLaneConfig(lane).some((problem) => problem.includes("100-part card grid"))).toBe(true);
  });

  it("accepts a capped visual family and exempts the families that draw no grid", () => {
    const base = testLane().whole;

    const capped = laneWithCatalogue([2, 100], {
      representationMix: [{ family: "bar", maxPartitionCount: 12 }, { family: "symbolic" }],
      whole: { ...base, setTotalObjectCount: 100, ticksPerUnit: 100 },
    });
    expect(laneHundredPartGridProblems(capped)).toEqual([]);

    const exempt = laneWithCatalogue([2, 100], {
      representationMix: [{ family: "number-line" }, { family: "symbolic" }],
      whole: { ...base, setTotalObjectCount: 100, ticksPerUnit: 100 },
    });
    expect(laneHundredPartGridProblems(exempt)).toEqual([]);
  });

  it("does not fire for a catalogue without 100", () => {
    expect(laneHundredPartGridProblems(laneWithMix([{ family: "bar" }, { family: "symbolic" }]))).toEqual([]);
    expect(laneHundredPartGridProblems({} as unknown as ReturnType<typeof testLane>)).toEqual([]);
  });

  it("is satisfied by the shipped grade-4 and grade-5 lanes", () => {
    for (const band of ["grade-4", "grade-5"] as const) {
      for (const lane of curriculumLineForKey(band).lanes) {
        expect(laneHundredPartGridProblems(lane), lane.laneId).toEqual([]);
      }
    }
  });
});

describe("curriculum line validation", () => {
  const honest = curriculumLineForKey("grade-4");

  it("reports a line that claims nothing, ships nothing or states no limit", () => {
    expect(
      curriculumLineProblems({
        ...honest,
        title: " ",
        standards: [],
        exclusions: [],
        lanes: [],
        representationFamilies: [],
      }),
    ).toEqual([
      "curriculum line title must be a non-empty string",
      "curriculum line for grade-4 names no standard",
      "curriculum line for grade-4 states no exclusion",
      "curriculum line for grade-4 ships no lane",
    ]);
  });

  it("reports duplicate lane ids, grade drift and a family claim that is not shipped", () => {
    const problems = curriculumLineProblems({
      ...honest,
      lanes: [honest.lanes[0]!, honest.lanes[0]!],
      representationFamilies: ["bar", "circle", "symbolic", "set"],
    });

    expect(problems.some((problem) => problem.includes('repeats laneId "g4-equivalent-fractions-full-catalogue"'))).toBe(true);
    expect(problems.some((problem) => problem.includes("but its lanes ship [bar, circle, symbolic]"))).toBe(true);

    const drifted = curriculumLineProblems({
      ...honest,
      lanes: [{ ...honest.lanes[0]!, gradeBand: "grade-5" }],
    });
    expect(drifted.some((problem) => problem.includes("declares gradeBand grade-5, but its line is grade-4"))).toBe(true);
  });

  it("reports a repeated standard code and an unknown claim", () => {
    const duplicated = curriculumLineProblems({
      ...honest,
      standards: [
        { code: "4.NF.A.2", claim: "supporting" },
        { code: "4.NF.A.2", claim: "supporting" },
      ],
    });
    expect(duplicated).toContain('standards[1] repeats standard code "4.NF.A.2"');

    const badClaim = curriculumLineProblems({
      ...honest,
      standards: [{ code: "4.NF.A.1", claim: "mastered" as unknown as "primary" }],
    });
    expect(badClaim).toContain(
      "standards[0] must claim one of primary, supporting, review-only; received mastered",
    );
  });

  it("refuses to claim another grade's standard as primary or supporting", () => {
    const inflated = curriculumLineProblems({
      ...honest,
      standards: [
        { code: "5.NF.B.5b", claim: "supporting" },
        { code: "4.NF.A.1", claim: "primary" },
      ],
    });
    expect(inflated).toContain(
      "standards[0] claims 5.NF.B.5b as supporting, but that is not a grade-4 standard; another grade's standard may only be claimed review-only",
    );

    // The review-only escape hatch is the documented way to reference another band's standard.
    const reviewOnly = curriculumLineProblems({
      ...honest,
      standards: [
        { code: "5.NF.B.5b", claim: "review-only" },
        { code: "4.NF.A.1", claim: "primary" },
      ],
    });
    expect(reviewOnly).toEqual([]);
  });

  it("answers null for a band the map does not ship", () => {
    expect(curriculumLineFor("grade-9" as unknown as GradeBand)).toBeNull();
    for (const band of ["grade-3", "grade-4", "grade-5"] as const) {
      expect(curriculumLineFor(band)?.gradeBand, band).toBe(band);
    }
  });

  it("requires a curriculum line to be an object at all", () => {
    expect(curriculumLineProblems(null as unknown as CurriculumLine)).toEqual(["curriculum line must be an object"]);
  });

  it("reports a standard with no code, a lane that is not an object, and lanes the layer refuses", () => {
    const line = curriculumLineForKey("grade-4");
    const problems = curriculumLineProblems({
      ...line,
      standards: [
        { code: "  ", claim: "primary" },
        { code: "4.NF.A.1", claim: "primary" },
      ],
      lanes: [
        null as unknown as LaneConfig,
        { ...line.lanes[0]!, pairCount: 99 },
        laneWithCatalogue([2, 16], { gradeBand: "grade-4", pairCount: 2 }),
      ],
    });

    expect(problems).toContain("standards[0] must name a non-empty standard code");
    expect(problems).toContain("lanes[0] must be a lane");
    expect(problems.some((problem) => problem.includes("lanes[1]") && problem.includes("pairCount must be within"))).toBe(true);
    expect(
      problems.some(
        (problem) => problem.includes("lanes[2]") && problem.includes("outside the published grade-4 catalogue"),
      ),
    ).toBe(true);
  });

  it("reports a band the map does not publish and a repeated band in the map", () => {
    expect(curriculumProblems([{ ...honest, gradeBand: "grade-9" as unknown as GradeBand }])).toEqual([
      "grade-9: curriculum line declares an unknown grade band grade-9",
      "grade-9: standards[0] claims 4.NF.A.1 as primary, but that is not a grade-9 standard; another grade's standard may only be claimed review-only",
      "grade-9: standards[1] claims 4.NF.A.2 as supporting, but that is not a grade-9 standard; another grade's standard may only be claimed review-only",
      'grade-9: lanes[0] ("g4-equivalent-fractions-full-catalogue") declares gradeBand grade-4, but its line is grade-9',
    ]);
    expect(curriculumProblems([honest, honest]).some((problem) => problem.includes("repeats grade band grade-4"))).toBe(true);
  });
});
