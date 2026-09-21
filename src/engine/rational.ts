/**
 * Canonical exact rational arithmetic for Fraction Match (GAME-97 / GAME-185).
 *
 * AUTHORITY
 * A normalized integer pair is the only source of mathematical truth in this repository.
 * Presentation text, SVG geometry, CSS, pixels, animation and card/pair identifiers never
 * contribute to equivalence decisions.
 *
 * DELIBERATE NON-CHOICES
 * - No floating-point comparison: no `number` value is ever compared as a real quantity.
 * - No cross multiplication as the canonical equality mechanism. `a/b === c/d` via
 *   `a * d === b * c` can overflow the safe-integer range for values this game may legitimately
 *   generate, so equality compares the already-normalized integer pairs directly instead.
 * - No string keys: equivalence grouping is done against canonical pairs, never against a
 *   rendered label, so a presentation string can never become the equality mechanism.
 *
 * CONSTRUCTION INVARIANTS (always true of a returned `Rational`)
 * - `numerator` and `denominator` are `Number.isSafeInteger`;
 * - `denominator` is strictly greater than zero;
 * - the pair is reduced by the greatest common divisor;
 * - zero is normalized to `0/1` (including `-0`);
 * - the sign lives on the numerator.
 */

export type Rational = {
  readonly numerator: number;
  readonly denominator: number;
};

/** Thrown when a value cannot form a canonical rational. */
export class RationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RationalError";
  }
}

/** The single canonical zero value. */
export const RATIONAL_ZERO: Rational = Object.freeze({ numerator: 0, denominator: 1 });

function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  return typeof value;
}

function assertSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RationalError(`${label} must be a safe integer; received ${describe(value)}`);
  }
}

/**
 * Euclidean greatest common divisor over the absolute values of two safe integers.
 * Returns a non-negative safe integer; `gcd(0, 0)` is `0` and never called by this module.
 */
export function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

/**
 * Reduce, sign-normalize and freeze an already-validated pair.
 * `denominator` must be non-zero, but may be negative: the sign is moved onto the numerator.
 */
function canonicalize(numerator: number, denominator: number): Rational {
  if (numerator === 0) return RATIONAL_ZERO;

  // Dividing safe integers by their own greatest common divisor is exact and cannot leave the
  // safe-integer range: the quotient magnitude never exceeds the dividend magnitude. This is
  // deliberately asserted by tests at the safe-integer boundary rather than guarded by an
  // unreachable runtime check.
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;

  const signedNumerator = reducedDenominator < 0 ? -reducedNumerator : reducedNumerator;
  const positiveDenominator = reducedDenominator < 0 ? -reducedDenominator : reducedDenominator;

  return Object.freeze({ numerator: signedNumerator, denominator: positiveDenominator });
}

/**
 * Canonical constructor.
 *
 * This is the strict mathematical construction: the denominator must already be strictly
 * positive, and the sign must already be carried by the numerator. Use
 * {@link rationalSigned} when a caller holds loosely-signed parts that still need normalizing.
 *
 * @throws {RationalError} when either part is not a safe integer, or `denominator <= 0`.
 */
export function rational(numerator: number, denominator: number): Rational {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) {
    throw new RationalError(`denominator must be greater than zero; received ${denominator}`);
  }
  return canonicalize(numerator, denominator);
}

/**
 * Sign-normalizing constructor for loosely-signed input.
 *
 * Accepts a negative denominator and moves the sign onto the numerator, so the returned value
 * still satisfies the canonical invariant that the denominator is positive.
 *
 * @throws {RationalError} when either part is not a safe integer, or `denominator === 0`.
 */
export function rationalSigned(numerator: number, denominator: number): Rational {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator === 0) {
    throw new RationalError("denominator must be non-zero; received 0");
  }
  return canonicalize(numerator, denominator);
}

/** Non-throwing variant of {@link rational}. Returns `null` instead of throwing. */
export function tryRational(numerator: number, denominator: number): Rational | null {
  try {
    return rational(numerator, denominator);
  } catch {
    return null;
  }
}

/** Structural check for a canonical rational. Always re-verifies normalization. */
export function isRational(value: unknown): value is Rational {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { numerator?: unknown; denominator?: unknown };
  try {
    const canonical = rational(candidate.numerator as number, candidate.denominator as number);
    return canonical.numerator === candidate.numerator && canonical.denominator === candidate.denominator;
  } catch {
    return false;
  }
}

/**
 * Exact equivalence of two canonical rationals.
 *
 * Compares the normalized integer pairs field by field, which is the canonical mechanism
 * required by the math contract.
 */
export function rationalEquals(left: Rational, right: Rational): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/**
 * Exact ordering of two canonical rationals: `-1` less, `0` equal, `1` greater.
 *
 * Deliberately **not** a cross-multiplication. `a.n * b.d` and `b.n * a.d` can leave the safe-integer range for
 * values the engine is allowed to construct, which is the same reason equivalence is decided by normalized pair
 * equality rather than by multiplication. This compares integer parts and recurses on the remainders — the
 * Euclidean algorithm — where the only multiplication is by a quotient, so it can never overflow.
 *
 * This exists for *explanation*: copy that says which of two amounts is larger has to be mathematically exact,
 * and presentation code is not allowed to compute mathematics. It is not consulted by the state machine, where
 * equivalence remains `rationalEquals` alone.
 */
export function compareRationals(left: Rational, right: Rational): -1 | 0 | 1 {
  const leftSign = signOf(left);
  const rightSign = signOf(right);
  if (leftSign !== rightSign) return leftSign < rightSign ? -1 : 1;
  if (leftSign === 0) return 0;

  const ordering = comparePositiveMagnitudes(
    Math.abs(left.numerator),
    left.denominator,
    Math.abs(right.numerator),
    right.denominator,
  );
  return leftSign < 0 ? ((ordering === 0 ? 0 : ordering === 1 ? -1 : 1) as -1 | 0 | 1) : ordering;
}

function signOf(value: Rational): -1 | 0 | 1 {
  if (value.numerator === 0) return 0;
  return value.numerator < 0 ? -1 : 1;
}

/**
 * Compare two non-negative rationals given as separate numerator and denominator.
 *
 * Both denominators are strictly positive. The recursion descends through the Euclidean algorithm, so it
 * terminates and every intermediate value stays inside the safe range.
 */
function comparePositiveMagnitudes(n1: number, d1: number, n2: number, d2: number): -1 | 0 | 1 {
  // Integer part and remainder by *exact* integer operations. `n % d` is exact for safe integers, so the
  // quotient can be taken as `(n - n % d) / d` — an exact integer — instead of rounding a floating-point
  // division, which would be the one place this function could quietly stop being exact.
  const whole1 = (n1 - (n1 % d1)) / d1;
  const whole2 = (n2 - (n2 % d2)) / d2;
  if (whole1 !== whole2) return whole1 < whole2 ? -1 : 1;

  const remainder1 = n1 % d1;
  const remainder2 = n2 % d2;
  if (remainder1 === 0 && remainder2 === 0) return 0;
  if (remainder1 === 0) return -1;
  if (remainder2 === 0) return 1;

  // Both are `whole + remainder / denominator` with a non-zero remainder, so each is strictly between two
  // integers: inverting both flips the ordering.
  const inverted = comparePositiveMagnitudes(d1, remainder1, d2, remainder2);
  return inverted === 0 ? 0 : inverted === 1 ? -1 : 1;
}

/**
 * The distinct canonical values inside a list, using exact pair equality.
 * Used by the deck generator to prove that every generated value appears the expected number
 * of times without resorting to string keys.
 */
export function distinctRationals(values: readonly Rational[]): Rational[] {
  const distinct: Rational[] = [];
  for (const value of values) {
    if (!distinct.some((existing) => rationalEquals(existing, value))) distinct.push(value);
  }
  return distinct;
}

/** Count how many of `values` are exactly equal to `target`. */
export function countRationalOccurrences(values: readonly Rational[], target: Rational): number {
  let total = 0;
  for (const value of values) {
    if (rationalEquals(value, target)) total += 1;
  }
  return total;
}
