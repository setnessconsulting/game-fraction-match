/**
 * Lane test fixtures (GAME-187).
 *
 * A lane is a configuration object, so the tests build lanes from one valid base and change exactly the
 * field under test. That keeps every failure message about one property, and it means a new required
 * field only has to be added in one place.
 *
 * Every value in these lanes is authored through the engine: the fixtures declare catalogues and wholes,
 * never fractions.
 */

import { createFractionForm, type FractionForm } from "../src/engine";
import { MIN_CARD_SIZE_CSS_PX, type RepresentationCandidate } from "../src/representations";
import type { LaneConfig, LaneWholeDeclaration } from "../src/lanes";

/** A card box the geometry was qualified at: the smallest shipped card. */
export const TEST_LANE_BOX = Object.freeze({ width: MIN_CARD_SIZE_CSS_PX, height: MIN_CARD_SIZE_CSS_PX });

/** A card box with room to spare, used where a case is about content rather than about legibility. */
export const ROOMY_LANE_BOX = Object.freeze({ width: 96, height: 96 });

/**
 * A whole declaration whose collection and axis carry `[2, 4, 8]` exactly.
 *
 * The collection total is the largest catalogue denominator, which is the smallest total that stays
 * exact for all three, and the axis scale matches it.
 */
export const TEST_LANE_WHOLE: LaneWholeDeclaration = Object.freeze({
  continuousWholeId: "test-lane-unit-whole",
  continuousWholeDescription: "one whole unit",
  setTotalObjectCount: 8,
  setWholeId: "test-lane-collection-of-8",
  setWholeDescription: "one collection of 8 objects",
  axisId: "test-lane-axis-0-1-in-8",
  ticksPerUnit: 8,
});

/** A lane that is valid as written: three values, two pairs, three families, one exact whole. */
export function testLane(overrides: Partial<LaneConfig> = {}): LaneConfig {
  return {
    laneId: "test-lane",
    gradeBand: "grade-3",
    title: "Test lane",
    pairCount: 2,
    cardBox: ROOMY_LANE_BOX,
    denominatorCatalogue: [2, 4, 8],
    numeratorPolicy: { allowZero: false, allowWhole: false, allowImproper: false },
    representationMix: [{ family: "bar" }, { family: "circle" }, { family: "symbolic" }],
    whole: TEST_LANE_WHOLE,
    ...overrides,
  };
}

/** The same lane with one field replaced, for tests that need a specifically broken configuration. */
export function laneWithMix(mix: readonly RepresentationCandidate[], overrides: Partial<LaneConfig> = {}): LaneConfig {
  return testLane({ representationMix: mix, ...overrides });
}

/** The same lane with one catalogue, for tests about pool size and whole divisibility. */
export function laneWithCatalogue(
  denominatorCatalogue: readonly number[],
  overrides: Partial<LaneConfig> = {},
): LaneConfig {
  return testLane({ denominatorCatalogue, ...overrides });
}

/** Every pool value's authored form, as `numerator/denominator` strings, in pool order. */
export function formLabels(forms: readonly FractionForm[]): readonly string[] {
  return forms.map((form) => `${form.numerator}/${form.denominator}`);
}

/** An engine-authored form, so no test writes a fraction by hand. */
export function form(numerator: number, denominator: number): FractionForm {
  return createFractionForm(numerator, denominator);
}
