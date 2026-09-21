/**
 * Representation input contract (GAME-186).
 *
 * AUTHORITY
 * GAME-185's engine owns the mathematics. This module deliberately does **not** import the engine
 * at all: it describes the *structure* a representation needs, and TypeScript's structural typing
 * lets an engine `FractionForm` be passed straight in. That keeps the dependency one-way
 * (engine -> representations), makes an accidental second maths implementation impossible here,
 * and means the whole layer can later be extracted into a shared package without moving authority.
 *
 * WHAT THIS LAYER MAY AND MAY NOT DO
 * - It may read `numerator`, `denominator` and the derived `canonical` pair as data.
 * - It may validate that the data is structurally sane (safe integers, positive denominators).
 * - It may never re-derive, re-reduce, compare or "correct" the canonical value. Equivalence is
 *   decided by the engine; geometry here is a one-way projection and never feeds correctness back.
 *
 * `pairId`, card ids, rendered text, pixels and animation are not part of this contract at all.
 */

/** The canonical normalized pair, as supplied by the engine. Read-only data. */
export type CanonicalValue = {
  readonly numerator: number;
  readonly denominator: number;
};

/**
 * The structural input every primitive accepts.
 *
 * An engine `FractionForm` satisfies this type, so presentation can pass one through without a
 * conversion layer while the representation modules stay free of engine imports.
 */
export type FractionValue = {
  /** Authored numerator. Preserved exactly: `2/4` must stay `2/4`. */
  readonly numerator: number;
  /** Authored denominator. Always strictly positive. */
  readonly denominator: number;
  /** Canonical value derived by the engine. Never recomputed here. */
  readonly canonical: CanonicalValue;
};

/** A rendered box in CSS pixels. Geometry is authored in these units. */
export type RepresentationBox = {
  readonly width: number;
  readonly height: number;
};

/** The five supported representation families from GAME-97's representation-correctness rules. */
export type RepresentationFamily = "symbolic" | "bar" | "circle" | "set" | "number-line";

/** Canonical family order. Fixtures and sweeps iterate this list, never a hand-written copy. */
export const REPRESENTATION_FAMILIES: readonly RepresentationFamily[] = [
  "symbolic",
  "bar",
  "circle",
  "set",
  "number-line",
];

/** Human-readable family label. One canonical source, so tests and copy cannot drift apart. */
export const REPRESENTATION_FAMILY_LABELS: Readonly<Record<RepresentationFamily, string>> = {
  symbolic: "Fraction symbol",
  bar: "Bar model",
  circle: "Circle model",
  set: "Set model",
  "number-line": "Number line",
};

/** Thrown when a representation contract is violated. Fails loudly instead of degrading quietly. */
export class RepresentationContractError extends Error {
  readonly problems: readonly string[];

  constructor(problem: string | readonly string[]) {
    const problems = typeof problem === "string" ? [problem] : [...problem];
    super(`representation contract violated:\n- ${problems.join("\n- ")}`);
    this.name = "RepresentationContractError";
    this.problems = problems;
  }
}

function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function safeIntegerProblem(value: unknown, label: string): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return `${label} must be a safe integer; received ${describe(value)}`;
  }
  return null;
}

/**
 * Structural validation of a fraction value.
 *
 * This never checks that `canonical` is the reduction of the authored pair: only the engine owns
 * that decision, and re-deriving it here would create exactly the second maths implementation this
 * contract exists to prevent.
 */
export function assertFractionValue(value: FractionValue, context: string): void {
  const problems: string[] = [];

  if (typeof value !== "object" || value === null) {
    throw new RepresentationContractError(`${context} requires a fraction value; received ${describe(value)}`);
  }

  const numeratorProblem = safeIntegerProblem(value.numerator, `${context} numerator`);
  if (numeratorProblem !== null) problems.push(numeratorProblem);

  const denominatorProblem = safeIntegerProblem(value.denominator, `${context} denominator`);
  if (denominatorProblem !== null) problems.push(denominatorProblem);

  if (typeof value.denominator === "number" && Number.isSafeInteger(value.denominator) && value.denominator <= 0) {
    problems.push(`${context} denominator must be greater than zero; received ${value.denominator}`);
  }

  const canonical = value.canonical;
  if (typeof canonical !== "object" || canonical === null) {
    problems.push(`${context} canonical value must be supplied by the engine; received ${describe(canonical)}`);
  } else {
    const canonicalNumeratorProblem = safeIntegerProblem(canonical.numerator, `${context} canonical numerator`);
    if (canonicalNumeratorProblem !== null) problems.push(canonicalNumeratorProblem);

    const canonicalDenominatorProblem = safeIntegerProblem(canonical.denominator, `${context} canonical denominator`);
    if (canonicalDenominatorProblem !== null) problems.push(canonicalDenominatorProblem);

    if (
      typeof canonical.denominator === "number" &&
      Number.isSafeInteger(canonical.denominator) &&
      canonical.denominator <= 0
    ) {
      problems.push(`${context} canonical denominator must be greater than zero; received ${canonical.denominator}`);
    }
  }

  if (problems.length > 0) throw new RepresentationContractError(problems);
}

/** Structural validation of a rendered box. */
export function assertRepresentationBox(box: RepresentationBox, context: string): void {
  const problems: string[] = [];

  if (typeof box !== "object" || box === null) {
    throw new RepresentationContractError(`${context} requires a box; received ${describe(box)}`);
  }

  for (const axis of ["width", "height"] as const) {
    const value = box[axis];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      problems.push(`${context} box ${axis} must be a positive finite number; received ${describe(value)}`);
    }
  }

  if (problems.length > 0) throw new RepresentationContractError(problems);
}

/** Structural comparison of two canonical pairs, used for faithful-geometry assertions. */
export function canonicalValuesEqual(left: CanonicalValue, right: CanonicalValue): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}
