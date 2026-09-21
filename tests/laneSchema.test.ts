import { describe, expect, it } from "vitest";

import { MAX_PAIR_COUNT, MIN_PAIR_COUNT } from "../src/engine";
import {
  DEFAULT_MAX_FORMS_PER_FAMILY,
  GRADE_BANDS,
  LANE_MAX_DENOMINATOR,
  LANE_MIN_DENOMINATOR,
  LaneConfigError,
  assertValidLane,
  isSatisfiableLane,
  laneIndexAfter,
  laneIndexBefore,
  laneProgress,
  laneSequenceProblems,
  laneStructureProblems,
  validateLaneConfig,
  type LaneConfig,
  type LaneSequence,
} from "../src/lanes";
import type { RepresentationCandidate, RepresentationFamily } from "../src/representations";
import { TEST_LANE_BOX, laneWithCatalogue, laneWithMix, testLane } from "./laneTestFixtures";

/**
 * Structural validation is the first of the four questions a lane must answer, and the only one that can
 * stop the audit early: a lane whose own shape is wrong cannot be measured for wholes, pool or coverage.
 * These tests therefore assert both the findings and the *order* in which the findings arrive.
 */

describe("lane structure", () => {
  it("accepts the base lane and states its declared bounds", () => {
    expect(laneStructureProblems(testLane())).toEqual([]);
    expect(GRADE_BANDS).toEqual(["grade-3", "grade-4", "grade-5"]);
    expect(LANE_MIN_DENOMINATOR).toBe(2);
    expect(LANE_MAX_DENOMINATOR).toBe(1000);
    expect(DEFAULT_MAX_FORMS_PER_FAMILY).toBe(3);
  });

  it("rejects a non-object lane", () => {
    expect(laneStructureProblems(undefined as unknown as LaneConfig)).toEqual([
      "lane must be an object; received undefined",
    ]);
    expect(laneStructureProblems(null as unknown as LaneConfig)).toEqual(["lane must be an object; received null"]);
  });

  it("requires identity, title and a known grade band", () => {
    const problems = laneStructureProblems(
      testLane({ laneId: "   ", title: "", gradeBand: "grade-9" as unknown as LaneConfig["gradeBand"] }),
    );
    expect(problems).toEqual([
      "laneId must be a non-empty string; received string",
      "title must be a non-empty string; received string",
      "gradeBand must be one of grade-3, grade-4, grade-5; received string",
    ]);
  });

  it("bounds the pair count to the engine's own range", () => {
    const tooSmall = testLane({ pairCount: MIN_PAIR_COUNT - 1 });
    const tooLarge = testLane({ pairCount: MAX_PAIR_COUNT + 1 });
    const notAnInteger = testLane({ pairCount: 2.5 });

    expect(laneStructureProblems(tooSmall)[0]).toBe(`pairCount must be within ${MIN_PAIR_COUNT}..${MAX_PAIR_COUNT}; received 1`);
    expect(laneStructureProblems(tooLarge)[0]).toBe(
      `pairCount must be within ${MIN_PAIR_COUNT}..${MAX_PAIR_COUNT}; received ${MAX_PAIR_COUNT + 1}`,
    );
    expect(laneStructureProblems(notAnInteger)[0]).toBe("pairCount must be a safe integer; received 2.5");
  });

  it("requires a positive finite card box", () => {
    const problems = laneStructureProblems(
      testLane({ cardBox: { width: 0, height: Number.POSITIVE_INFINITY } }),
    );
    expect(problems).toEqual([
      "cardBox width must be a positive finite number; received 0",
      "cardBox height must be a positive finite number; received Infinity",
    ]);

    expect(laneStructureProblems(testLane({ cardBox: undefined as unknown as LaneConfig["cardBox"] }))).toEqual([
      "cardBox must be an object; received undefined",
    ]);
  });

  it("checks every catalogue denominator for range, type and duplication", () => {
    expect(laneStructureProblems(laneWithCatalogue(undefined as unknown as readonly number[]))).toEqual([
      "denominatorCatalogue must be an array; received undefined",
    ]);
    expect(laneStructureProblems(laneWithCatalogue([]))).toEqual([
      "denominatorCatalogue must contain at least one denominator",
    ]);

    const problems = laneStructureProblems(
      laneWithCatalogue([2, 2, 1, LANE_MAX_DENOMINATOR + 1, 4.5]),
    );
    expect(problems).toEqual([
      `denominatorCatalogue[1] duplicates denominator 2`,
      `denominatorCatalogue[2] must be within ${LANE_MIN_DENOMINATOR}..${LANE_MAX_DENOMINATOR}; received 1`,
      `denominatorCatalogue[3] must be within ${LANE_MIN_DENOMINATOR}..${LANE_MAX_DENOMINATOR}; received ${
        LANE_MAX_DENOMINATOR + 1
      }`,
      "denominatorCatalogue[4] must be a safe integer; received 4.5",
    ]);
  });

  it("requires the numerator policy to be booleans when supplied", () => {
    expect(laneStructureProblems(testLane({ numeratorPolicy: "wide" as unknown as LaneConfig["numeratorPolicy"] }))).toEqual([
      "numeratorPolicy must be an object; received string",
    ]);
    expect(
      laneStructureProblems(testLane({ numeratorPolicy: { allowZero: 1 as unknown as boolean } })),
    ).toEqual(["numeratorPolicy.allowZero must be a boolean; received 1"]);
    expect(laneStructureProblems(testLane({ numeratorPolicy: undefined }))).toEqual([]);
  });

  it("requires a form limit of at least two, because one form is not a pair", () => {
    expect(laneStructureProblems(testLane({ maxFormsPerFamily: 1 }))).toEqual([
      "maxFormsPerFamily must be an integer of at least 2; received 1",
    ]);
    expect(laneStructureProblems(testLane({ maxFormsPerFamily: 4 }))).toEqual([]);
  });

  it("requires the distinct-representation flag to be a boolean when supplied", () => {
    expect(
      laneStructureProblems(testLane({ requireDistinctRepresentationPerPair: "yes" as unknown as boolean })),
    ).toEqual(["requireDistinctRepresentationPerPair must be a boolean; received string"]);
    expect(laneStructureProblems(testLane({ requireDistinctRepresentationPerPair: false }))).toEqual([]);
  });

  it("requires at least one family and an unambiguous preference order", () => {
    expect(laneStructureProblems(laneWithMix(undefined as unknown as LaneConfig["representationMix"]))).toEqual([
      "representationMix must be an array; received undefined",
    ]);
    expect(laneStructureProblems(laneWithMix([]))).toEqual(["representationMix must contain at least one family"]);

    const problems = laneStructureProblems(
      laneWithMix([
        { family: "bar" },
        { family: "bar" },
        { child: "nope" } as unknown as RepresentationCandidate,
        { family: "" as RepresentationFamily },
        { family: "circle", maxPartitionCount: 0 },
      ]),
    );
    expect(problems).toEqual([
      'representationMix[1] repeats the family "bar"; preference order must be unambiguous',
      "representationMix[2].family must be a non-empty string; received undefined",
      "representationMix[3].family must be a non-empty string; received string",
      "representationMix[4].maxPartitionCount must be a positive integer; received 0",
    ]);
  });

  it("requires the whole declaration's identity, collection, axis and domain", () => {
    expect(laneStructureProblems(testLane({ whole: undefined as unknown as LaneConfig["whole"] }))).toEqual([
      "whole must be an object; received undefined",
    ]);

    const problems = laneStructureProblems(
      testLane({
        whole: {
          continuousWholeId: "",
          continuousWholeDescription: "  ",
          axisId: "",
          setTotalObjectCount: 0,
          ticksPerUnit: -4,
          setWholeId: 7 as unknown as string,
          setWholeDescription: null as unknown as string,
          numberLineWholeDescription: 1 as unknown as string,
          domainStart: 2,
          domainEnd: 2,
        },
      }),
    );
    expect(problems).toEqual([
      "whole.continuousWholeId must be a non-empty string; received string",
      "whole.continuousWholeDescription must be a non-empty string; received string",
      "whole.axisId must be a non-empty string; received string",
      "whole.setWholeId must be a non-empty string when supplied; received 7",
      "whole.setWholeDescription must be a non-empty string when supplied; received null",
      "whole.numberLineWholeDescription must be a non-empty string when supplied; received 1",
      "whole.setTotalObjectCount must be a positive integer; received 0",
      "whole.ticksPerUnit must be a positive integer; received -4",
      "whole domain must be an ascending integer range; received 2..2",
    ]);
  });

  it("accepts a descending-to-ascending domain and rejects a non-integer one", () => {
    expect(
      laneStructureProblems(testLane({ whole: { ...testLane().whole, domainStart: 0, domainEnd: 2, ticksPerUnit: 16 } })).every(
        (problem) => problem.startsWith("the declared axis"),
      ),
    ).toBe(true);
    expect(
      laneStructureProblems(testLane({ whole: { ...testLane().whole, domainStart: 0.5 } })),
    ).toEqual(["whole domain must be an ascending integer range; received 0.5..1"]);
  });

  it("requires a distractor policy to be a non-negative integer when supplied", () => {
    expect(
      laneStructureProblems(testLane({ distractorPolicy: { minimumNearMissLinks: -1 } })),
    ).toEqual(["distractorPolicy.minimumNearMissLinks must be a non-negative integer; received -1"]);
    expect(laneStructureProblems(testLane({ distractorPolicy: [] as unknown as LaneConfig["distractorPolicy"] }))).toEqual([
      "distractorPolicy must be an object; received array(length 0)",
    ]);
    expect(laneStructureProblems(testLane({ numeratorPolicy: [] as unknown as LaneConfig["numeratorPolicy"] }))).toEqual([
      "numeratorPolicy must be an object; received array(length 0)",
    ]);
    expect(laneStructureProblems(testLane({ whole: [] as unknown as LaneConfig["whole"] }))).toEqual([
      "whole must be an object; received array(length 0)",
    ]);
    expect(laneStructureProblems(testLane({ distractorPolicy: { minimumNearMissLinks: 0 } }))).toEqual([]);
  });
});

describe("lane sequences", () => {
  const sequence: LaneSequence = {
    sequenceId: "test-sequence",
    gradeBand: "grade-3",
    lanes: [testLane(), testLane({ laneId: "test-lane-two" })],
  };

  it("accepts an ordered sequence of matching lanes", () => {
    expect(laneSequenceProblems(sequence)).toEqual([]);
  });

  it("rejects a malformed sequence", () => {
    expect(      laneSequenceProblems(null as unknown as LaneSequence)).toEqual([
      "lane sequence must be an object; received null",
    ]);
    expect(
      laneSequenceProblems({ sequenceId: "", gradeBand: "grade-9" as unknown as LaneSequence["gradeBand"], lanes: [] }),
    ).toEqual([
      "sequenceId must be a non-empty string; received string",
      "sequence gradeBand must be one of grade-3, grade-4, grade-5; received string",
      "sequence must contain at least one lane; received array(length 0)",
    ]);
  });

  it("rejects duplicate lane ids and grade drift inside one sequence", () => {
    const problems = laneSequenceProblems({
      sequenceId: "test-sequence",
      gradeBand: "grade-3",
      lanes: [
        testLane(),
        testLane(),
        testLane({ laneId: "grade-four-lane", gradeBand: "grade-4" }),
        null as unknown as LaneConfig,
      ],
    });

    expect(problems).toEqual([
      'lanes[1] repeats laneId "test-lane"',
      'lanes[2] ("grade-four-lane") declares gradeBand grade-4, but the sequence is grade-3',
      "lanes[3] must be an object; received null",
    ]);
  });

  it("clamps progress at both ends and never wraps", () => {
    expect(laneProgress(sequence, -5)).toEqual({ index: 0, total: 2, isFirst: true, isLast: false });
    expect(laneProgress(sequence, 0.9)).toEqual({ index: 0, total: 2, isFirst: true, isLast: false });
    expect(laneProgress(sequence, 99)).toEqual({ index: 1, total: 2, isFirst: false, isLast: true });

    expect(laneIndexAfter(sequence, 0)).toBe(1);
    expect(laneIndexAfter(sequence, 1)).toBe(1);
    expect(laneIndexAfter(sequence, 99)).toBe(1);
    expect(laneIndexBefore(sequence, 0)).toBe(0);
    expect(laneIndexBefore(sequence, 1)).toBe(0);
    expect(laneIndexBefore(sequence, -3)).toBe(0);
  });
});

describe("lane validation order and outcomes", () => {
  it("stops at a structural failure instead of reporting derived problems", () => {
    // A lane whose catalogue cannot be enumerated cannot be measured, so the audit reports only this.
    const problems = validateLaneConfig(testLane({ denominatorCatalogue: "eighths" as unknown as readonly number[] }));
    expect(problems).toEqual(["denominatorCatalogue must be an array; received string"]);
  });

  it("reports whole problems before pool and coverage problems", () => {
    // A sixteenth cannot be divided out of a collection of 8 or placed on an axis of 8, and those two
    // come first because they are lane decisions rather than consequences of the mix.
    const lane = testLane({ denominatorCatalogue: [2, 4, 8, 16], pairCount: 4 });
    const problems = validateLaneConfig(lane);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("the declared collection of 8 objects is not a multiple of denominator 16");
    expect(problems[1]).toContain("the declared axis of 8 parts per unit is not a multiple of denominator 16");
  });

  it("requires a pool large enough for the declared board", () => {
    // `[2, 4]` yields exactly one value with two authored forms (1/2), which cannot fill a two-pair board.
    const problems = validateLaneConfig(testLane({ denominatorCatalogue: [2, 4] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("the denominator catalogue [2,4] yields 1 value(s) with at least two authored forms");
  });

  it("requires plausible distractors unless the lane lowers that bar explicitly", () => {
    const isolated = testLane({
      denominatorCatalogue: [2, 3],
      distractorPolicy: { minimumNearMissLinks: 5 },
    });
    const problems = validateLaneConfig(isolated);
    expect(problems.some((problem) => problem.includes("the pool needs 5 near-miss link(s) but has 0"))).toBe(true);

    const relaxed = testLane({ denominatorCatalogue: [2, 3], distractorPolicy: { minimumNearMissLinks: 0 } });
    expect(validateLaneConfig(relaxed).some((problem) => problem.includes("near-miss"))).toBe(false);
  });

  it("refuses a set model beside values at or above one whole", () => {
    const lane = testLane({
      numeratorPolicy: { allowImproper: true },
      representationMix: [{ family: "set" }, { family: "symbolic" }],
    });
    const problems = validateLaneConfig(lane);
    expect(
      problems.some((problem) =>
        problem.includes("a set model shows parts of one collection, so a lane that allows values at or above one whole"),
      ),
    ).toBe(true);
  });

  it("refuses a mix that cannot draw every form twice over", () => {
    // One family, and a lane that insists on two different pictures per pair.
    const single = laneWithMix([{ family: "symbolic" }]);
    const problems = validateLaneConfig(single);
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.every((problem) =>
        problem.includes("has only one legible family (symbolic), but this lane requires a pair's two cards to use"),
      ),
    ).toBe(true);

    // Lowering the requirement is the documented escape hatch, and it makes the same lane valid.
    expect(validateLaneConfig({ ...single, requireDistinctRepresentationPerPair: false })).toEqual([]);
  });

  it("refuses a mix in which a form cannot be drawn at all", () => {
    // A 68 px card cannot place sixteen sixteenths on an axis of sixteen, and the lane offers nothing else.
    const lane = testLane({
      denominatorCatalogue: [2, 4, 8, 16],
      cardBox: TEST_LANE_BOX,
      representationMix: [{ family: "number-line" }],
      whole: { ...testLane().whole, setTotalObjectCount: 16, ticksPerUnit: 16 },
      requireDistinctRepresentationPerPair: false,
    });
    const problems = validateLaneConfig(lane);
    expect(problems.some((problem) => problem.includes("has no legible representation in this mix"))).toBe(true);
    expect(problems.some((problem) => problem.includes("ticks would sit"))).toBe(true);
  });

  it("answers soft and hard validation consistently", () => {
    expect(isSatisfiableLane(testLane())).toBe(true);
    expect(isSatisfiableLane(testLane({ pairCount: 99 }))).toBe(false);

    const lane = testLane();
    expect(assertValidLane(lane)).toBe(lane);

    const invalid = testLane({ pairCount: 99 });
    expect(() => assertValidLane(invalid)).toThrow(LaneConfigError);
    try {
      assertValidLane(invalid);
    } catch (error) {
      expect(error).toBeInstanceOf(LaneConfigError);
      expect((error as LaneConfigError).name).toBe("LaneConfigError");
      expect((error as LaneConfigError).problems.length).toBeGreaterThan(0);
      expect((error as LaneConfigError).message).toContain("lane configuration is invalid");
    }
  });
});
