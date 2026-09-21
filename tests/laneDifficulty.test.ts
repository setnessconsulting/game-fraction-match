import { describe, expect, it } from "vitest";

import {
  CURRICULUM_MAP,
  DIFFICULTY_DIMENSIONS,
  LaneLadderError,
  assertLaneLadderInvariants,
  differingDimensions,
  laneLadder,
  type LaneLadder,
} from "../src/lanes";
import { laneWithCatalogue, laneWithMix, testLane } from "./laneTestFixtures";

/**
 * A ladder is the only place adaptation is allowed to move, so its invariants are the load-bearing part: the
 * top rung must be the lane as written, every rung must still be dealable, and two adjacent rungs must differ
 * in exactly one bounded dimension and in the easier direction.
 */

describe("deriving a ladder", () => {
  it("walks from the most scaffolded rung up to the lane as written", () => {
    const lane = testLane();
    const ladder = laneLadder(lane);

    expect(ladder.laneId).toBe(lane.laneId);
    expect(ladder.hardestStep).toBe(ladder.rungs.length - 1);
    expect(ladder.rungs[0]!.step).toBe(0);
    expect(ladder.rungs[0]!.dimension).toBeNull();
    expect(differingDimensions(ladder.rungs[ladder.hardestStep]!.variant, lane)).toEqual([]);
  });

  it("removes exactly one dimension per rung, and refuses to remove a family that a pair needs", () => {
    // The base lane is [bar, circle, symbolic] over [2, 4, 8]. Dropping `symbolic` is still dealable;
    // dropping `circle` would leave one family for a lane that requires two different pictures per pair, so
    // the ladder stops there.
    const ladder = laneLadder(testLane());

    expect(ladder.rungs.map((rung) => rung.variant.representationMix.map((candidate) => candidate.family))).toEqual([
      ["bar", "circle"],
      ["bar", "circle", "symbolic"],
    ]);
    expect(ladder.rungs.map((rung) => rung.dimension)).toEqual([null, "representation-mixing"]);
    expect(ladder.rungs.map((rung) => rung.variant.denominatorCatalogue)).toEqual([
      [2, 4, 8],
      [2, 4, 8],
    ]);
  });

  it("restores printed labels first, which is the cheapest reduction a lane can offer", () => {
    const ladder = laneLadder(
      laneWithMix([{ family: "symbolic" }], {
        labelVisibility: "never",
        requireDistinctRepresentationPerPair: false,
      }),
    );

    expect(ladder.rungs[0]!.variant.labelVisibility).toBe("always");
    expect(ladder.rungs[0]!.dimension).toBeNull();
    expect(ladder.rungs[1]!.variant.labelVisibility).toBe("never");
    expect(ladder.rungs[1]!.dimension).toBe("label-scaffolding");
  });

  it("narrows the denominator catalogue last, and only while the board still has values to deal", () => {
    // `[2, 4]` yields a single usable value, which cannot fill a two-pair board, so the reach never shrinks.
    const ladder = laneLadder(laneWithCatalogue([2, 4, 8, 16], { whole: { ...testLane().whole, setTotalObjectCount: 16, ticksPerUnit: 16 } }));
    const catalogues = ladder.rungs.map((rung) => rung.variant.denominatorCatalogue);

    for (const catalogue of catalogues) expect(catalogue.length).toBeLessThanOrEqual(4);
    expect(catalogues.at(-1)).toEqual([2, 4, 8, 16]);
    expect(ladder.rungs.every((rung) => rung.variant.denominatorCatalogue.length >= 2)).toBe(true);
    expect(DIFFICULTY_DIMENSIONS).toEqual(["label-scaffolding", "representation-mixing", "denominator-reach"]);
  });

  it("keeps every rung inside the lane: identity, grade band and pair count never move", () => {
    for (const line of CURRICULUM_MAP) {
      for (const lane of line.lanes) {
        const ladder = laneLadder(lane);
        for (const rung of ladder.rungs) {
          expect(rung.variant.laneId, lane.laneId).toBe(lane.laneId);
          expect(rung.variant.gradeBand, lane.laneId).toBe(lane.gradeBand);
          expect(rung.variant.pairCount, lane.laneId).toBe(lane.pairCount);
          for (const denominator of rung.variant.denominatorCatalogue) {
            expect(lane.denominatorCatalogue, lane.laneId).toContain(denominator);
          }
          for (const candidate of rung.variant.representationMix) {
            expect(
              lane.representationMix.map((declared) => declared.family),
              lane.laneId,
            ).toContain(candidate.family);
          }
        }
      }
    }
  });

  it("refuses to derive a ladder from a lane that cannot be dealt as written", () => {
    expect(() => laneLadder(testLane({ pairCount: 99 }))).toThrow(LaneLadderError);
    expect(() => laneLadder(testLane({ pairCount: 99 }))).toThrow(/is not satisfiable as written/);
  });
});

describe("ladder invariants", () => {
  const ladder = laneLadder(testLane());

  it("accepts the derived ladder and repeats the check without trusting it", () => {
    expect(() => assertLaneLadderInvariants(ladder, testLane())).not.toThrow();
  });

  it("rejects a rung that is not a satisfiable lane", () => {
    const broken: LaneLadder = {
      ...ladder,
      rungs: [ladder.rungs[0]!, { ...ladder.rungs[1]!, variant: { ...ladder.rungs[1]!.variant, representationMix: [] } }],
    };

    expect(() => assertLaneLadderInvariants(broken, testLane())).toThrow(LaneLadderError);
    expect(() => assertLaneLadderInvariants(broken, testLane())).toThrow(/step 1 is not satisfiable/);
  });

  it("rejects a ladder whose hardest rung is not the lane as written", () => {
    const broken: LaneLadder = {
      ...ladder,
      rungs: [ladder.rungs[0]!, { ...ladder.rungs[1]!, variant: laneWithMix([{ family: "bar" }, { family: "circle" }]) }],
    };

    expect(() => assertLaneLadderInvariants(broken, testLane())).toThrow(
      /the hardest rung is not the lane as written/,
    );
  });

  it("rejects a rung that changes two dimensions at once", () => {
    const widened = laneWithCatalogue([2, 4, 8], { denominatorCatalogue: [2, 3, 4, 6, 8] });
    const broken: LaneLadder = {
      laneId: widened.laneId,
      hardestStep: 1,
      rungs: [
        { step: 0, dimension: null, variant: widened },
        {
          step: 1,
          dimension: "representation-mixing",
          variant: { ...widened, denominatorCatalogue: [2, 4], representationMix: [{ family: "bar" }, { family: "circle" }] },
        },
      ],
    };

    expect(() => assertLaneLadderInvariants(broken, widened)).toThrow(
      /differ in 2 dimension\(s\); every rung must change exactly one/,
    );
  });

  it("rejects a rung that adds scaffolding going up, or drops a catalogue the rung below had", () => {
    const base = testLane();
    const notMonotone: LaneLadder = {
      laneId: base.laneId,
      hardestStep: 1,
      rungs: [
        { step: 0, dimension: null, variant: { ...base, labelVisibility: "never" } },
        { step: 1, dimension: "label-scaffolding", variant: { ...base, labelVisibility: "on-reveal" } },
      ],
    };
    expect(() => assertLaneLadderInvariants(notMonotone, base)).toThrow(/adds scaffolding instead of removing it/);

    const reachRegressed: LaneLadder = {
      laneId: base.laneId,
      hardestStep: 1,
      rungs: [
        { step: 0, dimension: null, variant: { ...base, denominatorCatalogue: [2, 4, 8] } },
        { step: 1, dimension: "denominator-reach", variant: { ...base, denominatorCatalogue: [2, 4] } },
      ],
    };
    expect(() => assertLaneLadderInvariants(reachRegressed, base)).toThrow(
      /does not keep step 0's denominator 8/,
    );
  });

  it("rejects a rung that is not the most scaffolded one, and rungs that are not a list at all", () => {
    const second = ladder.rungs[1]!;

    expect(() =>
      assertLaneLadderInvariants(
        { laneId: "x", hardestStep: 1, rungs: [{ step: 1, dimension: "label-scaffolding", variant: testLane() }, second] },
        testLane(),
      ),
    ).toThrow(/step 0 must be the most scaffolded rung and carry no dimension/);

    // Step 0 is labelled correctly here but still carries a dimension, which is the other half of the rule.
    expect(() =>
      assertLaneLadderInvariants(
        { laneId: "x", hardestStep: 1, rungs: [{ step: 0, dimension: "label-scaffolding", variant: testLane() }, second] },
        testLane(),
      ),
    ).toThrow(/step 0 must be the most scaffolded rung and carry no dimension/);

    expect(() =>
      assertLaneLadderInvariants(
        { laneId: "x", hardestStep: 0, rungs: "nope" as unknown as LaneLadder["rungs"] },
        testLane(),
      ),
    ).toThrow(/a ladder must hold at least one rung/);
  });

  it("rejects a rung whose dimension label disagrees with what actually changed", () => {
    const base = testLane();
    const mislabelled: LaneLadder = {
      laneId: base.laneId,
      hardestStep: 1,
      rungs: [
        { step: 0, dimension: null, variant: laneWithMix([{ family: "bar" }, { family: "circle" }]) },
        { step: 1, dimension: "denominator-reach", variant: base },
      ],
    };

    expect(() => assertLaneLadderInvariants(mislabelled, base)).toThrow(
      /step 1 is labelled denominator-reach but differs in representation-mixing/,
    );
  });

  it("rejects an empty ladder and a mislabelled hardest step", () => {
    expect(() =>
      assertLaneLadderInvariants({ laneId: "x", hardestStep: 0, rungs: [] }, testLane()),
    ).toThrow(/a ladder must hold at least one rung/);

    expect(() =>
      assertLaneLadderInvariants({ laneId: "x", hardestStep: 9, rungs: ladder.rungs }, testLane()),
    ).toThrow(/hardestStep 9 does not match 2 rung\(s\)/);
  });
});
