/**
 * Declared mathematical wholes (GAME-186).
 *
 * GAME-97's representation-correctness rules require that a visual comparison is only meaningful
 * when both sides declare the *same* whole:
 *
 * - visual↔visual comparisons share one declared mathematical whole;
 * - set↔set comparisons share the same whole identity **and** total-object count, so a set model
 *   can never claim equivalence by quietly changing how many objects the whole contains;
 * - number-line comparisons share one axis/domain/scale;
 * - symbolic↔visual comparisons state the visual whole explicitly.
 *
 * These rules are enforced here as data plus a planner, not as prose: `planRepresentationComparison`
 * returns every problem it finds and `assertComparisonAllowed` throws
 * {@link RepresentationContractError} when there is one. A violated whole contract is a programming
 * error, so it fails loudly in dev, test and production alike rather than rendering a misleading
 * picture.
 */

import {
  RepresentationContractError,
  assertFractionValue,
  type CanonicalValue,
  type FractionValue,
  type RepresentationFamily,
} from "./contract";

/** A continuous whole: one whole rectangle, circle or strip. Used by bar, circle and symbolic. */
export type ContinuousWhole = {
  readonly kind: "continuous-whole";
  /** Stable identity. Two cards share a whole only when they declare the same id. */
  readonly wholeId: string;
  /** Natural-language statement of the whole, used verbatim in accessible names. */
  readonly description: string;
};

/**
 * A discrete whole: one collection of countable objects.
 *
 * `totalObjectCount` is part of the whole's identity, not a rendering detail. It must be an exact
 * multiple of the denominator being shown, otherwise the picture would have to lie about either the
 * quantity or the collection size.
 */
export type DiscreteSetWhole = {
  readonly kind: "discrete-set";
  readonly wholeId: string;
  readonly description: string;
  readonly totalObjectCount: number;
};

/** A shared number-line axis: one domain and one scale for every value drawn on it. */
export type NumberLineAxis = {
  /** Stable axis identity. Two number lines share an axis only when they declare the same id. */
  readonly axisId: string;
  /** Domain start. A safe integer; unit intervals are `[start, end]`. */
  readonly domainStart: number;
  /** Domain end. A safe integer strictly greater than `domainStart`. */
  readonly domainEnd: number;
  /** Equal parts per whole unit. This is the shared scale; it must be a multiple of a denominator. */
  readonly ticksPerUnit: number;
};

/** A whole expressed as a shared number-line axis. */
export type NumberLineWhole = {
  readonly kind: "number-line-axis";
  readonly wholeId: string;
  readonly description: string;
  readonly axis: NumberLineAxis;
};

export type RepresentationWhole = ContinuousWhole | DiscreteSetWhole | NumberLineWhole;

/** Default shared-whole identity for continuous wholes. */
export const DEFAULT_CONTINUOUS_WHOLE_ID = "continuous-whole-1";

/** Default shared-whole identity for number lines whose axis id is the identity. */
export function numberLineWholeId(axis: NumberLineAxis): string {
  return `number-line-whole-${axis.axisId}`;
}

function requireNonEmptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RepresentationContractError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RepresentationContractError(`${label} must be a safe integer; received ${String(value)}`);
  }
  return value;
}

/** Construct a continuous whole (one whole rectangle, circle or strip). */
export function continuousWhole(input: { wholeId?: string; description?: string } = {}): ContinuousWhole {
  return Object.freeze({
    kind: "continuous-whole" as const,
    wholeId: input.wholeId === undefined ? DEFAULT_CONTINUOUS_WHOLE_ID : requireNonEmptyText(input.wholeId, "wholeId"),
    description: input.description === undefined ? "one whole shape" : requireNonEmptyText(input.description, "description"),
  });
}

/** Construct a discrete whole (one collection of countable objects). */
export function discreteSetWhole(input: {
  totalObjectCount: number;
  wholeId?: string;
  description?: string;
}): DiscreteSetWhole {
  const totalObjectCount = requireSafeInteger(input.totalObjectCount, "totalObjectCount");
  if (totalObjectCount <= 0) {
    throw new RepresentationContractError(`totalObjectCount must be greater than zero; received ${totalObjectCount}`);
  }
  return Object.freeze({
    kind: "discrete-set" as const,
    wholeId: input.wholeId === undefined ? `discrete-set-whole-${totalObjectCount}` : requireNonEmptyText(input.wholeId, "wholeId"),
    description:
      input.description === undefined
        ? `one collection of ${totalObjectCount} objects`
        : requireNonEmptyText(input.description, "description"),
    totalObjectCount,
  });
}

/** Construct a shared number-line axis. */
export function numberLineAxis(input: {
  ticksPerUnit: number;
  axisId?: string;
  domainStart?: number;
  domainEnd?: number;
}): NumberLineAxis {
  const ticksPerUnit = requireSafeInteger(input.ticksPerUnit, "ticksPerUnit");
  const domainStart = input.domainStart === undefined ? 0 : requireSafeInteger(input.domainStart, "domainStart");
  const domainEnd = input.domainEnd === undefined ? 1 : requireSafeInteger(input.domainEnd, "domainEnd");

  const problems: string[] = [];
  if (ticksPerUnit < 1) problems.push(`ticksPerUnit must be at least 1; received ${ticksPerUnit}`);
  if (domainEnd <= domainStart) {
    problems.push(`domainEnd must be greater than domainStart; received ${domainStart}..${domainEnd}`);
  }
  if (problems.length > 0) throw new RepresentationContractError(problems);

  return Object.freeze({
    axisId: input.axisId === undefined ? `axis-${domainStart}-${domainEnd}-${ticksPerUnit}` : requireNonEmptyText(input.axisId, "axisId"),
    domainStart,
    domainEnd,
    ticksPerUnit,
  });
}

/** Construct a number-line whole from a shared axis. */
export function numberLineWhole(input: { axis: NumberLineAxis; wholeId?: string; description?: string }): NumberLineWhole {
  const { axis } = input;
  return Object.freeze({
    kind: "number-line-axis" as const,
    wholeId: input.wholeId === undefined ? numberLineWholeId(axis) : requireNonEmptyText(input.wholeId, "wholeId"),
    description: input.description === undefined ? axisText(axis) : requireNonEmptyText(input.description, "description"),
    axis,
  });
}

/** Natural-language statement of a shared axis (domain and scale). */
export function axisText(axis: NumberLineAxis): string {
  const parts = `${axis.ticksPerUnit} equal part${axis.ticksPerUnit === 1 ? "" : "s"} per whole`;
  return `one number-line axis from ${axis.domainStart} to ${axis.domainEnd} marked in ${parts}`;
}

/** Natural-language statement of a declared whole, including the facts that must match. */
export function wholeText(whole: RepresentationWhole): string {
  switch (whole.kind) {
    case "continuous-whole":
      return whole.description;
    case "discrete-set":
      return `${whole.description} (${whole.totalObjectCount} objects in total)`;
    case "number-line-axis":
      return `${whole.description}; ${axisText(whole.axis)}`;
  }
}

function requireWholeKind<Kind extends RepresentationWhole["kind"]>(
  whole: RepresentationWhole,
  kind: Kind,
  context: string,
): Extract<RepresentationWhole, { kind: Kind }> {
  if (whole.kind !== kind) {
    throw new RepresentationContractError(
      `${context} requires a ${kind} whole; received ${whole.kind}. Choose a family that shares this whole kind.`,
    );
  }
  return whole as Extract<RepresentationWhole, { kind: Kind }>;
}

/**
 * How many objects are selected in a discrete-set model of `fraction`.
 *
 * Fails loudly when the declared collection cannot represent the fraction exactly, which is the
 * mechanism that stops a set model from silently changing the total collection size between two
 * compared cards.
 */
export function setSelection(
  fraction: FractionValue,
  whole: DiscreteSetWhole,
): { readonly selectedCount: number; readonly totalObjectCount: number } {
  assertFractionValue(fraction, "setSelection");

  const problems: string[] = [];
  if (whole.totalObjectCount % fraction.denominator !== 0) {
    problems.push(
      `a set model must divide its collection exactly: ${whole.totalObjectCount} objects is not a multiple of denominator ${fraction.denominator}`,
    );
  }
  if (fraction.numerator > fraction.denominator) {
    problems.push(
      `a set model shows parts of one collection: numerator ${fraction.numerator} exceeds denominator ${fraction.denominator}. Use a bar, circle or number line for values at or above one whole`,
    );
  }
  if (problems.length > 0) throw new RepresentationContractError(problems);

  const perGroup = whole.totalObjectCount / fraction.denominator;
  return Object.freeze({
    selectedCount: fraction.numerator * perGroup,
    totalObjectCount: whole.totalObjectCount,
  });
}

/**
 * Where a fraction sits on a shared axis.
 *
 * The axis scale must be an exact multiple of the denominator so the point lands on a tick, and the
 * value must sit inside the declared domain. Both failures are reported together instead of being
 * rounded away.
 */
export function axisPosition(
  fraction: FractionValue,
  axis: NumberLineAxis,
): {
  readonly tickIndex: number;
  readonly totalTicks: number;
  readonly ticksPerUnit: number;
  readonly positionInUnits: CanonicalValue;
} {
  assertFractionValue(fraction, "axisPosition");

  const problems: string[] = [];
  if (axis.ticksPerUnit % fraction.denominator !== 0) {
    problems.push(
      `a number line must share one scale: axis scale ${axis.ticksPerUnit} parts per unit is not a multiple of denominator ${fraction.denominator}`,
    );
  }

  const offset = fraction.numerator - axis.domainStart * fraction.denominator;
  const span = axis.domainEnd * fraction.denominator - axis.domainStart * fraction.denominator;
  if (offset < 0 || offset > span) {
    problems.push(
      `value ${fraction.numerator}/${fraction.denominator} is outside the declared domain ${axis.domainStart}..${axis.domainEnd}`,
    );
  }
  if (problems.length > 0) throw new RepresentationContractError(problems);

  const totalTicks = (axis.domainEnd - axis.domainStart) * axis.ticksPerUnit;
  const tickIndex = (offset * axis.ticksPerUnit) / fraction.denominator;

  return Object.freeze({
    tickIndex,
    totalTicks,
    ticksPerUnit: axis.ticksPerUnit,
    positionInUnits: Object.freeze({ numerator: fraction.numerator, denominator: fraction.denominator }),
  });
}

/** One side of a declared comparison. */
export type ComparisonSide = {
  readonly family: RepresentationFamily;
  readonly fraction: FractionValue;
  readonly whole: RepresentationWhole;
};

/** Which whole facts two families must share for their comparison to be meaningful. */
export type ComparisonRuleKind = "shared-whole" | "shared-set-total" | "shared-axis";

/**
 * The compatibility matrix from GAME-97's supported comparison list.
 *
 * `symbolic` may pair with anything because a symbol carries no geometry of its own; the visual side
 * states the whole explicitly. Area models (bar, circle) pair with each other on one continuous
 * whole. Sets pair only with sets, number lines only with number lines. Anything else returns `null`
 * and therefore fails loudly, rather than drawing two incompatible quantities side by side.
 */
export function comparisonRuleFor(left: RepresentationFamily, right: RepresentationFamily): ComparisonRuleKind | null {
  const isAreaModel = (family: RepresentationFamily): boolean => family === "bar" || family === "circle";

  if (left === "symbolic" || right === "symbolic") return "shared-whole";
  if (left === "set" && right === "set") return "shared-set-total";
  if (left === "number-line" && right === "number-line") return "shared-axis";
  if (isAreaModel(left) && isAreaModel(right)) return "shared-whole";
  return null;
}

/** The result of planning a comparison: the shared facts, plus every problem found. */
export type ComparisonPlan = {
  readonly rule: ComparisonRuleKind | null;
  readonly sharedWholeId: string | null;
  readonly sharedAxis: NumberLineAxis | null;
  readonly problems: readonly string[];
};

/**
 * Plan a declared two-value comparison and report every same-whole violation it finds.
 *
 * Callers either assert the plan (`assertComparisonAllowed`) or render it, so the rule set has one
 * implementation and one test surface.
 */
export function planRepresentationComparison(left: ComparisonSide, right: ComparisonSide): ComparisonPlan {
  assertFractionValue(left.fraction, "comparison left");
  assertFractionValue(right.fraction, "comparison right");

  const problems: string[] = [];
  const rule = comparisonRuleFor(left.family, right.family);

  if (rule === null) {
    problems.push(
      `${left.family} and ${right.family} cannot be compared: this pair is outside the supported comparison matrix, so it has no shared whole definition`,
    );
    return Object.freeze({ rule, sharedWholeId: null, sharedAxis: null, problems });
  }

  if (left.whole.wholeId !== right.whole.wholeId) {
    problems.push(
      `both sides must declare the same whole identity; received "${left.whole.wholeId}" and "${right.whole.wholeId}"`,
    );
  }

  if (rule === "shared-set-total") {
    if (left.whole.kind !== "discrete-set" || right.whole.kind !== "discrete-set") {
      problems.push("a set comparison requires both sides to declare a discrete-set whole");
    } else if (left.whole.totalObjectCount !== right.whole.totalObjectCount) {
      problems.push(
        `a set comparison must keep the total object count fixed; received ${left.whole.totalObjectCount} and ${right.whole.totalObjectCount} objects`,
      );
    }
  }

  if (rule === "shared-axis") {
    if (left.whole.kind !== "number-line-axis" || right.whole.kind !== "number-line-axis") {
      problems.push("a number-line comparison requires both sides to declare a number-line-axis whole");
    } else {
      const leftAxis = left.whole.axis;
      const rightAxis = right.whole.axis;
      if (leftAxis.axisId !== rightAxis.axisId) {
        problems.push(`both number lines must share one axis; received axis ids "${leftAxis.axisId}" and "${rightAxis.axisId}"`);
      }
      if (
        leftAxis.domainStart !== rightAxis.domainStart ||
        leftAxis.domainEnd !== rightAxis.domainEnd ||
        leftAxis.ticksPerUnit !== rightAxis.ticksPerUnit
      ) {
        problems.push(
          `both number lines must share one domain and scale; received ${leftAxis.domainStart}..${leftAxis.domainEnd} in ${leftAxis.ticksPerUnit} parts and ${rightAxis.domainStart}..${rightAxis.domainEnd} in ${rightAxis.ticksPerUnit} parts`,
        );
      }
    }
  }

  return Object.freeze({
    rule,
    sharedWholeId: problems.length === 0 ? left.whole.wholeId : null,
    sharedAxis: rule === "shared-axis" && left.whole.kind === "number-line-axis" ? left.whole.axis : null,
    problems,
  });
}

/** Assert that a planned comparison is allowed. Throws {@link RepresentationContractError} if not. */
export function assertComparisonAllowed(plan: ComparisonPlan): void {
  if (plan.problems.length > 0) throw new RepresentationContractError(plan.problems);
}

/** Convenience: plan and assert in one step, returning the valid plan. */
export function requireComparisonPlan(left: ComparisonSide, right: ComparisonSide): ComparisonPlan {
  const plan = planRepresentationComparison(left, right);
  assertComparisonAllowed(plan);
  return plan;
}

/** Narrow helper used by geometry modules that need an axis from a whole they already validated. */
export function axisOfWhole(whole: RepresentationWhole, context: string): NumberLineAxis {
  return requireWholeKind(whole, "number-line-axis", context).axis;
}

/** Narrow helper for callers holding a union that must be a discrete-set whole. */
export function discreteSetWholeOf(whole: RepresentationWhole, context: string): DiscreteSetWhole {
  return requireWholeKind(whole, "discrete-set", context);
}

/** Narrow helper for callers holding a union that must be a number-line whole. */
export function numberLineWholeOf(whole: RepresentationWhole, context: string): NumberLineWhole {
  return requireWholeKind(whole, "number-line-axis", context);
}
