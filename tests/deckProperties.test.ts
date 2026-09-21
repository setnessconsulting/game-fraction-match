import { describe, expect, it } from "vitest";

import {
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  countRationalOccurrences,
  createDeck,
  distinctRationals,
  isSatisfiableDeckConfig,
  rationalEquals,
  validateDeckConfig,
  type Deck,
  type EquivalenceFamily,
} from "../src/engine";
import { BOUNDARY_FAMILIES, DEFAULT_TEST_SEED, GENERIC_FAMILIES, SWEEP_SEEDS } from "./fixtures";

/**
 * Each fixture declares the board sizes it can actually supply, so a fixture limitation can never
 * be mistaken for a generator defect (or hidden by one).
 */
const FIXTURE_SETS: readonly {
  readonly name: string;
  readonly families: readonly EquivalenceFamily[];
  readonly pairCounts: readonly number[];
}[] = [
  { name: "generic", families: GENERIC_FAMILIES, pairCounts: [WARM_UP_PAIR_COUNT, PRODUCTION_PAIR_COUNT] },
  { name: "boundary", families: BOUNDARY_FAMILIES, pairCounts: [WARM_UP_PAIR_COUNT] },
];

/**
 * Independent, deliberately naive re-derivation of the board's required shape.
 *
 * It never consults a family id, a pair id or a card id: it only looks at canonical values, so a
 * generator bug cannot hide behind identifier bookkeeping.
 */
function assertBoardShape(deck: Deck, expectedPairCount: number): void {
  expect(deck.pairCount).toBe(expectedPairCount);
  expect(deck.cardCount).toBe(expectedPairCount * 2);
  expect(deck.cards).toHaveLength(expectedPairCount * 2);

  const values = deck.cards.map((card) => card.form.canonical);
  const distinct = distinctRationals(values);
  expect(distinct).toHaveLength(expectedPairCount);

  for (const value of distinct) {
    expect(countRationalOccurrences(values, value)).toBe(2);
  }

  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const samePairId = deck.cards[left]!.pairId === deck.cards[right]!.pairId;
      const sameValue = rationalEquals(values[left]!, values[right]!);
      // No two different pair families may be mathematically equivalent...
      if (!samePairId) expect(sameValue).toBe(false);
      // ...and a pair family may not contain two different values.
      if (samePairId) expect(sameValue).toBe(true);
    }
  }

  expect(new Set(deck.cards.map((card) => card.cardId)).size).toBe(deck.cards.length);
  expect(new Set(deck.usedFamilyIds).size).toBe(expectedPairCount);
  expect(new Set(deck.usedFamilyIds).size).toBe(new Set(deck.cards.map((card) => card.pairId)).size);
}

describe("deterministic generation property sweeps", () => {
  for (const fixture of FIXTURE_SETS) {
    for (const pairCount of fixture.pairCounts) {
      it(`holds every board invariant for the ${fixture.name} fixture across ${SWEEP_SEEDS.length} seeds (${pairCount} pairs)`, () => {
        for (const seed of SWEEP_SEEDS) {
          const deck = createDeck({ pairCount, families: fixture.families, seed });
          expect(deck.seed).toBe(seed);
          assertBoardShape(deck, pairCount);
        }
      });

      it(`reproduces every board exactly for the ${fixture.name} fixture (${pairCount} pairs)`, () => {
        for (const seed of SWEEP_SEEDS) {
          const first = createDeck({ pairCount, families: fixture.families, seed });
          const second = createDeck({ pairCount, families: fixture.families, seed });
          expect(second).toEqual(first);
        }
      });
    }
  }

  it("uses different seeds to produce genuinely different boards", () => {
    const orderings = new Set(
      SWEEP_SEEDS.map((seed) =>
        createDeck({ pairCount: PRODUCTION_PAIR_COUNT, families: GENERIC_FAMILIES, seed })
          .cards.map((card) => `${card.form.numerator}/${card.form.denominator}`)
          .join(","),
      ),
    );
    expect(orderings.size).toBeGreaterThan(SWEEP_SEEDS.length / 2);
  });

  it("keeps every authored form mathematically exact across the whole sweep", () => {
    for (const seed of SWEEP_SEEDS) {
      const deck = createDeck({ pairCount: 4, families: BOUNDARY_FAMILIES, seed });
      for (const cardEntry of deck.cards) {
        const { numerator, denominator, canonical } = cardEntry.form;
        expect(Number.isSafeInteger(numerator)).toBe(true);
        expect(Number.isSafeInteger(denominator)).toBe(true);
        expect(denominator).toBeGreaterThan(0);
        expect(Number.isSafeInteger(canonical.numerator)).toBe(true);
        expect(Number.isSafeInteger(canonical.denominator)).toBe(true);
        expect(canonical.denominator).toBeGreaterThan(0);
      }
    }
  });
});

describe("configuration boundary sweep", () => {
  it("is satisfiable exactly when the fixture can supply whole distinct values", () => {
    for (const fixture of FIXTURE_SETS) {
      const familyCount = fixture.families.length;
      for (let pairCount = 2; pairCount <= familyCount + 2; pairCount += 1) {
        const config = { pairCount, families: fixture.families, seed: DEFAULT_TEST_SEED };
        const satisfiable = pairCount <= familyCount;
        expect(isSatisfiableDeckConfig(config)).toBe(satisfiable);
        expect(validateDeckConfig(config).length === 0).toBe(satisfiable);
        if (satisfiable) {
          expect(() => createDeck(config)).not.toThrow();
        } else {
          expect(() => createDeck(config)).toThrow(/needs at least \d+ distinct equivalence families/);
        }
      }
    }
  });

  it("fails loudly instead of silently shrinking a board when families are removed", () => {
    for (let keep = 0; keep < PRODUCTION_PAIR_COUNT; keep += 1) {
      const families = GENERIC_FAMILIES.slice(0, keep);
      expect(isSatisfiableDeckConfig({ pairCount: PRODUCTION_PAIR_COUNT, families, seed: 1 })).toBe(false);
      expect(() => createDeck({ pairCount: PRODUCTION_PAIR_COUNT, families, seed: 1 })).toThrow();
    }
    // With enough families the same call succeeds, so the failure above is genuine and not a
    // blanket refusal.
    expect(
      isSatisfiableDeckConfig({
        pairCount: PRODUCTION_PAIR_COUNT,
        families: GENERIC_FAMILIES.slice(0, PRODUCTION_PAIR_COUNT),
        seed: 1,
      }),
    ).toBe(true);
  });

  it("supports every board size between the minimum and the fixture ceiling without a parallel path", () => {
    const sizes = [2, 3, 4, 5, 6, 7, 8, 9];
    for (const pairCount of sizes) {
      const deck = createDeck({ pairCount, families: GENERIC_FAMILIES, seed: 31 });
      assertBoardShape(deck, pairCount);
    }
  });
});
