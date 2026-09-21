/**
 * Authored fraction forms.
 *
 * A `FractionForm` keeps the numerator/denominator an author wrote down (for example `2/4`)
 * next to the canonical `Rational` it denotes (`1/2`). The game needs both: the canonical value
 * is the only mathematical truth, while the authored form is the mathematically valid expression
 * a future representation layer (GAME-186) may render and compare visually.
 *
 * Losing the authored form would make `1/2` and `2/4` indistinguishable as cards, so the two are
 * stored separately and one is always derived from the other.
 */

import { rational, type Rational } from "./rational";

/** What an author supplies. */
export type FractionFormInput = {
  readonly numerator: number;
  readonly denominator: number;
};

/** A validated authored expression plus the canonical value it denotes. */
export type FractionForm = {
  /** Authored numerator. May be negative; the sign is meaningful and preserved. */
  readonly numerator: number;
  /** Authored denominator. Always strictly positive. */
  readonly denominator: number;
  /** Derived canonical value. This is the only source of mathematical truth. */
  readonly canonical: Rational;
};

/** Thrown when an authored fraction is not a valid mathematical expression. */
export class FractionFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FractionFormError";
  }
}

function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  return typeof value;
}

function assertSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new FractionFormError(`${label} must be a safe integer; received ${describe(value)}`);
  }
}

/**
 * Validate an authored fraction and derive its canonical value.
 *
 * @throws {FractionFormError} when either part is not a safe integer, or the denominator is not
 * strictly positive. `0/5` is a valid authored form that denotes the canonical value `0/1`.
 */
export function createFractionForm(numerator: number, denominator: number): FractionForm {
  assertSafeInteger(numerator, "fraction numerator");
  assertSafeInteger(denominator, "fraction denominator");
  if (denominator <= 0) {
    throw new FractionFormError(`fraction denominator must be greater than zero; received ${denominator}`);
  }

  // Safe because the same invariants were just checked: a strictly positive safe-integer
  // denominator and a safe-integer numerator. `rational` reduces and sign-normalizes.
  const canonical: Rational = rational(numerator, denominator);

  return Object.freeze({ numerator, denominator, canonical });
}

/** Non-throwing variant of {@link createFractionForm}. Returns `null` instead of throwing. */
export function tryCreateFractionForm(numerator: number, denominator: number): FractionForm | null {
  try {
    return createFractionForm(numerator, denominator);
  } catch {
    return null;
  }
}

/** Convenience wrapper for a plain `{ numerator, denominator }` input. */
export function createFractionFormFromInput(input: FractionFormInput): FractionForm {
  if (typeof input !== "object" || input === null) {
    throw new FractionFormError(`fraction form input must be an object; received ${describe(input)}`);
  }
  return createFractionForm(input.numerator, input.denominator);
}

/**
 * Two authored forms denote the same quantity.
 *
 * Correctness always runs through the canonical values, never through the authored digits, the
 * rendered text, or any identifier.
 */
export function fractionFormsShareValue(left: FractionForm, right: FractionForm): boolean {
  return (
    left.canonical.numerator === right.canonical.numerator &&
    left.canonical.denominator === right.canonical.denominator
  );
}

/** Whether an authored form is already written in lowest terms. */
export function isReducedFractionForm(form: FractionForm): boolean {
  return form.numerator === form.canonical.numerator && form.denominator === form.canonical.denominator;
}

/** Whether two authored forms are literally the same written expression. */
export function isSameAuthoredForm(left: FractionForm, right: FractionForm): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}
