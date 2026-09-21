import { describe, expect, it } from "vitest";

import {
  RATIONAL_ZERO,
  RationalError,
  countRationalOccurrences,
  distinctRationals,
  greatestCommonDivisor,
  isRational,
  rational,
  rationalEquals,
  rationalSigned,
  tryRational,
} from "../src/engine";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

describe("canonical rational construction", () => {
  it("reduces authored pairs to lowest terms", () => {
    expect(rational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(rational(3, 6)).toEqual({ numerator: 1, denominator: 2 });
    expect(rational(6, 8)).toEqual({ numerator: 3, denominator: 4 });
    expect(rational(1, 3)).toEqual({ numerator: 1, denominator: 3 });
  });

  it("satisfies the required equivalence oracle", () => {
    expect(rationalEquals(rational(1, 2), rational(2, 4))).toBe(true);
    expect(rationalEquals(rational(1, 2), rational(3, 6))).toBe(true);
    expect(rationalEquals(rational(1, 2), rational(2, 3))).toBe(false);
  });

  it("normalizes every spelling of zero to 0/1", () => {
    for (const numerator of [0, -0]) {
      expect(rational(numerator, 5)).toEqual({ numerator: 0, denominator: 1 });
      expect(rational(numerator, 1)).toEqual({ numerator: 0, denominator: 1 });
      expect(rationalSigned(numerator, -7)).toEqual({ numerator: 0, denominator: 1 });
    }
    expect(RATIONAL_ZERO).toEqual({ numerator: 0, denominator: 1 });
    expect(Object.is(rational(-0, 5).numerator, -0)).toBe(false);
  });

  it("normalizes the sign onto the numerator", () => {
    expect(rational(-2, 4)).toEqual({ numerator: -1, denominator: 2 });
    expect(rational(-6, 8)).toEqual({ numerator: -3, denominator: 4 });
    expect(rationalSigned(2, -4)).toEqual({ numerator: -1, denominator: 2 });
    expect(rationalSigned(-2, -4)).toEqual({ numerator: 1, denominator: 2 });
    expect(rational(-1, 1).denominator).toBeGreaterThan(0);
  });

  it("returns frozen values so canonical pairs cannot be mutated in place", () => {
    const value = rational(2, 4);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(RATIONAL_ZERO)).toBe(true);
  });

  it("stays exact at the safe-integer boundary", () => {
    expect(rational(MAX_SAFE, MAX_SAFE)).toEqual({ numerator: 1, denominator: 1 });
    expect(rational(0, MAX_SAFE)).toEqual({ numerator: 0, denominator: 1 });
    expect(rational(MAX_SAFE - 1, 2)).toEqual({ numerator: 4_503_599_627_370_495, denominator: 1 });
    expect(rational(MAX_SAFE, 1)).toEqual({ numerator: MAX_SAFE, denominator: 1 });
    expect(rational(1, MAX_SAFE)).toEqual({ numerator: 1, denominator: MAX_SAFE });
  });
});

describe("canonical rational rejection", () => {
  it("rejects a zero denominator", () => {
    expect(() => rational(1, 0)).toThrow(RationalError);
    expect(() => rational(0, 0)).toThrow(RationalError);
    expect(() => rationalSigned(1, 0)).toThrow(/non-zero/);
  });

  it("requires a strictly positive denominator in the canonical constructor", () => {
    expect(() => rational(1, -2)).toThrow(/greater than zero/);
    expect(rationalSigned(1, -2)).toEqual({ numerator: -1, denominator: 2 });
  });

  it("rejects non-safe integers", () => {
    const tooLarge = MAX_SAFE + 1;
    expect(() => rational(tooLarge, 2)).toThrow(/safe integer/);
    expect(() => rational(1, tooLarge)).toThrow(/safe integer/);
    expect(() => rational(1.5, 2)).toThrow(/safe integer/);
    expect(() => rational(1, 2.5)).toThrow(/safe integer/);
    expect(() => rational(Number.NaN, 2)).toThrow(/safe integer/);
    expect(() => rational(1, Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
    expect(() => rational("1" as unknown as number, 2)).toThrow(/safe integer/);
    expect(() => rational(1, null as unknown as number)).toThrow(/safe integer/);
  });

  it("refuses to build a rational from a floating approximation", () => {
    // 1/3 is not representable as a safe integer pair, so an approximation cannot become truth.
    expect(() => rational(0.3333333333333333, 1)).toThrow(RationalError);
    expect(() => rational(1, 3.0000000000000004)).toThrow(RationalError);
  });
});

describe("non-throwing construction and structural checks", () => {
  it("tryRational returns null instead of throwing", () => {
    expect(tryRational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(tryRational(1, 0)).toBeNull();
    expect(tryRational(1, -1)).toBeNull();
  });

  it("isRational accepts only canonical normalized pairs", () => {
    expect(isRational({ numerator: 1, denominator: 2 })).toBe(true);
    expect(isRational({ numerator: 0, denominator: 1 })).toBe(true);
    expect(isRational({ numerator: 2, denominator: 4 })).toBe(false);
    expect(isRational({ numerator: 1, denominator: -2 })).toBe(false);
    expect(isRational({ numerator: 1, denominator: 0 })).toBe(false);
    expect(isRational(null)).toBe(false);
    expect(isRational("1/2")).toBe(false);
    expect(isRational({})).toBe(false);
  });
});

describe("exact equivalence mechanics", () => {
  it("compares normalized integer pairs field by field", () => {
    expect(rationalEquals(rational(1, 2), rationalSigned(2, 4))).toBe(true);
    expect(rationalEquals(rational(1, 2), rational(1, 2))).toBe(true);
    expect(rationalEquals(rational(-1, 2), rational(1, 2))).toBe(false);
    expect(rationalEquals(rational(2, 3), rational(3, 4))).toBe(false);
  });

  it("groups values without string keys", () => {
    const values = [rational(1, 2), rational(2, 4), rational(1, 3), rational(3, 6), rational(0, 9)];
    expect(distinctRationals(values)).toEqual([
      { numerator: 1, denominator: 2 },
      { numerator: 1, denominator: 3 },
      { numerator: 0, denominator: 1 },
    ]);
    // 1/2, 2/4 and 3/6 are the same canonical value, so all three are counted.
    expect(countRationalOccurrences(values, rational(3, 6))).toBe(3);
    expect(countRationalOccurrences(values, rational(1, 3))).toBe(1);
    expect(countRationalOccurrences(values, rational(5, 6))).toBe(0);
    expect(distinctRationals([])).toEqual([]);
  });
});

describe("greatest common divisor", () => {
  it("handles zero, negatives and exact multiples", () => {
    expect(greatestCommonDivisor(0, 5)).toBe(5);
    expect(greatestCommonDivisor(5, 0)).toBe(5);
    expect(greatestCommonDivisor(12, 18)).toBe(6);
    expect(greatestCommonDivisor(-12, 18)).toBe(6);
    expect(greatestCommonDivisor(12, -18)).toBe(6);
    expect(greatestCommonDivisor(-12, -18)).toBe(6);
    expect(greatestCommonDivisor(7, 7)).toBe(7);
    expect(greatestCommonDivisor(3, 5)).toBe(1);
    expect(greatestCommonDivisor(MAX_SAFE, MAX_SAFE)).toBe(MAX_SAFE);
    expect(greatestCommonDivisor(1, MAX_SAFE)).toBe(1);
  });
});

describe("RationalError", () => {
  it("is a distinguishable, well-named error", () => {
    const error = new RationalError("nope");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RationalError");
    expect(error.message).toBe("nope");
  });
});
