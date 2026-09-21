/**
 * LANE FIXTURES — NOT CURRICULUM.
 *
 * GAME-187 ships the lane *mechanism*: catalogues, policies, wholes, representation mixes, validation and
 * planning. Something still has to be dealt, so these three lanes are neutral examples chosen to exercise
 * the mechanism's boundaries rather than to teach anything:
 *
 * - `warm-up` — a wide catalogue across halves, thirds, quarters, sixths, eighths and twelfths with a
 *   collection of 48 objects, which is the smallest total every one of those denominators divides. It also
 *   shows the cost of that decision: an axis fine enough for twelfths would leave 1.8 px per tick on a
 *   96 px card, so the lane does not offer the number line at all.
 * - `eighths` — a narrow catalogue on a deliberately coarse axis (8 parts per unit), which is the lane that
 *   *can* offer the number line at the same card size.
 * - `production-eight` — eight pairs over a wider catalogue, i.e. the production board shape.
 *
 * No denominator catalogue, numerator policy, grade band or representation mix here carries a standards
 * claim or a curriculum review. GAME-188 supplies the real card size, GAME-189 the board, and whichever
 * story adopts reviewed content replaces these lanes with its own.
 */

import { PRODUCTION_PAIR_COUNT, WARM_UP_PAIR_COUNT } from "../engine";
import { planLaneDeck, type LaneConfig, type LanePlan, type LaneSequence } from "../lanes";

/** Fixed fixture seed, so the gallery renders one exact, reproducible board per lane. */
export const LANE_FIXTURE_SEED = 20_260_921;

/** The card box both fixtures and the gallery's card use. GAME-188 owns the real card size. */
export const LANE_FIXTURE_CARD_BOX = Object.freeze({ width: 96, height: 96 });

const WARM_UP_LANE: LaneConfig = Object.freeze({
  laneId: "fixture-warm-up",
  gradeBand: "grade-3",
  title: "Warm-up (fixture)",
  pairCount: WARM_UP_PAIR_COUNT,
  cardBox: LANE_FIXTURE_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 4, 6, 8, 12, 16]),
  numeratorPolicy: Object.freeze({ allowZero: false, allowWhole: false, allowImproper: false }),
  representationMix: Object.freeze([
    Object.freeze({ family: "bar" as const, maxPartitionCount: 12 }),
    Object.freeze({ family: "circle" as const }),
    Object.freeze({ family: "set" as const }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  whole: Object.freeze({
    continuousWholeId: "fixture-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 48,
    setWholeId: "fixture-collection-of-48",
    setWholeDescription: "one collection of 48 objects",
    axisId: "fixture-axis-0-1-in-48",
    ticksPerUnit: 48,
  }),
});

const EIGHTHS_LANE: LaneConfig = Object.freeze({
  laneId: "fixture-eighths",
  gradeBand: "grade-3",
  title: "Halves, quarters and eighths (fixture)",
  pairCount: 3,
  cardBox: LANE_FIXTURE_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 4, 8]),
  representationMix: Object.freeze([
    Object.freeze({ family: "number-line" as const }),
    Object.freeze({ family: "bar" as const }),
    Object.freeze({ family: "circle" as const }),
    Object.freeze({ family: "set" as const }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  whole: Object.freeze({
    continuousWholeId: "fixture-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 8,
    setWholeId: "fixture-collection-of-8",
    setWholeDescription: "one collection of 8 objects",
    axisId: "fixture-axis-0-1-in-8",
    ticksPerUnit: 8,
  }),
});

const PRODUCTION_LANE: LaneConfig = Object.freeze({
  laneId: "fixture-production-eight",
  gradeBand: "grade-4",
  title: "Production board shape (fixture)",
  pairCount: PRODUCTION_PAIR_COUNT,
  cardBox: LANE_FIXTURE_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 3, 4, 6, 8, 12, 16]),
  representationMix: Object.freeze([
    Object.freeze({ family: "bar" as const, maxPartitionCount: 16 }),
    Object.freeze({ family: "circle" as const }),
    Object.freeze({ family: "set" as const }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  whole: Object.freeze({
    continuousWholeId: "fixture-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 48,
    setWholeId: "fixture-collection-of-48",
    setWholeDescription: "one collection of 48 objects",
    axisId: "fixture-axis-0-1-in-48",
    ticksPerUnit: 48,
  }),
});

/** Every fixture lane, in ascending scope. */
export const FIXTURE_LANES: readonly LaneConfig[] = Object.freeze([WARM_UP_LANE, EIGHTHS_LANE, PRODUCTION_LANE]);

/** An ordered grade-3 run: warm up on a wide catalogue, then focus on eighths on a coarse axis. */
export const FIXTURE_LANE_SEQUENCE: LaneSequence = Object.freeze({
  sequenceId: "fixture-grade-3-sequence",
  gradeBand: "grade-3",
  lanes: Object.freeze([WARM_UP_LANE, EIGHTHS_LANE]),
});

/**
 * The planned board each fixture lane deals at {@link LANE_FIXTURE_SEED}.
 *
 * Planned in the fixture rather than in the component so the panel stays a pure projection and the tests
 * assert the same plans the browser renders.
 */
export const FIXTURE_LANE_PLANS: readonly LanePlan[] = Object.freeze(
  FIXTURE_LANES.map((lane) => planLaneDeck(lane, LANE_FIXTURE_SEED)),
);
