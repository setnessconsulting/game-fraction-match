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

/**
 * The one catalogue denominator that may never be drawn as a partition grid.
 *
 * A hundred-part card grid is unreadable at every shipped card size, so a lane whose catalogue contains
 * 100 must resolve that value symbolically or on a number line. Enforced by
 * `laneHundredPartGridProblems`, because "the legibility policy happens to reject it" is a measurement
 * and not a promise.
 */
export const HUNDRED_PART_DENOMINATOR = 100;

/** How many authored forms one value may contribute to a lane's pool. */
export const DEFAULT_MAX_FORMS_PER_FAMILY = 3;

/**
 * Smallest scale factor that writes a *different* authored form of the same value.
 *
 * Scale factor 1 is the value's own authored form and is always available, so a lane only declares the
 * factors that write an equivalent notation on top of it. `2` is therefore the smallest declarable factor.
 */
export const MIN_LANE_SCALE_FACTOR = 2;

/**
 * Whether a card shows the written fraction beside (or instead of) its picture.
 *
 * This is the scaffolding knob. `always` states the value in words as well as in geometry, `on-reveal`
 * withholds the label until the card is matched, and `never` is the lowest-scaffolding setting. The
 * *adaptation* layer may restore scaffolding after repeated confusion, but only between boards.
 */
export type LabelVisibility = "always" | "on-reveal" | "never";

/** Canonical label-visibility order, most scaffolded first. Adaptation unlocks along this list. */
export const LABEL_VISIBILITY_VALUES: readonly LabelVisibility[] = Object.freeze([
  "always",
  "on-reveal",
  "never",
]);

/**
 * Which near-miss relationship classes a lane accepts as distractor material.
 *
 * A distractor is *plausible* when it shares a written signal with the target — the same numerator
 * (`1/2` beside `1/3`) or the same denominator (`1/4` beside `3/4`). A lane may declare which of those
 * two classes it wants; the classes are the pool-level vocabulary, not a rendering decision.
 */
export type DistractorFamily = "same-numerator" | "same-denominator";

/** Canonical distractor-family order. */
export const DISTRACTOR_FAMILIES: readonly DistractorFamily[] = Object.freeze([
  "same-numerator",
  "same-denominator",
]);

/**
 * The three session thresholds a lane declares.
 *
 * - `progression` — how many consecutive clean boards are needed before difficulty may step **up** one
 *   rung. One rung per boundary, never more.
 * - `fallback` — how many confusions inside one board step difficulty **down** one rung. Applied at the
 *   next boundary, so the board the learner is looking at never changes under them.
 * - `review` — how many boards later a confused value is scheduled for a fresh review instance.
 *
 * Latency is deliberately absent: speed is diagnostic and can never promote or demote.
 */
export type LaneThresholds = {
  readonly progression: number;
  readonly fallback: number;
  readonly review: number;
};

/** Defaults for a lane that does not state its own thresholds. Documented so a lane can be explicit. */
export const DEFAULT_LANE_THRESHOLDS: LaneThresholds = Object.freeze({ progression: 2, fallback: 2, review: 1 });

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
  /**
   * Minimum exact gap between two distinct values in the pool, written as an authored fraction (`1/8`).
   *
   * A distractor too close to its target is a coin toss rather than a question. The gap is compared on
   * the lane's own axis: every catalogue denominator already divides `whole.ticksPerUnit`, so each pool
   * value has an exact tick position and the comparison stays integer arithmetic. The gap's denominator
   * must therefore divide `ticksPerUnit` too, otherwise the gap could not be placed on the axis at all.
   */
  readonly minimumRationalGap?: { readonly numerator: number; readonly denominator: number };
  /**
   * Which near-miss classes this lane accepts as distractor material. Defaults to every class the pool
   * happens to realize; when declared, each named class must actually occur in the pool.
   */
  readonly families?: readonly DistractorFamily[];
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
  /**
   * The scale factors this lane may use to write an equivalent authored form of a value. Each factor is
   * an integer of at least {@link MIN_LANE_SCALE_FACTOR}. Omit to accept every factor the catalogue
   * naturally affords.
   */
  readonly scaleFactors?: readonly number[];
  /** Whether cards show their written label. Defaults to `"always"`. */
  readonly labelVisibility?: LabelVisibility;
  /** Progression, fallback and review thresholds. Defaults to {@link DEFAULT_LANE_THRESHOLDS}. */
  readonly thresholds?: LaneThresholds;
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

/**
 * Whether a value is a plain options object.
 *
 * An array is `typeof "object"` too, and treating one as a policy would let `distractorPolicy: []` read as
 * "use the defaults" — which is exactly the kind of silent acceptance this schema refuses elsewhere.
 */
function isOptionsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (!isOptionsObject(policy)) {
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
  if (!isOptionsObject(whole)) {
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
    if (!isOptionsObject(distractorPolicy)) {
      problems.push(`distractorPolicy must be an object; received ${describe(distractorPolicy)}`);
    } else {
      if (
        distractorPolicy.minimumNearMissLinks !== undefined &&
        (!Number.isSafeInteger(distractorPolicy.minimumNearMissLinks) || distractorPolicy.minimumNearMissLinks < 0)
      ) {
        problems.push(
          `distractorPolicy.minimumNearMissLinks must be a non-negative integer; received ${describe(distractorPolicy.minimumNearMissLinks)}`,
        );
      }

      const gap = distractorPolicy.minimumRationalGap;
      if (gap !== undefined) {
        if (!isOptionsObject(gap)) {
          problems.push(`distractorPolicy.minimumRationalGap must be an object; received ${describe(gap)}`);
        } else {
          if (!Number.isSafeInteger(gap.numerator) || gap.numerator < 0) {
            problems.push(
              `distractorPolicy.minimumRationalGap.numerator must be a non-negative integer; received ${describe(gap.numerator)}`,
            );
          }
          if (!Number.isSafeInteger(gap.denominator) || gap.denominator < 1) {
            problems.push(
              `distractorPolicy.minimumRationalGap.denominator must be a positive integer; received ${describe(gap.denominator)}`,
            );
          }
        }
      }

      const families = distractorPolicy.families;
      if (families !== undefined) {
        if (!Array.isArray(families)) {
          problems.push(`distractorPolicy.families must be an array; received ${describe(families)}`);
        } else if (families.length === 0) {
          problems.push("distractorPolicy.families must name at least one distractor class");
        } else {
          const seen = new Set<string>();
          families.forEach((family, index) => {
            if (!DISTRACTOR_FAMILIES.includes(family)) {
              problems.push(
                `distractorPolicy.families[${index}] must be one of ${DISTRACTOR_FAMILIES.join(", ")}; received ${describe(family)}`,
              );
              return;
            }
            if (seen.has(family)) problems.push(`distractorPolicy.families[${index}] repeats distractor class "${family}"`);
            seen.add(family);
          });
        }
      }
    }
  }

  const scaleFactors = lane.scaleFactors;
  if (scaleFactors !== undefined) {
    if (!Array.isArray(scaleFactors)) {
      problems.push(`scaleFactors must be an array; received ${describe(scaleFactors)}`);
    } else if (scaleFactors.length === 0) {
      problems.push("scaleFactors must contain at least one factor");
    } else {
      const seen = new Set<number>();
      scaleFactors.forEach((factor, index) => {
        if (!Number.isSafeInteger(factor)) {
          problems.push(`scaleFactors[${index}] must be a safe integer; received ${describe(factor)}`);
          return;
        }
        if (factor < MIN_LANE_SCALE_FACTOR) {
          problems.push(
            `scaleFactors[${index}] must be at least ${MIN_LANE_SCALE_FACTOR}; scale factor 1 is the value's own authored form and is always available; received ${factor}`,
          );
        }
        if (seen.has(factor)) problems.push(`scaleFactors[${index}] duplicates scale factor ${factor}`);
        seen.add(factor);
      });
    }
  }

  if (lane.labelVisibility !== undefined && !LABEL_VISIBILITY_VALUES.includes(lane.labelVisibility)) {
    problems.push(
      `labelVisibility must be one of ${LABEL_VISIBILITY_VALUES.join(", ")}; received ${describe(lane.labelVisibility)}`,
    );
  }

  const thresholds = lane.thresholds;
  if (thresholds !== undefined) {
    if (!isOptionsObject(thresholds)) {
      problems.push(`thresholds must be an object; received ${describe(thresholds)}`);
    } else {
      for (const key of ["progression", "fallback", "review"] as const) {
        const value = thresholds[key];
        if (!Number.isSafeInteger(value) || value < 1) {
          problems.push(`thresholds.${key} must be an integer of at least 1; received ${describe(value)}`);
        }
      }
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
