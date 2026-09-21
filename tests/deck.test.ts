import { describe, expect, it } from "vitest";

import {
  DeckConfigError,
  DeckInvariantError,
  MAX_PAIR_COUNT,
  MIN_PAIR_COUNT,
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  assertDeckEquivalenceInvariants,
  countRationalOccurrences,
  createDeck,
  createFractionForm,
  distinctRationals,
  isSatisfiableDeckConfig,
  validateDeckConfig,
  type DeckCard,
  type DeckConfig,
  type EquivalenceFamily,
} from "../src/engine";
import { BOUNDARY_FAMILIES, DEFAULT_TEST_SEED, FOUR_FAMILIES, GENERIC_FAMILIES } from "./fixtures";

const baseConfig = (overrides: Partial<DeckConfig> = {}): DeckConfig => ({
  pairCount: PRODUCTION_PAIR_COUNT,
  families: GENERIC_FAMILIES,
  seed: DEFAULT_TEST_SEED,
  ...overrides,
});

/** A two-pair board: the family under test plus one harmless padding family. */
const PADDING_FAMILY: EquivalenceFamily = {
  familyId: "padding",
  forms: [
    { numerator: 7, denominator: 9 },
    { numerator: 14, denominator: 18 },
  ],
};

const familyConfig = (family: EquivalenceFamily): DeckConfig => ({
  pairCount: 2,
  families: [family, PADDING_FAMILY],
  seed: DEFAULT_TEST_SEED,
});

const cardWith = (canonicalNumerator: number, canonicalDenominator: number, pairId = "x"): DeckCard => ({
  cardId: `card-${canonicalNumerator}-${canonicalDenominator}-${pairId}`,
  pairId,
  form: createFractionForm(canonicalNumerator, canonicalDenominator),
});

describe("deck generation", () => {
  it("deals the 8-pair production board and the 4-pair warm-up from one implementation", () => {
    const production = createDeck(baseConfig({ pairCount: PRODUCTION_PAIR_COUNT }));
    const warmUp = createDeck(baseConfig({ pairCount: WARM_UP_PAIR_COUNT }));

    expect(PRODUCTION_PAIR_COUNT).toBe(8);
    expect(WARM_UP_PAIR_COUNT).toBe(4);
    expect(production.cardCount).toBe(16);
    expect(production.cards).toHaveLength(16);
    expect(warmUp.cardCount).toBe(8);
    expect(warmUp.cards).toHaveLength(8);
    expect(production.usedFamilyIds).toHaveLength(8);
    expect(warmUp.usedFamilyIds).toHaveLength(4);
  });

  it("puts exactly two cards on every chosen mathematical value and no two pairs share a value", () => {
    const deck = createDeck(baseConfig());
    const canonicals = deck.cards.map((card) => card.form.canonical);

    const values = distinctRationals(canonicals);
    expect(values).toHaveLength(PRODUCTION_PAIR_COUNT);
    for (const value of values) {
      expect(countRationalOccurrences(canonicals, value)).toBe(2);
    }
    expect(new Set(deck.usedFamilyIds).size).toBe(PRODUCTION_PAIR_COUNT);
    expect(() => assertDeckEquivalenceInvariants(deck.cards, deck.pairCount)).not.toThrow();
  });

  it("gives each pair two visually distinct authored forms", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const deck = createDeck(baseConfig({ seed }));
      for (const familyId of deck.usedFamilyIds) {
        const pair = deck.cards.filter((card) => card.pairId === familyId);
        expect(pair).toHaveLength(2);
        const authored = pair.map((card) => `${card.form.numerator}/${card.form.denominator}`);
        expect(new Set(authored).size).toBe(2);
        expect(pair[0]!.form.canonical).toEqual(pair[1]!.form.canonical);
      }
    }
  });

  it("deals identical boards for identical seeds and different boards for different seeds", () => {
    const first = createDeck(baseConfig({ seed: 777 }));
    const second = createDeck(baseConfig({ seed: 777 }));
    expect(second).toEqual(first);

    const orderings = new Set(
      [11, 22, 33, 44, 55, 66, 77, 88].map((seed) =>
        createDeck(baseConfig({ seed }))
          .cards.map((card) => `${card.cardId}|${card.pairId}|${card.form.numerator}/${card.form.denominator}`)
          .join(","),
      ),
    );
    expect(orderings.size).toBe(8);
  });

  it("assigns stable unique card ids and freezes the dealt structures", () => {
    const deck = createDeck(baseConfig());
    expect(new Set(deck.cards.map((card) => card.cardId)).size).toBe(16);
    expect(deck.cards[0]!.cardId).toBe("fm-card-0");
    expect(Object.isFrozen(deck)).toBe(true);
    expect(Object.isFrozen(deck.cards)).toBe(true);
    expect(Object.isFrozen(deck.cards[0])).toBe(true);
    expect(Object.isFrozen(deck.usedFamilyIds)).toBe(true);
  });

  it("stays exact on a boundary fixture with whole numbers and the safe-integer ceiling", () => {
    const deck = createDeck({ pairCount: 4, families: BOUNDARY_FAMILIES, seed: 2026 });
    expect(deck.cards).toHaveLength(8);
    const values = distinctRationals(deck.cards.map((card) => card.form.canonical));
    expect(values).toContainEqual({ numerator: 4_503_599_627_370_495, denominator: 1 });
    expect(values).toContainEqual({ numerator: 1, denominator: 1 });
    expect(values).toContainEqual({ numerator: 1, denominator: 100 });
  });
});

describe("deck configuration validation", () => {
  const problemsOf = (config: DeckConfig): string => validateDeckConfig(config).join("\n");

  it("accepts a satisfiable configuration", () => {
    expect(validateDeckConfig(baseConfig())).toEqual([]);
    expect(isSatisfiableDeckConfig(baseConfig())).toBe(true);
  });

  it("rejects a non-object configuration", () => {
    expect(validateDeckConfig(null as unknown as DeckConfig)).toEqual([
      "deck config must be an object; received null",
    ]);
    expect(validateDeckConfig("nope" as unknown as DeckConfig)[0]).toMatch(/must be an object; received string/);
    expect(() => createDeck(null as unknown as DeckConfig)).toThrow(DeckConfigError);
  });

  it("rejects unsupported board sizes", () => {
    expect(problemsOf(baseConfig({ pairCount: MIN_PAIR_COUNT - 1 }))).toMatch(/at least 2/);
    expect(problemsOf(baseConfig({ pairCount: MAX_PAIR_COUNT + 1 }))).toMatch(/at most 32/);
    expect(problemsOf(baseConfig({ pairCount: 4.5 }))).toMatch(/pairCount must be a safe integer/);
    expect(problemsOf(baseConfig({ pairCount: [] as unknown as number }))).toMatch(/array\(length 0\)/);
  });

  it("rejects unusable seeds", () => {
    expect(problemsOf(baseConfig({ seed: -5 }))).toMatch(/seed must be within 0\.\.4294967295/);
    expect(problemsOf(baseConfig({ seed: 1.5 }))).toMatch(/seed must be a safe integer/);
    expect(() => createDeck(baseConfig({ seed: -5 }))).toThrow(DeckConfigError);
  });

  it("rejects a family list that cannot supply enough distinct values", () => {
    expect(problemsOf(baseConfig({ families: "nope" as unknown as typeof GENERIC_FAMILIES }))).toMatch(
      /families must be an array; received string/,
    );
    expect(problemsOf(baseConfig({ families: [] }))).toMatch(/at least one equivalence family/);
    expect(problemsOf(baseConfig({ families: FOUR_FAMILIES }))).toMatch(
      /needs at least 8 distinct equivalence families; received 4/,
    );
    expect(isSatisfiableDeckConfig(baseConfig({ families: FOUR_FAMILIES }))).toBe(false);
  });

  it("rejects malformed families", () => {
    expect(
      problemsOf({ pairCount: 2, seed: DEFAULT_TEST_SEED, families: [null, PADDING_FAMILY] as unknown as EquivalenceFamily[] }),
    ).toMatch(/families\[0\] must be an object/);

    expect(problemsOf(familyConfig({ familyId: "  ", forms: [{ numerator: 1, denominator: 2 }] }))).toMatch(
      /familyId must be a non-empty string/,
    );
    expect(
      problemsOf(familyConfig({ familyId: 7 as unknown as string, forms: [{ numerator: 1, denominator: 2 }] })),
    ).toMatch(/familyId must be a non-empty string; received 7/);

    expect(
      problemsOf({
        pairCount: 2,
        seed: DEFAULT_TEST_SEED,
        families: [
          { familyId: "dup", forms: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }] },
          { familyId: "dup", forms: [{ numerator: 1, denominator: 3 }, { numerator: 2, denominator: 6 }] },
        ],
      }),
    ).toMatch(/familyId "dup" is duplicated/);

    expect(problemsOf(familyConfig({ familyId: "a", forms: "no" as unknown as [] }))).toMatch(
      /forms must be an array; received string/,
    );
    expect(problemsOf(familyConfig({ familyId: "a", forms: [] }))).toMatch(
      /needs at least two authored forms; received 0/,
    );
    expect(
      problemsOf(
        familyConfig({
          familyId: "a",
          forms: [
            { numerator: 1 } as unknown as { numerator: number; denominator: number },
            { numerator: 1, denominator: 0 },
          ],
        }),
      ),
    ).toMatch(/not a valid fraction form: fraction denominator must be a safe integer/);
  });

  it("reports a non-Error throw as a validation problem instead of crashing", () => {
    const hostileForm = new Proxy(
      {},
      {
        get() {
          throw "unexpected string throw";
        },
      },
    );
    expect(
      problemsOf(
        familyConfig({
          familyId: "hostile",
          forms: [hostileForm, hostileForm] as unknown as { numerator: number; denominator: number }[],
        }),
      ),
    ).toMatch(/not a valid fraction form: unexpected string throw/);
  });

  it("rejects families that are not equivalence families", () => {
    expect(
      problemsOf(
        familyConfig({
          familyId: "mixed",
          forms: [
            { numerator: 1, denominator: 2 },
            { numerator: 2, denominator: 3 },
          ],
        }),
      ),
    ).toMatch(/is not an equivalence family/);
  });

  it("rejects two different pairs that would collapse to the same canonical value", () => {
    expect(
      problemsOf({
        pairCount: 2,
        seed: DEFAULT_TEST_SEED,
        families: [
          { familyId: "half-a", forms: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }] },
          { familyId: "half-b", forms: [{ numerator: 3, denominator: 6 }, { numerator: 4, denominator: 8 }] },
        ],
      }),
    ).toMatch(/duplicates the canonical value of an earlier family \(1\/2\)/);
  });

  it("requires two distinct authored forms by default and allows repeated notation on request", () => {
    const repeatedFamilies: EquivalenceFamily[] = [
      { familyId: "repeat-half", forms: [{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 }] },
      { familyId: "repeat-third", forms: [{ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 3 }] },
    ];

    expect(problemsOf({ pairCount: 2, families: repeatedFamilies, seed: DEFAULT_TEST_SEED })).toMatch(
      /needs two visually distinct authored forms but supplies 1 \(1\/2\)/,
    );
    expect(isSatisfiableDeckConfig({ pairCount: 2, families: repeatedFamilies, seed: 1 })).toBe(false);

    const allowed = createDeck({
      pairCount: 2,
      families: repeatedFamilies,
      seed: 5,
      constraints: { requireDistinctAuthoredForms: false },
    });
    expect(allowed.cards).toHaveLength(4);
    for (const familyId of allowed.usedFamilyIds) {
      const pair = allowed.cards.filter((card) => card.pairId === familyId);
      expect(new Set(pair.map((card) => `${card.form.numerator}/${card.form.denominator}`)).size).toBe(1);
    }
  });

  it("reports every problem it finds rather than the first", () => {
    expect(validateDeckConfig({ pairCount: 0, families: [], seed: -1 })).toHaveLength(3);
  });
});

describe("deck invariants", () => {
  it("throws when the number of distinct values is wrong", () => {
    const cards = [cardWith(1, 2, "a"), cardWith(2, 4, "a"), cardWith(1, 3, "b"), cardWith(1, 3, "b")];
    expect(() => assertDeckEquivalenceInvariants(cards, 3)).toThrow(DeckInvariantError);
    expect(() => assertDeckEquivalenceInvariants(cards, 3)).toThrow(/expected 3 distinct mathematical values/);
  });

  it("throws when a value does not appear exactly twice", () => {
    const cards = [cardWith(1, 2, "a"), cardWith(2, 4, "a"), cardWith(1, 3, "b")];
    expect(() => assertDeckEquivalenceInvariants(cards, 2)).toThrow(/must appear exactly twice; 1\/3 appears 1 time/);

    const tripled = [
      cardWith(1, 2, "a"),
      cardWith(2, 4, "a"),
      cardWith(3, 6, "a"),
      cardWith(1, 3, "b"),
      cardWith(2, 6, "b"),
      cardWith(1, 4, "c"),
      cardWith(2, 8, "c"),
    ];
    expect(() => assertDeckEquivalenceInvariants(tripled, 3)).toThrow(/1\/2 appears 3 time/);
  });

  it("accepts a genuinely valid card list regardless of pair identifiers", () => {
    const cards = [cardWith(1, 2, "whatever"), cardWith(2, 4, "different"), cardWith(1, 3, "x"), cardWith(2, 6, "y")];
    expect(() => assertDeckEquivalenceInvariants(cards, 2)).not.toThrow();
  });

  it("names its error types", () => {
    expect(new DeckConfigError(["a"]).problems).toEqual(["a"]);
    expect(new DeckConfigError(["a"]).message).toMatch(/deck configuration is invalid/);
    expect(new DeckInvariantError("x").name).toBe("DeckInvariantError");
  });
});
