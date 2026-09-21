/**
 * Shared test fixtures.
 *
 * These are deliberately generic: GAME-185 owns the generation mechanism, not a Grade 3/4/5
 * curriculum (GAME-187). Nothing here carries a standards claim.
 */

import {
  applyAction,
  createGameState,
  rationalEquals,
  type DeckCard,
  type EquivalenceFamily,
  type GameState,
  type Rational,
} from "../src/engine";

/**
 * A generic fixture with more families than either supported board size, so the generator's
 * selection step is genuinely exercised.
 */
export const GENERIC_FAMILIES: readonly EquivalenceFamily[] = [
  { familyId: "half", forms: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }, { numerator: 3, denominator: 6 }] },
  { familyId: "third", forms: [{ numerator: 1, denominator: 3 }, { numerator: 2, denominator: 6 }] },
  { familyId: "two-thirds", forms: [{ numerator: 2, denominator: 3 }, { numerator: 4, denominator: 6 }] },
  { familyId: "quarter", forms: [{ numerator: 1, denominator: 4 }, { numerator: 3, denominator: 12 }] },
  { familyId: "three-quarters", forms: [{ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }] },
  { familyId: "sixth", forms: [{ numerator: 1, denominator: 6 }, { numerator: 2, denominator: 12 }] },
  { familyId: "fifth", forms: [{ numerator: 1, denominator: 5 }, { numerator: 2, denominator: 10 }] },
  { familyId: "two-fifths", forms: [{ numerator: 2, denominator: 5 }, { numerator: 4, denominator: 10 }] },
  { familyId: "three-fifths", forms: [{ numerator: 3, denominator: 5 }, { numerator: 6, denominator: 10 }] },
];

/** Exactly one family per pair, so the fixture itself constrains the selection step. */
export const FOUR_FAMILIES: readonly EquivalenceFamily[] = GENERIC_FAMILIES.slice(0, 4);

/**
 * Boundary fixture: whole numbers, the safe-integer ceiling, hundredths and a one-hundredth.
 * Every authored form is deliberately written in two mathematically different ways.
 */
export const BOUNDARY_FAMILIES: readonly EquivalenceFamily[] = [
  { familyId: "whole", forms: [{ numerator: 1, denominator: 1 }, { numerator: 12, denominator: 12 }] },
  {
    familyId: "safe-integer-ceiling",
    forms: [
      { numerator: 9_007_199_254_740_990, denominator: 2 },
      { numerator: 4_503_599_627_370_495, denominator: 1 },
    ],
  },
  { familyId: "hundredths", forms: [{ numerator: 25, denominator: 100 }, { numerator: 50, denominator: 200 }] },
  { familyId: "one-hundredth", forms: [{ numerator: 1, denominator: 100 }, { numerator: 2, denominator: 200 }] },
];

/**
 * The historical LevelBest Fraction Match board, preserved ONLY as a regression fixture.
 *
 * The historical implementation matched cards by comparing a `pairId` assigned to each hardcoded
 * label pair. This fixture keeps that exact content so the modern engine can be proven to reach the
 * same mathematical grouping through canonical rational equality. It is not a content model, not a
 * curriculum, and not a template for GAME-187 lanes.
 *
 * See docs/provenance/LEGACY_BASELINE.md.
 */
export const HISTORICAL_EIGHT_PAIR_FAMILIES: readonly EquivalenceFamily[] = [
  { familyId: "legacy-half", forms: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }] },
  { familyId: "legacy-third", forms: [{ numerator: 1, denominator: 3 }, { numerator: 2, denominator: 6 }] },
  { familyId: "legacy-two-thirds", forms: [{ numerator: 2, denominator: 3 }, { numerator: 4, denominator: 6 }] },
  { familyId: "legacy-quarter", forms: [{ numerator: 1, denominator: 4 }, { numerator: 3, denominator: 12 }] },
  { familyId: "legacy-three-quarters", forms: [{ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }] },
  { familyId: "legacy-fifth", forms: [{ numerator: 1, denominator: 5 }, { numerator: 2, denominator: 10 }] },
  { familyId: "legacy-two-fifths", forms: [{ numerator: 2, denominator: 5 }, { numerator: 4, denominator: 10 }] },
  { familyId: "legacy-three-fifths", forms: [{ numerator: 3, denominator: 5 }, { numerator: 6, denominator: 10 }] },
];

export const DEFAULT_TEST_SEED = 20_260_921;

/** A deterministic spread of seeds for property sweeps. */
export const SWEEP_SEEDS: readonly number[] = [
  0, 1, 2, 3, 7, 13, 42, 99, 255, 1000, 4048, 9999, 12_345, 65_535, 65_536, 100_000, 262_144, 524_288,
  1_000_000, 2_097_152, 4_194_304, 8_388_608, 16_777_216, 33_554_432, 67_108_864, 134_217_728, 268_435_456,
  536_870_912, 1_073_741_824, 2_147_483_648, 4_000_000_000, 4_294_967_295, 20_260_921, 1_234_567_890,
];

/** The canonical value of a card in a state. */
export function canonicalOf(state: GameState, cardIndex: number): Rational {
  return state.cards[cardIndex]!.form.canonical;
}

/**
 * The first two card indexes satisfying a predicate over their canonical values.
 *
 * Deliberately expressed in terms of canonical equality: no test needs `pairId` to find an
 * equivalent or a non-equivalent pair.
 */
export function findIndexes(
  state: GameState,
  predicate: (left: Rational, right: Rational) => boolean,
): [number, number] | null {
  for (let left = 0; left < state.cards.length; left += 1) {
    for (let right = left + 1; right < state.cards.length; right += 1) {
      if (predicate(canonicalOf(state, left), canonicalOf(state, right))) return [left, right];
    }
  }
  return null;
}

export function equivalentPair(state: GameState): [number, number] {
  const pair = findIndexes(state, (left, right) => rationalEquals(left, right));
  if (pair === null) throw new Error("fixture has no equivalent pair");
  return pair;
}

export function nonEquivalentPair(state: GameState): [number, number] {
  const pair = findIndexes(state, (left, right) => !rationalEquals(left, right));
  if (pair === null) throw new Error("fixture has no non-equivalent pair");
  return pair;
}

/**
 * Play a board to completion using only canonical equality, acknowledging mismatches as needed.
 * Returns the number of comparisons made so the caller can assert move accounting.
 */
export function solveBoard(cards: readonly DeckCard[]): { readonly state: GameState; readonly comparisons: number } {
  const deck = { seed: 0, pairCount: cards.length / 2, cardCount: cards.length, cards, usedFamilyIds: [] };
  let state = createGameState(deck);
  let comparisons = 0;

  for (let guard = 0; guard < 500; guard += 1) {
    if (state.status === "complete") break;

    if (state.pendingComparison !== null) {
      state = applyAction(state, { type: "acknowledge-comparison" }).state;
      continue;
    }

    const unmatched = state.cards
      .map((_, index) => index)
      .filter((index) => !state.matchedCardIndexes.includes(index));
    const first = unmatched[0];
    if (first === undefined) break;
    const partner = unmatched
      .slice(1)
      .find((index) => rationalEquals(canonicalOf(state, first), canonicalOf(state, index)));

    if (partner === undefined) throw new Error("board cannot be solved: no equivalent partner");

    state = applyAction(state, { type: "select-card", cardIndex: first }).state;
    const result = applyAction(state, { type: "select-card", cardIndex: partner });
    comparisons += 1;
    state = result.state;
  }

  return { state, comparisons };
}
