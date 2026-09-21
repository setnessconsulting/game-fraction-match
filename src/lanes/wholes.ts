/**
 * Lane-wide wholes (GAME-187).
 *
 * A lane declares one continuous whole, one countable collection and one number-line axis, and every card
 * in the lane draws against them. That is what makes `2/4` beside a collection of 8 objects comparable to
 * `4/8` beside the same collection, and it is why the divisibility rule below is a lane validity rule
 * rather than a rendering detail: a lane whose collection cannot be divided by one of its own denominators
 * could never draw that value honestly.
 *
 * The wholes themselves are GAME-186 constructs — this module only derives them from lane data.
 */

import {
  continuousWhole,
  discreteSetWhole,
  numberLineAxis,
  numberLineWhole,
  type ContinuousWhole,
  type DiscreteSetWhole,
  type NumberLineAxis,
  type NumberLineWhole,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../representations";
import { LANE_MIN_DENOMINATOR, type LaneConfig, type LaneWholeDeclaration } from "./schema";

/**
 * A lane declares all three whole kinds, so every family resolves.
 *
 * The resolver is total by construction, which is why coverage and planning can measure a family without
 * handling a "no whole declared" case on every call site.
 */
export type LaneWholeResolver = (family: RepresentationFamily) => RepresentationWhole;

/** The three wholes a lane declares, constructed once and shared by every card in the lane. */
export type LaneWholes = {
  readonly continuous: ContinuousWhole;
  readonly set: DiscreteSetWhole;
  readonly numberLine: NumberLineWhole;
  readonly axis: NumberLineAxis;
  readonly resolver: LaneWholeResolver;
};

/** Build the lane's wholes. Structure must already be valid; this is a projection, not a validator. */
export function laneWholes(lane: LaneConfig): LaneWholes {
  const declaration = lane.whole;
  const axis = numberLineAxis({
    axisId: declaration.axisId,
    ticksPerUnit: declaration.ticksPerUnit,
    ...(declaration.domainStart === undefined ? {} : { domainStart: declaration.domainStart }),
    ...(declaration.domainEnd === undefined ? {} : { domainEnd: declaration.domainEnd }),
  });

  const continuous = continuousWhole({
    wholeId: declaration.continuousWholeId,
    description: declaration.continuousWholeDescription,
  });
  const set = discreteSetWhole({
    totalObjectCount: declaration.setTotalObjectCount,
    ...(declaration.setWholeId === undefined ? {} : { wholeId: declaration.setWholeId }),
    ...(declaration.setWholeDescription === undefined ? {} : { description: declaration.setWholeDescription }),
  });
  const numberLine = numberLineWhole({
    axis,
    ...(declaration.numberLineWholeDescription === undefined
      ? {}
      : { description: declaration.numberLineWholeDescription }),
  });

  // Total by construction: a lane declares all three whole kinds, so every family resolves and no call site
  // has to handle a missing whole. The mapping itself is the representation layer's rule, and
  // `tests/laneWholes.test.ts` asserts that this table still agrees with it family by family, so the two
  // cannot drift apart silently.
  const familyWholes: Record<RepresentationFamily, RepresentationWhole> = {
    symbolic: continuous,
    bar: continuous,
    circle: continuous,
    set,
    "number-line": numberLine,
  };
  const resolver: LaneWholeResolver = (family) => familyWholes[family];

  return Object.freeze({ continuous, set, numberLine, axis, resolver });
}

/**
 * Which whole each family draws.
 *
 * `symbolic` resolves to the continuous whole because a symbol states its whole in words and carries no
 * geometry of its own; the comparison planner is what pairs it with a visual side's declared whole.
 */
export function laneWholeFor(lane: LaneConfig, family: RepresentationFamily): RepresentationWhole {
  return laneWholes(lane).resolver(family);
}

/**
 * The divisibility rule: every catalogue denominator must divide the collection total and the axis scale.
 *
 * Reported as problems rather than enforced silently, because the fix is a lane decision (a larger
 * collection, a finer axis, or a smaller catalogue).
 */
export function laneWholeProblems(lane: LaneConfig): readonly string[] {
  const problems: string[] = [];
  const declaration = lane.whole;

  if (typeof declaration !== "object" || declaration === null) return Object.freeze(problems);
  if (!Array.isArray(lane.denominatorCatalogue)) return Object.freeze(problems);

  const catalogue = lane.denominatorCatalogue.filter(
    (denominator) => Number.isSafeInteger(denominator) && denominator >= LANE_MIN_DENOMINATOR,
  );

  for (const denominator of catalogue) {
    if (Number.isSafeInteger(declaration.setTotalObjectCount) && declaration.setTotalObjectCount % denominator !== 0) {
      problems.push(
        `the declared collection of ${declaration.setTotalObjectCount} objects is not a multiple of denominator ${denominator}; ` +
          "a set model must divide its collection exactly, so every catalogue denominator must divide the total",
      );
    }
    if (Number.isSafeInteger(declaration.ticksPerUnit) && declaration.ticksPerUnit % denominator !== 0) {
      problems.push(
        `the declared axis of ${declaration.ticksPerUnit} parts per unit is not a multiple of denominator ${denominator}; ` +
          "a number line must place every catalogue value on a real tick",
      );
    }
  }

  return Object.freeze(problems);
}

/** A shortened, human-readable statement of the lane's wholes, for diagnostics and fixtures. */
export function laneWholeSummary(declaration: LaneWholeDeclaration): string {
  const start = declaration.domainStart ?? 0;
  const end = declaration.domainEnd ?? 1;
  return [
    `continuous "${declaration.continuousWholeId}"`,
    `collection of ${declaration.setTotalObjectCount}`,
    `axis "${declaration.axisId}" ${start}..${end} in ${declaration.ticksPerUnit} parts`,
  ].join(", ");
}
