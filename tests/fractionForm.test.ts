import { describe, expect, it } from "vitest";

import {
  FractionFormError,
  createFractionForm,
  createFractionFormFromInput,
  fractionFormsShareValue,
  isReducedFractionForm,
  isSameAuthoredForm,
  tryCreateFractionForm,
} from "../src/engine";

describe("authored form preservation", () => {
  it("keeps mathematically equivalent but visually different notation apart", () => {
    const half = createFractionForm(1, 2);
    const twoQuarters = createFractionForm(2, 4);
    const threeSixths = createFractionForm(3, 6);

    // Authored expression survives...
    expect([half.numerator, half.denominator]).toEqual([1, 2]);
    expect([twoQuarters.numerator, twoQuarters.denominator]).toEqual([2, 4]);
    expect([threeSixths.numerator, threeSixths.denominator]).toEqual([3, 6]);

    // ...while the canonical value is the shared truth.
    expect(half.canonical).toEqual({ numerator: 1, denominator: 2 });
    expect(twoQuarters.canonical).toEqual({ numerator: 1, denominator: 2 });
    expect(threeSixths.canonical).toEqual({ numerator: 1, denominator: 2 });

    expect(fractionFormsShareValue(half, twoQuarters)).toBe(true);
    expect(fractionFormsShareValue(twoQuarters, threeSixths)).toBe(true);
    expect(isSameAuthoredForm(half, twoQuarters)).toBe(false);
  });

  it("preserves an unreduced authored zero while the canonical value normalizes", () => {
    const form = createFractionForm(0, 5);
    expect([form.numerator, form.denominator]).toEqual([0, 5]);
    expect(form.canonical).toEqual({ numerator: 0, denominator: 1 });
  });

  it("preserves a negative authored numerator and normalizes the canonical sign", () => {
    const form = createFractionForm(-2, 4);
    expect([form.numerator, form.denominator]).toEqual([-2, 4]);
    expect(form.canonical).toEqual({ numerator: -1, denominator: 2 });
  });

  it("compares the full authored expression, not just the numerator", () => {
    expect(isSameAuthoredForm(createFractionForm(1, 2), createFractionForm(1, 3))).toBe(false);
    expect(isSameAuthoredForm(createFractionForm(1, 2), createFractionForm(2, 2))).toBe(false);
    expect(isSameAuthoredForm(createFractionForm(2, 4), createFractionForm(2, 4))).toBe(true);
  });

  it("distinguishes reduced from unreduced authored forms", () => {
    expect(isReducedFractionForm(createFractionForm(1, 2))).toBe(true);
    expect(isReducedFractionForm(createFractionForm(2, 4))).toBe(false);
    expect(isReducedFractionForm(createFractionForm(0, 5))).toBe(false);
  });

  it("returns frozen forms", () => {
    expect(Object.isFrozen(createFractionForm(2, 4))).toBe(true);
    expect(Object.isFrozen(createFractionForm(2, 4).canonical)).toBe(true);
  });

  it("reports non-equivalence through canonical values only", () => {
    expect(fractionFormsShareValue(createFractionForm(1, 2), createFractionForm(2, 3))).toBe(false);
    expect(fractionFormsShareValue(createFractionForm(1, 2), createFractionForm(2, 4))).toBe(true);
  });
});

describe("authored form validation", () => {
  it("rejects denominators that are not strictly positive safe integers", () => {
    expect(() => createFractionForm(1, 0)).toThrow(FractionFormError);
    expect(() => createFractionForm(1, 0)).toThrow(/greater than zero/);
    expect(() => createFractionForm(1, -4)).toThrow(/greater than zero/);
    expect(() => createFractionForm(1, 4.5)).toThrow(/safe integer/);
    expect(() => createFractionForm(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(/safe integer/);
    expect(() => createFractionForm(1, Number.NaN)).toThrow(/safe integer/);
    expect(() => createFractionForm(null as unknown as number, 2)).toThrow(/safe integer/);
  });

  it("tryCreateFractionForm returns null instead of throwing", () => {
    expect(tryCreateFractionForm(3, 6)).toEqual(createFractionForm(3, 6));
    expect(tryCreateFractionForm(1, 0)).toBeNull();
  });

  it("validates plain input objects", () => {
    expect(createFractionFormFromInput({ numerator: 3, denominator: 6 }).canonical).toEqual({
      numerator: 1,
      denominator: 2,
    });
    expect(() => createFractionFormFromInput({ numerator: 1, denominator: 0 })).toThrow(FractionFormError);
    expect(() => createFractionFormFromInput(null as unknown as { numerator: number; denominator: number })).toThrow(
      /must be an object/,
    );
    expect(() =>
      createFractionFormFromInput(42 as unknown as { numerator: number; denominator: number }),
    ).toThrow(/must be an object/);
  });

  it("names its error type", () => {
    const error = new FractionFormError("bad");
    expect(error.name).toBe("FractionFormError");
    expect(error).toBeInstanceOf(Error);
  });
});
