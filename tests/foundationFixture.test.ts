import { describe, expect, it } from "vitest";

import {
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  assertDeckEquivalenceInvariants,
  createDeck,
  createFractionFormFromInput,
  distinctRationals,
  isSatisfiableDeckConfig,
  validateDeckConfig,
} from "../src/engine";
import { FOUNDATION_DEBUG_SEED, FOUNDATION_FAMILIES } from "../src/app/foundationFixture";

describe("foundation debug fixture", () => {
  it("is structurally valid and provides more families than the board needs", () => {
    expect(FOUNDATION_FAMILIES.length).toBeGreaterThan(PRODUCTION_PAIR_COUNT);
    expect(new Set(FOUNDATION_FAMILIES.map((family) => family.familyId)).size).toBe(FOUNDATION_FAMILIES.length);
    expect(Number.isSafeInteger(FOUNDATION_DEBUG_SEED)).toBe(true);
    expect(FOUNDATION_DEBUG_SEED).toBeGreaterThanOrEqual(0);

    for (const family of FOUNDATION_FAMILIES) {
      expect(family.forms.length).toBeGreaterThanOrEqual(2);
      const canonicals = family.forms.map((form) => createFractionFormFromInput(form).canonical);
      expect(distinctRationals(canonicals)).toHaveLength(1);
    }
  });

  it("is a satisfiable configuration for both supported board sizes", () => {
    for (const pairCount of [WARM_UP_PAIR_COUNT, PRODUCTION_PAIR_COUNT]) {
      const config = { pairCount, families: FOUNDATION_FAMILIES, seed: FOUNDATION_DEBUG_SEED };
      expect(validateDeckConfig(config)).toEqual([]);
      expect(isSatisfiableDeckConfig(config)).toBe(true);
    }
  });

  it("deals the exact board the foundation shell renders", () => {
    const deck = createDeck({
      pairCount: PRODUCTION_PAIR_COUNT,
      families: FOUNDATION_FAMILIES,
      seed: FOUNDATION_DEBUG_SEED,
    });

    expect(deck.cardCount).toBe(16);
    expect(() => assertDeckEquivalenceInvariants(deck.cards, PRODUCTION_PAIR_COUNT)).not.toThrow();

    const values = distinctRationals(deck.cards.map((card) => card.form.canonical));
    expect(values).toHaveLength(PRODUCTION_PAIR_COUNT);
  });

  it("deals a warm-up board without a parallel code path", () => {
    const deck = createDeck({
      pairCount: WARM_UP_PAIR_COUNT,
      families: FOUNDATION_FAMILIES,
      seed: FOUNDATION_DEBUG_SEED,
    });
    expect(deck.cardCount).toBe(8);
    expect(deck.cards).toHaveLength(8);
  });
});
