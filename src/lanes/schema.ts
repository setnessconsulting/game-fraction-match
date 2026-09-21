/**
 * Lane configuration schema (GAME-187).
 *
 * GAME-185 owns the generator and GAME-186 owns the pictures. This layer owns *content as data*: which
 * denominators a lane may deal, which authored numerators it allows, which representation families it
 * prefers and in what order, the one whole its cards share, the card box, and how close its distractor
 * values are allowed to be.
 *
 * Two boundaries this schema keeps deliberately:
 *
 * - **No maths of its own.** Denominators, numerators and multiples are validated with the engine's own
 *   `rational`/`rationalEquals`, and every pool value is expressed as an engine `EquivalenceFamily`. A
 *   lane can never redefine equivalence.
 * - **No selection of its own.** Which pool values actually reach a board stays the engine's seeded
 *   decision. A lane composes the pool and states its constraints; it does not shuffle.
 *
 * Nothing here is curriculum. Grade bands are an *ordering* and a diagnostic label, not a standards
 * claim: reviewed denominator catalogues and progression belong to the story that adopts them.
 */

import { MAX_PAIR_COUNT, MIN_PAIR_COUNT } from "../engine";
import type { RepresentationBox, RepresentationCandidate } from "../representations";

/** The ordering label a lane carries. Not a standards claim. */
export type GradeBand = "grade-3" | "grade-4" | "grade-5";

/** Canonical grade-band order. Sequences and fixtures iterate this list, never a hand-written copy. */
export const GRADE_BANDS: readonly GradeBand[] = Object.freeze(["grade-3", "grade-4", "grade-5"]);

/** Smallest denominator a lane may declare. A denominator of 1 would make every value a whole. */
export const LANE_MIN_DENOMINATOR = 2;

/** Upper bound on a declared denominator. A sanity bound, not a product decision. */
export const LANE_MAX_DENOMINATOR = 1000;

/** How many authored forms one value may contribute to a lane's pool. */
export const DEFAULT_MAX_FORMS_PER_FAMILY = 3;

/** Which authored numerators a lane allows for each catalogue denominator. */
export type NumeratorPolicy = {
  /** Include `0/d`. Defaults to `false`. */
  readonly allowZero?: boolean;
  /** Include `d/d`, the whole. Defaults to `false`. */
  readonly allowWhole?: boolean;
  /** Include `d+1 .. 2d-1`, values at or above one whole. Defaults to `false`. */
  readonly allowImproper?: boolean;
};

/**
 * The one whole every card in a lane declares.
 *
 * It is lane-wide on purpose. A lane that shuffled per-card wholes could quietly draw `2/4` against a
 * collection of 4 objects on one card and a collection of 8 on another, which is exactly the
 * dishonesty GAME-186's shared-whole rules exist to prevent.
 */
export type LaneWholeDeclaration = {
  readonly continuousWholeId: string;
  readonly continuousWholeDescription: string;
  /** Total objects in the lane's countable collection. Every catalogue denominator must divide it. */
  readonly setTotalObjectCount: number;
  readonly setWholeId?: string;
  readonly setWholeDescription?: string;
  /** Stable axis identity the lane's number lines share. */
  readonly axisId: string;
  /** Equal parts per whole unit. Every catalogue denominator must divide it. */
  readonly ticksPerUnit: number;
  readonly domainStart?: number;
  readonly domainEnd?: number;
  readonly numberLineWholeDescription?: string;
};

/** How close a lane requires its distractor values to be. */
export type DistractorPolicy = {
  /**
   * Minimum number of near-miss links the pool must contain.
   *
   * A near-miss link is two pool values whose authored forms share a numerator or a denominator, which
   * is what makes a wrong answer *plausible* rather than random. Defaults to `poolSize - 1`, i.e. the
   * pool must be connected through near-miss links.
   */
  readonly minimumNearMissLinks?: number;
};

/** One lane: a pool of values, one whole, one card box, one representation preference order. */
export type LaneConfig = {
  readonly laneId: string;
  readonly gradeBand: GradeBand;
  readonly title: string;
  readonly pairCount: number;
  /** The card every representation must be legible in. GAME-188 owns the real card size. */
  readonly cardBox: RepresentationBox;
  /** Authored denominators this lane may deal. */
  readonly denominatorCatalogue: readonly number[];
  readonly numeratorPolicy?: NumeratorPolicy;
  /** Forms per value. Defaults to {@link DEFAULT_MAX_FORMS_PER_FAMILY}. */
  readonly maxFormsPerFamily?: number;
  /** Candidate families in the lane's preference order, first is preferred. */
  readonly representationMix: readonly RepresentationCandidate[];
  /** Require a pair's two cards to use different families where another family is legible. Defaults to true. */
  readonly requireDistinctRepresentationPerPair?: boolean;
  readonly whole: LaneWholeDeclaration;
  readonly distractorPolicy?: DistractorPolicy;
  /** Forwarded to the engine's deck generator. */
  readonly constraints?: { readonly requireDistinctAuthoredForms?: boolean };
};

/** An ordered run of lanes within one grade band. */
export type LaneSequence = {
  readonly sequenceId: string;
  readonly gradeBand: GradeBand;
  readonly lanes: readonly LaneConfig[];
};

/** Where a lane sits inside its sequence. Progression is ordering; it carries no outcome state. */
export type LaneProgress = {
  readonly index: number;
  readonly total: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
};

/** Thrown when a lane configuration cannot be dealt as written. */
export class LaneConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`lane configuration is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "LaneConfigError";
    this.problems = [...problems];
  }
}

function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `array(length ${value.length})`;
  if (value === null) return "null";
  return typeof value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Structural problems in a lane, before any maths or drawing is considered. */
export function laneStructureProblems(lane: LaneConfig): readonly string[] {
  const problems: string[] = [];

  if (typeof lane !== "object" || lane === null) {
    return [`lane must be an object; received ${describe(lane)}`];
  }

  if (!isNonEmptyString(lane.laneId)) problems.push(`laneId must be a non-empty string; received ${describe(lane.laneId)}`);
  if (!isNonEmptyString(lane.title)) problems.push(`title must be a non-empty string; received ${describe(lane.title)}`);
  if (!GRADE_BANDS.includes(lane.gradeBand)) {
    problems.push(`gradeBand must be one of ${GRADE_BANDS.join(", ")}; received ${describe(lane.gradeBand)}`);
  }

  if (!Number.isSafeInteger(lane.pairCount)) {
    problems.push(`pairCount must be a safe integer; received ${describe(lane.pairCount)}`);
  } else if (lane.pairCount < MIN_PAIR_COUNT || lane.pairCount > MAX_PAIR_COUNT) {
    problems.push(`pairCount must be within ${MIN_PAIR_COUNT}..${MAX_PAIR_COUNT}; received ${lane.pairCount}`);
  }

  const box = lane.cardBox;
  if (typeof box !== "object" || box === null) {
    problems.push(`cardBox must be an object; received ${describe(box)}`);
  } else {
    for (const axis of ["width", "height"] as const) {
      const value = box[axis];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        problems.push(`cardBox ${axis} must be a positive finite number; received ${describe(value)}`);
      }
    }
  }

  if (!Array.isArray(lane.denominatorCatalogue)) {
    problems.push(`denominatorCatalogue must be an array; received ${describe(lane.denominatorCatalogue)}`);
  } else if (lane.denominatorCatalogue.length === 0) {
    problems.push("denominatorCatalogue must contain at least one denominator");
  } else {
    const seen = new Set<number>();
    lane.denominatorCatalogue.forEach((denominator, index) => {
      if (!Number.isSafeInteger(denominator)) {
        problems.push(`denominatorCatalogue[${index}] must be a safe integer; received ${describe(denominator)}`);
        return;
      }
      if (denominator < LANE_MIN_DENOMINATOR || denominator > LANE_MAX_DENOMINATOR) {
        problems.push(
          `denominatorCatalogue[${index}] must be within ${LANE_MIN_DENOMINATOR}..${LANE_MAX_DENOMINATOR}; received ${denominator}`,
        );
      }
      if (seen.has(denominator)) problems.push(`denominatorCatalogue[${index}] duplicates denominator ${denominator}`);
      seen.add(denominator);
    });
  }

  const policy = lane.numeratorPolicy;
  if (policy !== undefined) {
    if (typeof policy !== "object" || policy === null) {
      problems.push(`numeratorPolicy must be an object; received ${describe(policy)}`);
    } else {
      for (const key of ["allowZero", "allowWhole", "allowImproper"] as const) {
        const value = policy[key];
        if (value !== undefined && typeof value !== "boolean") {
          problems.push(`numeratorPolicy.${key} must be a boolean; received ${describe(value)}`);
        }
      }
    }
  }

  if (lane.maxFormsPerFamily !== undefined && (!Number.isSafeInteger(lane.maxFormsPerFamily) || lane.maxFormsPerFamily < 2)) {
    problems.push(`maxFormsPerFamily must be an integer of at least 2; received ${describe(lane.maxFormsPerFamily)}`);
  }

  if (lane.requireDistinctRepresentationPerPair !== undefined && typeof lane.requireDistinctRepresentationPerPair !== "boolean") {
    problems.push(
      `requireDistinctRepresentationPerPair must be a boolean; received ${describe(lane.requireDistinctRepresentationPerPair)}`,
    );
  }

  if (!Array.isArray(lane.representationMix)) {
    problems.push(`representationMix must be an array; received ${describe(lane.representationMix)}`);
  } else if (lane.representationMix.length === 0) {
    problems.push("representationMix must contain at least one family");
  } else {
    const seenFamilies = new Set<string>();
    lane.representationMix.forEach((candidate, index) => {
      if (typeof candidate !== "object" || candidate === null) {
        problems.push(`representationMix[${index}] must be an object; received ${describe(candidate)}`);
        return;
      }
      if (!isNonEmptyString(candidate.family)) {
        problems.push(`representationMix[${index}].family must be a non-empty string; received ${describe(candidate.family)}`);
        return;
      }
      if (seenFamilies.has(candidate.family)) {
        problems.push(`representationMix[${index}] repeats the family "${candidate.family}"; preference order must be unambiguous`);
      }
      seenFamilies.add(candidate.family);
      if (candidate.maxPartitionCount !== undefined && !isPositiveSafeInteger(candidate.maxPartitionCount)) {
        problems.push(
          `representationMix[${index}].maxPartitionCount must be a positive integer; received ${describe(candidate.maxPartitionCount)}`,
        );
      }
    });
  }

  const whole = lane.whole;
  if (typeof whole !== "object" || whole === null) {
    problems.push(`whole must be an object; received ${describe(whole)}`);
  } else {
    for (const key of ["continuousWholeId", "continuousWholeDescription", "axisId"] as const) {
      if (!isNonEmptyString(whole[key])) problems.push(`whole.${key} must be a non-empty string; received ${describe(whole[key])}`);
    }
    for (const key of ["setWholeId", "setWholeDescription", "numberLineWholeDescription"] as const) {
      const value = whole[key];
      if (value !== undefined && !isNonEmptyString(value)) {
        problems.push(`whole.${key} must be a non-empty string when supplied; received ${describe(value)}`);
      }
    }
    if (!isPositiveSafeInteger(whole.setTotalObjectCount)) {
      problems.push(`whole.setTotalObjectCount must be a positive integer; received ${describe(whole.setTotalObjectCount)}`);
    }
    if (!isPositiveSafeInteger(whole.ticksPerUnit)) {
      problems.push(`whole.ticksPerUnit must be a positive integer; received ${describe(whole.ticksPerUnit)}`);
    }
    const start = whole.domainStart ?? 0;
    const end = whole.domainEnd ?? 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
      problems.push(`whole domain must be an ascending integer range; received ${describe(start)}..${describe(end)}`);
    }
  }

  const distractorPolicy = lane.distractorPolicy;
  if (distractorPolicy !== undefined) {
    if (typeof distractorPolicy !== "object" || distractorPolicy === null) {
      problems.push(`distractorPolicy must be an object; received ${describe(distractorPolicy)}`);
    } else if (
      distractorPolicy.minimumNearMissLinks !== undefined &&
      (!Number.isSafeInteger(distractorPolicy.minimumNearMissLinks) || distractorPolicy.minimumNearMissLinks < 0)
    ) {
      problems.push(
        `distractorPolicy.minimumNearMissLinks must be a non-negative integer; received ${describe(distractorPolicy.minimumNearMissLinks)}`,
      );
    }
  }

  return Object.freeze(problems);
}

/** Structural problems in a sequence, plus per-lane problems of its member lanes. */
export function laneSequenceProblems(sequence: LaneSequence): readonly string[] {
  const problems: string[] = [];

  if (typeof sequence !== "object" || sequence === null) {
    return [`lane sequence must be an object; received ${describe(sequence)}`];
  }
  if (!isNonEmptyString(sequence.sequenceId)) {
    problems.push(`sequenceId must be a non-empty string; received ${describe(sequence.sequenceId)}`);
  }
  if (!GRADE_BANDS.includes(sequence.gradeBand)) {
    problems.push(`sequence gradeBand must be one of ${GRADE_BANDS.join(", ")}; received ${describe(sequence.gradeBand)}`);
  }
  if (!Array.isArray(sequence.lanes) || sequence.lanes.length === 0) {
    problems.push(`sequence must contain at least one lane; received ${describe(sequence.lanes)}`);
    return Object.freeze(problems);
  }

  const seenLaneIds = new Set<string>();
  sequence.lanes.forEach((lane, index) => {
    if (typeof lane !== "object" || lane === null) {
      problems.push(`lanes[${index}] must be an object; received ${describe(lane)}`);
      return;
    }
    if (typeof lane.laneId === "string") {
      if (seenLaneIds.has(lane.laneId)) problems.push(`lanes[${index}] repeats laneId "${lane.laneId}"`);
      seenLaneIds.add(lane.laneId);
    }
    if (lane.gradeBand !== sequence.gradeBand) {
      problems.push(
        `lanes[${index}] ("${String(lane.laneId)}") declares gradeBand ${String(lane.gradeBand)}, but the sequence is ${String(sequence.gradeBand)}`,
      );
    }
  });

  return Object.freeze(problems);
}

/** Where a lane index sits inside a sequence, clamped into range. */
export function laneProgress(sequence: LaneSequence, index: number): LaneProgress {
  const total = sequence.lanes.length;
  const clamped = Math.min(Math.max(Math.trunc(index), 0), total - 1);
  return Object.freeze({ index: clamped, total, isFirst: clamped === 0, isLast: clamped === total - 1 });
}

/**
 * The next lane in order, clamped at the end.
 *
 * Whether a lane *should* advance is a session outcome question and belongs to GAME-190/191. This is
 * ordering only: it never inspects play, and it cannot loop or skip.
 */
export function laneIndexAfter(sequence: LaneSequence, index: number): number {
  return laneProgress(sequence, index + 1).index;
}

/** The previous lane in order, clamped at the start. */
export function laneIndexBefore(sequence: LaneSequence, index: number): number {
  return laneProgress(sequence, index - 1).index;
}
