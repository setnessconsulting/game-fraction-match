import { describe, expect, it } from "vitest";

import {
  FractionFormError,
  PRODUCTION_PAIR_COUNT,
  RATIONAL_ZERO,
  RationalError,
  applyAction,
  compareRationals,
  countRationalOccurrences,
  createDeck,
  createFractionForm,
  createFractionFormFromInput,
  createGameState,
  distinctRationals,
  fractionFormsShareValue,
  greatestCommonDivisor,
  isRational,
  isReducedFractionForm,
  isSameAuthoredForm,
  rational,
  rationalEquals,
  tryRational,
  type FractionForm,
  type Rational,
} from "../src/engine";
import { DEFAULT_TEST_SEED, GENERIC_FAMILIES } from "./fixtures";

/**
 * Canonical fraction equivalence regression suite.
 *
 * GAME-97's binding rule is that one normalized integer pair decides everything: `1/2` and `2/4` are
 * two different cards and one value. `tests/rational.test.ts` and `tests/fractionForm.test.ts`
 * already pin the constructors, the authored-form split and the basic oracle; this suite exists to
 * make the *equivalence* claim broad and adversarial:
 *
 * - the enumerated equivalence cases (halves, thirds, larger equivalents, one, zero numerator,
 *   denominator one, improper, negative) are each stated as a group of authored forms that must
 *   share exactly one canonical value;
 * - the near-misses (same numerator, same denominator, adjacent values, reciprocal, sign) are each
 *   stated as a pair that must stay distinct;
 * - the whole constructor/equivalence/comparison surface is re-checked against an **independent
 *   BigInt oracle** over a systematic sweep, so any accidental floating-point shortcut fails here;
 * - the specific values where IEEE doubles demonstrably conflate two distinct fractions are
 *   asserted to remain distinct, and unreduced equivalents to remain equal.
 *
 * The oracle is deliberately a second, slower implementation. Exactness cannot be tested by
 * restating the implementation under test, and `Number` arithmetic is the shortcut that would make
 * `1/2` and `2/4` "close enough" instead of equal.
 */

/** One authored `numerator/denominator`. Both parts stay safe integers; the denominator stays positive. */
type AuthoredPair = readonly [numerator: number, denominator: number];

/**
 * Independent exact oracle: reduce a pair with BigInt only, never a double, and normalize the sign
 * onto the numerator the same way the canonical contract requires. `Number(...)` is used only to
 * hand the *exact* integer result back in the engine's own shape.
 */
function oracleReduce(numerator: number, denominator: number): Rational {
  const rawNumerator = BigInt(numerator);
  const rawDenominator = BigInt(denominator);

  let left = rawNumerator < 0n ? -rawNumerator : rawNumerator;
  let right = rawDenominator < 0n ? -rawDenominator : rawDenominator;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  const divisor = left === 0n ? 1n : left;
  const reducedNumerator = rawNumerator / divisor;
  const reducedDenominator = rawDenominator / divisor;

  return reducedDenominator < 0n
    ? { numerator: Number(-reducedNumerator), denominator: Number(-reducedDenominator) }
    : { numerator: Number(reducedNumerator), denominator: Number(reducedDenominator) };
}

/** Exact equivalence by BigInt cross product. Positive denominators only, which every fixture uses. */
function oracleEquals(left: AuthoredPair, right: AuthoredPair): boolean {
  return BigInt(left[0]) * BigInt(right[1]) === BigInt(right[0]) * BigInt(left[1]);
}

/** Exact ordering by BigInt cross product, independent of the engine's subtraction-free recursion. */
function oracleCompare(left: AuthoredPair, right: AuthoredPair): -1 | 0 | 1 {
  const scaledLeft = BigInt(left[0]) * BigInt(right[1]);
  const scaledRight = BigInt(right[0]) * BigInt(left[1]);
  if (scaledLeft === scaledRight) return 0;
  return scaledLeft < scaledRight ? -1 : 1;
}

const formOf = ([numerator, denominator]: AuthoredPair): FractionForm =>
  createFractionForm(numerator, denominator);

const canonicalOf = (pair: AuthoredPair): Rational => formOf(pair).canonical;

/**
 * Every authored form in a group denotes one amount. The first entry is the reduced spelling, but
 * the group is deliberately *unordered* as far as the assertions are concerned.
 */
const EQUIVALENT_GROUPS: readonly (readonly AuthoredPair[])[] = [
  // 1/2 vs 2/4, and already-simplified versus larger equivalents of the same value.
  [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10], [50, 100], [500, 1_000], [500_000_000, 1_000_000_000]],
  // 2/3 vs 4/6, and larger equivalents.
  [[2, 3], [4, 6], [6, 9], [20, 30], [200, 300]],
  [[3, 4], [6, 8], [9, 12], [75, 100]],
  [[1, 3], [2, 6], [33, 99], [333_333, 999_999]],
  [[1, 7], [2, 14], [142_857, 999_999]],
  // Fractions equal to one.
  [[1, 1], [2, 2], [5, 5], [7, 7], [100, 100]],
  // Zero numerator: every spelling collapses to the single canonical 0/1.
  [[0, 1], [0, 2], [0, 5], [0, 999]],
  // A denominator of one, and whole numbers written as scaled fractions.
  [[3, 1], [6, 2], [9, 3], [300, 100]],
  [[7, 1], [14, 2]],
  // Improper fractions.
  [[5, 2], [10, 4], [25, 10], [250, 100]],
  [[11, 4], [22, 8], [110, 40]],
  // Negative values are supported canonical values even though the shipped lanes never author them.
  [[-1, 2], [-2, 4], [-3, 6]],
  [[-3, 4], [-6, 8]],
  [[-7, 1], [-14, 2]],
];

/**
 * Pairs that are close, plausible distractors — or conflated by double arithmetic — but are not the
 * same amount. Each is stated as `[left, right, why]` so a failure names the relationship that was
 * supposed to keep them apart.
 */
const NON_EQUIVALENT_PAIRS: readonly (readonly [AuthoredPair, AuthoredPair, string])[] = [
  [[1, 2], [1, 3], "same numerator, different denominator"],
  [[3, 4], [3, 5], "same numerator, different denominator"],
  [[5, 8], [5, 6], "same numerator, different denominator"],
  [[2, 5], [3, 5], "different numerator, same denominator"],
  [[7, 10], [9, 10], "different numerator, same denominator"],
  [[1, 9], [8, 9], "different numerator, same denominator"],
  [[1, 2], [2, 3], "adjacent values"],
  [[2, 3], [4, 7], "close but not equal"],
  [[3, 4], [4, 5], "close but not equal"],
  [[7, 8], [8, 9], "close but not equal"],
  [[1, 100], [1, 99], "adjacent unit fractions"],
  [[1, 1], [1, 2], "whole versus part"],
  [[0, 1], [1, 1], "zero versus one"],
  [[5, 1], [5, 2], "whole versus half of the same numerator"],
  [[5, 2], [2, 5], "a reciprocal is not equal"],
  [[1, 2], [-1, 2], "the sign is part of the value"],
  [[-3, 4], [3, 4], "the sign is part of the value"],
  [[9_007_199_254_740, 9_007_199_254_741], [9_007_199_254_741, 9_007_199_254_742], "identical double cross product"],
  [[9_007_199_254_988, 9_007_199_254_989], [9_007_199_254_989, 9_007_199_254_990], "identical double quotient"],
];

describe("equivalent fractions are one value", () => {
  it("gives every authored form in a group the same canonical pair", () => {
    for (const group of EQUIVALENT_GROUPS) {
      const [head, ...rest] = group;
      if (head === undefined) throw new Error("an equivalence group must not be empty");
      const expected = canonicalOf(head);

      for (const pair of rest) {
        const label = `${pair[0]}/${pair[1]} vs ${head[0]}/${head[1]}`;
        expect(canonicalOf(pair), label).toEqual(expected);
        expect(rationalEquals(canonicalOf(pair), expected), label).toBe(true);
        expect(fractionFormsShareValue(formOf(pair), formOf(head)), label).toBe(true);
        // The oracle does not share a line of arithmetic with the engine.
        expect(oracleReduce(pair[0], pair[1]), label).toEqual(expected);
        expect(oracleEquals(pair, head), label).toBe(true);
      }
    }
  });

  it("reduces every listed authored form to the oracle's independent canonical pair", () => {
    for (const group of EQUIVALENT_GROUPS) {
      for (const pair of group) {
        expect(formOf(pair).canonical, `${pair[0]}/${pair[1]}`).toEqual(oracleReduce(pair[0], pair[1]));
      }
    }
  });

  it("never conflates authored forms from different groups", () => {
    for (let leftIndex = 0; leftIndex < EQUIVALENT_GROUPS.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < EQUIVALENT_GROUPS.length; rightIndex += 1) {
        const left = EQUIVALENT_GROUPS[leftIndex]!;
        const right = EQUIVALENT_GROUPS[rightIndex]!;

        for (const leftPair of left) {
          for (const rightPair of right) {
            const label = `${leftPair[0]}/${leftPair[1]} must differ from ${rightPair[0]}/${rightPair[1]}`;
            expect(rationalEquals(canonicalOf(leftPair), canonicalOf(rightPair)), label).toBe(false);
            expect(fractionFormsShareValue(formOf(leftPair), formOf(rightPair)), label).toBe(false);
            expect(compareRationals(canonicalOf(leftPair), canonicalOf(rightPair)), label).not.toBe(0);
            expect(oracleEquals(leftPair, rightPair), label).toBe(false);
          }
        }
      }
    }
  });

  it("keeps simplified and unsimplified spellings visually distinct but mathematically equal", () => {
    const reduced = formOf([1, 2]);
    const unreduced = formOf([2, 4]);
    const scaled = formOf([500_000_000, 1_000_000_000]);

    expect(isReducedFractionForm(reduced)).toBe(true);
    expect(isReducedFractionForm(unreduced)).toBe(false);
    expect(isReducedFractionForm(scaled)).toBe(false);

    // The authored notation differs...
    expect(isSameAuthoredForm(reduced, unreduced)).toBe(false);
    expect(isSameAuthoredForm(unreduced, scaled)).toBe(false);
    expect([unreduced.numerator, unreduced.denominator]).toEqual([2, 4]);
    expect([scaled.numerator, scaled.denominator]).toEqual([500_000_000, 1_000_000_000]);

    // ...while the value does not.
    expect(fractionFormsShareValue(reduced, unreduced)).toBe(true);
    expect(fractionFormsShareValue(unreduced, scaled)).toBe(true);
    expect(rationalEquals(reduced.canonical, scaled.canonical)).toBe(true);
  });

  it("normalizes every equivalent spelling of zero to the one canonical zero", () => {
    for (const pair of EQUIVALENT_GROUPS.flat()) {
      if (pair[0] !== 0) continue;
      expect(canonicalOf(pair), `${pair[0]}/${pair[1]}`).toEqual({ numerator: 0, denominator: 1 });
      expect(rationalEquals(canonicalOf(pair), RATIONAL_ZERO)).toBe(true);
    }
  });

  it("sign-normalizes equivalent negative spellings", () => {
    expect(canonicalOf([-1, 2])).toEqual({ numerator: -1, denominator: 2 });
    expect(canonicalOf([-2, 4])).toEqual({ numerator: -1, denominator: 2 });
    expect(canonicalOf([-7, 1])).toEqual({ numerator: -7, denominator: 1 });
    expect(canonicalOf([-14, 2])).toEqual({ numerator: -7, denominator: 1 });
  });
});

describe("matches are never a coincidence of notation", () => {
  it("keeps same-numerator, same-denominator and near values apart", () => {
    for (const [left, right, why] of NON_EQUIVALENT_PAIRS) {
      const label = `${left[0]}/${left[1]} vs ${right[0]}/${right[1]} (${why})`;
      expect(rationalEquals(canonicalOf(left), canonicalOf(right)), label).toBe(false);
      expect(fractionFormsShareValue(formOf(left), formOf(right)), label).toBe(false);
      expect(oracleEquals(left, right), label).toBe(false);
      expect(compareRationals(canonicalOf(left), canonicalOf(right)), label).not.toBe(0);
      expect(compareRationals(canonicalOf(left), canonicalOf(right)), label).toBe(
        oracleCompare(left, right),
      );
    }
  });

  it("distinguishes values that a double quotient would report as identical", () => {
    const smaller = formOf([9_007_199_254_988, 9_007_199_254_989]);
    const larger = formOf([9_007_199_254_989, 9_007_199_254_990]);

    // The dangerous demonstration: these are genuinely different amounts, both already in lowest
    // terms, yet IEEE doubles cannot tell them apart.
    expect(greatestCommonDivisor(smaller.numerator, smaller.denominator)).toBe(1);
    expect(greatestCommonDivisor(larger.numerator, larger.denominator)).toBe(1);
    expect(smaller.numerator / smaller.denominator).toBe(larger.numerator / larger.denominator);

    // The canonical pair still does, and does not even need to know which is which.
    expect(rationalEquals(smaller.canonical, larger.canonical)).toBe(false);
    expect(compareRationals(smaller.canonical, larger.canonical)).toBe(-1);
    expect(compareRationals(larger.canonical, smaller.canonical)).toBe(1);
  });

  it("stays exact where a floating-point cross product would lose the difference", () => {
    const smaller = formOf([9_007_199_254_740, 9_007_199_254_741]);
    const larger = formOf([9_007_199_254_741, 9_007_199_254_742]);

    // The double cross products are identical here, which is exactly why the engine compares the
    // normalized pairs rather than multiplying them as doubles.
    expect(smaller.numerator * larger.denominator).toBe(larger.numerator * smaller.denominator);

    expect(rationalEquals(smaller.canonical, larger.canonical)).toBe(false);
    expect(compareRationals(smaller.canonical, larger.canonical)).toBe(-1);
  });
});

describe("independent exact oracle sweep", () => {
  const NUMERATORS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
  const DENOMINATORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const PAIRS: readonly AuthoredPair[] = NUMERATORS.flatMap((numerator) =>
    DENOMINATORS.map((denominator): AuthoredPair => [numerator, denominator]),
  );

  it("reduces every swept pair to the oracle's own canonical pair", () => {
    for (const pair of PAIRS) {
      const label = `${pair[0]}/${pair[1]}`;
      const canonical = rational(pair[0], pair[1]);
      expect(canonical, label).toEqual(oracleReduce(pair[0], pair[1]));
      expect(Number.isSafeInteger(canonical.numerator), label).toBe(true);
      expect(Number.isSafeInteger(canonical.denominator), label).toBe(true);
      expect(canonical.denominator, label).toBeGreaterThan(0);
      if (canonical.numerator === 0) expect(canonical, label).toEqual({ numerator: 0, denominator: 1 });
    }
  });

  it("agrees with the oracle on equivalence and ordering for every ordered pair", () => {
    for (const left of PAIRS) {
      for (const right of PAIRS) {
        const label = `${left[0]}/${left[1]} vs ${right[0]}/${right[1]}`;
        const leftCanonical = rational(left[0], left[1]);
        const rightCanonical = rational(right[0], right[1]);

        expect(rationalEquals(leftCanonical, rightCanonical), label).toBe(oracleEquals(left, right));
        expect(fractionFormsShareValue(formOf(left), formOf(right)), label).toBe(oracleEquals(left, right));
        expect(compareRationals(leftCanonical, rightCanonical), label).toBe(oracleCompare(left, right));
        // Zero comparison and pair equality are the same relation, always.
        expect(compareRationals(leftCanonical, rightCanonical) === 0, label).toBe(
          rationalEquals(leftCanonical, rightCanonical),
        );
      }
    }
  });

  it("orders as a total order: antisymmetric and transitive", () => {
    // A reduced, deduplicated sample keeps the cubic transitivity check cheap without weakening it.
    const distinct: Rational[] = distinctRationals(PAIRS.map((pair) => rational(pair[0], pair[1])));
    const sample = distinct.slice(0, 36);
    expect(sample.length).toBeGreaterThan(20);

    for (const left of sample) {
      for (const right of sample) {
        expect(compareRationals(right, left), "antisymmetry").toBe(
          compareRationals(left, right) === 0 ? 0 : compareRationals(left, right) === 1 ? -1 : 1,
        );
      }
    }

    for (const first of sample) {
      for (const second of sample) {
        if (compareRationals(first, second) > 0) continue;
        for (const third of sample) {
          if (compareRationals(second, third) > 0) continue;
          expect(compareRationals(first, third), "transitivity").toBeLessThanOrEqual(0);
        }
      }
    }
  });
});

describe("a dealt board agrees with the equivalence oracle, pair by pair", () => {
  it("matches exactly the generated card pairs that share a canonical value", () => {
    for (const seed of [DEFAULT_TEST_SEED, 7, 12_345]) {
      const deck = createDeck({ pairCount: PRODUCTION_PAIR_COUNT, families: GENERIC_FAMILIES, seed });

      for (let left = 0; left < deck.cards.length; left += 1) {
        for (let right = left + 1; right < deck.cards.length; right += 1) {
          const leftCard = deck.cards[left]!;
          const rightCard = deck.cards[right]!;
          const revealed = applyAction(createGameState(deck), { type: "select-card", cardIndex: left }).state;
          const resolved = applyAction(revealed, { type: "select-card", cardIndex: right }).state;

          const expected = fractionFormsShareValue(leftCard.form, rightCard.form);
          expect(
            resolved.lastResolution?.outcome === "match",
            `seed ${seed}: cards ${left} and ${right}`,
          ).toBe(expected);
          // The engine and the independent oracle must agree on the same question.
          expect(
            resolved.lastResolution?.outcome === "match",
            `seed ${seed}: cards ${left} and ${right} (oracle)`,
          ).toBe(oracleEquals([leftCard.form.numerator, leftCard.form.denominator], [rightCard.form.numerator, rightCard.form.denominator]));
        }
      }
    }
  });
});

describe("duplicate equivalent representations", () => {
  it("collapses equivalent spellings to one value without using a string key", () => {
    const values: readonly Rational[] = [
      rational(1, 2),
      rational(2, 4),
      rational(3, 6),
      rational(1, 3),
      rational(2, 6),
      rational(0, 7),
      rational(0, 9),
      rational(5, 5),
      rational(1, 1),
    ];

    expect(distinctRationals(values)).toEqual([
      { numerator: 1, denominator: 2 },
      { numerator: 1, denominator: 3 },
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 1 },
    ]);

    // Every equivalent spelling is counted against the one canonical target.
    expect(countRationalOccurrences(values, rational(3, 6))).toBe(3);
    expect(countRationalOccurrences(values, rational(2, 3))).toBe(0);
    expect(countRationalOccurrences(values, rational(0, 5))).toBe(2);
    expect(countRationalOccurrences(values, rational(1, 1))).toBe(2);
  });
});

describe("malformed input through the public fraction API", () => {
  it("refuses a zero or negative denominator in both constructors", () => {
    // The authored-form path validates first and reports its own error type...
    expect(() => createFractionForm(1, 0)).toThrow(FractionFormError);
    expect(() => createFractionForm(1, -2)).toThrow(/greater than zero/);
    expect(() => createFractionFormFromInput({ numerator: 1, denominator: 0 })).toThrow(FractionFormError);
    expect(() => createFractionFormFromInput({ numerator: 1, denominator: -2 })).toThrow(/greater than zero/);
    // ...while the canonical constructor rejects a zero denominator and normalizes a negative one.
    expect(() => rational(1, 0)).toThrow(RationalError);
    expect(tryRational(1, 0)).toBeNull();
    expect(tryRational(1, -2)).toBeNull();
  });

  it("refuses missing or non-integer parts instead of coercing them", () => {
    expect(() => createFractionFormFromInput({} as { numerator: number; denominator: number })).toThrow(
      /safe integer/,
    );
    expect(() =>
      createFractionFormFromInput({ numerator: 1 } as unknown as { numerator: number; denominator: number }),
    ).toThrow(/safe integer/);
    expect(() =>
      createFractionFormFromInput({ denominator: 2 } as unknown as { numerator: number; denominator: number }),
    ).toThrow(/safe integer/);
    expect(() => createFractionForm("1" as unknown as number, 2)).toThrow(/safe integer/);
    expect(() => createFractionForm(1, 2.5)).toThrow(/safe integer/);
    expect(() => createFractionForm(Number.NaN, 2)).toThrow(/safe integer/);
    expect(() => createFractionForm(1, Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
  });

  it("accepts only canonical pairs as already-canonical values", () => {
    expect(isRational({ numerator: 1, denominator: 2 })).toBe(true);
    expect(isRational({ numerator: 2, denominator: 4 })).toBe(false);
    expect(isRational({ numerator: -1, denominator: -2 })).toBe(false);
    expect(isRational({ numerator: 0, denominator: 9 })).toBe(false);
    expect(isRational({ numerator: 1, denominator: 0 })).toBe(false);
  });
});
