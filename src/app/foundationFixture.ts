/**
 * FOUNDATION DEBUG FIXTURE — NOT CURRICULUM.
 *
 * GAME-185 proves that the generic deck generator works, so the shell needs *some* families to
 * deal. These families are a neutral test fixture: they are not a Grade 3/4/5 lane, they carry no
 * standard alignment claim, and they are deliberately generous (nine families for an eight-pair
 * board) so the generator's family selection is exercised.
 *
 * GAME-187 replaces this fixture with reviewed lane configurations. Nothing here should be treated
 * as product content, and no denominator set or representation mix should be inferred from it.
 */

import type { EquivalenceFamily } from "../engine";

/** Fixed debug seed so the built artifact renders one exact, reproducible board. */
export const FOUNDATION_DEBUG_SEED = 20260921;

/** Nine equivalence classes with three or two authored forms each. */
export const FOUNDATION_FAMILIES: readonly EquivalenceFamily[] = [
  {
    familyId: "fixture-half",
    forms: [
      { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 4 },
      { numerator: 3, denominator: 6 },
    ],
  },
  {
    familyId: "fixture-third",
    forms: [
      { numerator: 1, denominator: 3 },
      { numerator: 2, denominator: 6 },
    ],
  },
  {
    familyId: "fixture-two-thirds",
    forms: [
      { numerator: 2, denominator: 3 },
      { numerator: 4, denominator: 6 },
    ],
  },
  {
    familyId: "fixture-quarter",
    forms: [
      { numerator: 1, denominator: 4 },
      { numerator: 3, denominator: 12 },
    ],
  },
  {
    familyId: "fixture-three-quarters",
    forms: [
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 8 },
    ],
  },
  {
    familyId: "fixture-sixth",
    forms: [
      { numerator: 1, denominator: 6 },
      { numerator: 2, denominator: 12 },
    ],
  },
  {
    familyId: "fixture-fifth",
    forms: [
      { numerator: 1, denominator: 5 },
      { numerator: 2, denominator: 10 },
    ],
  },
  {
    familyId: "fixture-two-fifths",
    forms: [
      { numerator: 2, denominator: 5 },
      { numerator: 4, denominator: 10 },
    ],
  },
  {
    familyId: "fixture-three-fifths",
    forms: [
      { numerator: 3, denominator: 5 },
      { numerator: 6, denominator: 10 },
    ],
  },
];
