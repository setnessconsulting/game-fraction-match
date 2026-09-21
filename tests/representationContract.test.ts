import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  REPRESENTATION_FAMILIES,
  REPRESENTATION_FAMILY_LABELS,
  RepresentationContractError,
  assertFractionValue,
  assertRepresentationBox,
  canonicalValuesEqual,
} from "../src/representations";

/**
 * The contract is what lets an engine `FractionForm` be handed straight to a component without a
 * conversion layer, so these tests pin both halves of that promise: structural validation is enforced,
 * and the canonical value is never re-derived here.
 */

describe("representation input contract", () => {
  it("accepts an engine fraction form without any conversion", () => {
    const form = createFractionForm(2, 4);
    expect(() => assertFractionValue(form, "test")).not.toThrow();
    expect(form.canonical).toEqual({ numerator: 1, denominator: 2 });
  });

  it("validates the canonical pair as structure only, never as arithmetic", () => {
    // `2/4` declares an unreduced canonical pair. This layer must not notice, and must not fix it:
    // re-deriving the canonical value here would be exactly the second maths implementation the
    // contract exists to prevent, so structurally sane data is accepted verbatim.
    const unreduced = { numerator: 2, denominator: 4, canonical: { numerator: 2, denominator: 4 } };
    expect(() => assertFractionValue(unreduced, "test")).not.toThrow();
  });

  it("rejects a value that is not a fraction at all", () => {
    expect(() => assertFractionValue(null as never, "test")).toThrow(RepresentationContractError);
    expect(() => assertFractionValue(null as never, "test")).toThrow(/requires a fraction value; received null/);
    expect(() => assertFractionValue("2/4" as never, "test")).toThrow(/received string/);
  });

  it("rejects non-integer and unsafe parts with the offending field named", () => {
    expect(() =>
      assertFractionValue({ numerator: 1.5, denominator: 2, canonical: { numerator: 3, denominator: 4 } }, "test"),
    ).toThrow(/test numerator must be a safe integer; received 1\.5/);

    expect(() =>
      assertFractionValue(
        { numerator: 1, denominator: 2, canonical: { numerator: 3, denominator: Number.MAX_SAFE_INTEGER + 2 } },
        "test",
      ),
    ).toThrow(/test canonical denominator must be a safe integer/);
  });

  it("rejects a non-positive denominator on either side of the value", () => {
    expect(() =>
      assertFractionValue({ numerator: 1, denominator: 0, canonical: { numerator: 1, denominator: 2 } }, "test"),
    ).toThrow(/test denominator must be greater than zero; received 0/);

    expect(() =>
      assertFractionValue({ numerator: 1, denominator: 2, canonical: { numerator: 1, denominator: -2 } }, "test"),
    ).toThrow(/test canonical denominator must be greater than zero; received -2/);
  });

  it("requires the canonical value to be supplied by the engine", () => {
    expect(() => assertFractionValue({ numerator: 1, denominator: 2 } as never, "test")).toThrow(
      /test canonical value must be supplied by the engine; received undefined/,
    );
  });

  it("collects every problem into one error instead of failing on the first", () => {
    let caught: unknown;
    try {
      assertFractionValue(
        { numerator: 1.5, denominator: 0, canonical: { numerator: 1, denominator: 0 } },
        "comparison left",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RepresentationContractError);
    const error = caught as RepresentationContractError;
    expect(error.problems).toHaveLength(3);
    expect(error.problems[0]).toMatch(/comparison left numerator/);
    expect(error.problems[1]).toMatch(/comparison left denominator must be greater than zero/);
    expect(error.problems[2]).toMatch(/comparison left canonical denominator must be greater than zero/);
    expect(error.message).toContain("representation contract violated:");
    expect(error.name).toBe("RepresentationContractError");
  });

  it("validates a box on both axes", () => {
    expect(() => assertRepresentationBox({ width: 68, height: 68 }, "test")).not.toThrow();

    for (const box of [
      { width: 0, height: 68 },
      { width: 68, height: -1 },
      { width: Number.NaN, height: 68 },
      { width: 68, height: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => assertRepresentationBox(box, "test")).toThrow(/must be a positive finite number/);
    }

    expect(() => assertRepresentationBox(null as never, "test")).toThrow(/requires a box; received null/);
  });

  it("reports both axes of a doubly invalid box together", () => {
    let caught: unknown;
    try {
      assertRepresentationBox({ width: 0, height: 0 }, "test");
    } catch (error) {
      caught = error;
    }
    expect((caught as RepresentationContractError).problems).toEqual([
      "test box width must be a positive finite number; received 0",
      "test box height must be a positive finite number; received 0",
    ]);
  });

  it("compares canonical pairs structurally", () => {
    expect(canonicalValuesEqual({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 })).toBe(true);
    expect(canonicalValuesEqual({ numerator: 2, denominator: 4 }, { numerator: 1, denominator: 2 })).toBe(false);
    expect(canonicalValuesEqual({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 3 })).toBe(false);
  });

  it("declares the five supported families in one canonical order with a label each", () => {
    expect(REPRESENTATION_FAMILIES).toEqual(["symbolic", "bar", "circle", "set", "number-line"]);

    for (const family of REPRESENTATION_FAMILIES) {
      expect(REPRESENTATION_FAMILY_LABELS[family].length).toBeGreaterThan(0);
    }
    expect(Object.keys(REPRESENTATION_FAMILY_LABELS)).toHaveLength(REPRESENTATION_FAMILIES.length);
  });
});
