/**
 * Representation test fixtures (GAME-186).
 *
 * Every value here is authored through the engine, so no representation test ever invents a fraction or
 * writes a canonical pair by hand. The wholes are declared the same way a lane would have to declare
 * them, which is what makes the shared-whole rules testable.
 */

import { createFractionForm, type FractionForm } from "../src/engine";
import {
  continuousWhole,
  discreteSetWhole,
  numberLineAxis,
  numberLineWhole,
  representationWholes,
  type ContinuousWhole,
  type DiscreteSetWhole,
  type NumberLineWhole,
  type RepresentationWholeResolver,
} from "../src/representations";

/** One shared continuous whole. `1/2` and `2/4` drawn in one box share this identity. */
export const TEST_CONTINUOUS_WHOLE: ContinuousWhole = continuousWhole({
  wholeId: "test-unit-whole",
  description: "one whole unit",
});

export type RepresentationFixtureOptions = {
  /** Total objects in the declared collection. Defaults to the denominator, which is always exact. */
  readonly setTotalObjectCount?: number;
  /** Axis scale. Defaults to the denominator, so the point lands on a real tick. */
  readonly ticksPerUnit?: number;
};

export type RepresentationFixture = {
  readonly form: FractionForm;
  readonly set: DiscreteSetWhole;
  readonly numberLine: NumberLineWhole;
  readonly wholes: RepresentationWholeResolver;
};

/** Build an authored form plus the same three declared wholes a lane would supply. */
export function representationFixture(
  numerator: number,
  denominator: number,
  options: RepresentationFixtureOptions = {},
): RepresentationFixture {
  const form = createFractionForm(numerator, denominator);
  const totalObjectCount = options.setTotalObjectCount ?? denominator;
  const ticksPerUnit = options.ticksPerUnit ?? denominator;

  const set = discreteSetWhole({
    totalObjectCount,
    wholeId: `test-collection-of-${totalObjectCount}`,
    description: `one collection of ${totalObjectCount} objects`,
  });
  const numberLine = numberLineWhole({
    axis: numberLineAxis({
      axisId: `test-axis-0-1-in-${ticksPerUnit}`,
      ticksPerUnit,
    }),
  });

  return Object.freeze({
    form,
    set,
    numberLine,
    wholes: representationWholes({ continuous: TEST_CONTINUOUS_WHOLE, set, numberLine }),
  });
}

/** A discrete collection with an explicit total, for shared-set tests. */
export function testSetWhole(totalObjectCount: number, wholeId = `test-collection-of-${totalObjectCount}`): DiscreteSetWhole {
  return discreteSetWhole({
    totalObjectCount,
    wholeId,
    description: `one collection of ${totalObjectCount} objects`,
  });
}

/** A number-line whole on an explicit axis, for shared-axis tests. */
export function testNumberLineWhole(ticksPerUnit: number, options: { readonly axisId?: string; readonly domainEnd?: number } = {}): NumberLineWhole {
  return numberLineWhole({
    axis: numberLineAxis({
      ticksPerUnit,
      ...(options.axisId === undefined ? {} : { axisId: options.axisId }),
      ...(options.domainEnd === undefined ? {} : { domainEnd: options.domainEnd }),
    }),
  });
}

/** Proper-fraction values used by the sweeps: every family can be asked for these. */
export const SWEEP_PROPER_VALUES: readonly { readonly numerator: number; readonly denominator: number }[] = Object.freeze([
  { numerator: 0, denominator: 4 },
  { numerator: 1, denominator: 2 },
  { numerator: 2, denominator: 4 },
  { numerator: 1, denominator: 3 },
  { numerator: 2, denominator: 3 },
  { numerator: 3, denominator: 4 },
  { numerator: 5, denominator: 6 },
  { numerator: 7, denominator: 8 },
  { numerator: 3, denominator: 12 },
  { numerator: 1, denominator: 100 },
  { numerator: 4, denominator: 4 },
]);

/** Boxes swept by the legibility properties, including the smallest shipped card. */
export const SWEEP_BOXES: readonly { readonly width: number; readonly height: number }[] = Object.freeze([
  { width: 68, height: 68 },
  { width: 96, height: 96 },
  { width: 160, height: 120 },
]);
