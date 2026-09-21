/**
 * Difficulty ladder (GAME-187).
 *
 * Adaptation needs somewhere to move. This module derives that "somewhere" from the lane itself, so a lane
 * author declares content once and gets a deterministic sequence of easier variants for free.
 *
 * The construction is the whole point:
 *
 * - the ladder runs from the **most scaffolded** rung (index 0) to the **lane as written** (the last rung),
 *   so a session starts easy and climbs;
 * - each rung is produced from the previous one by a single bounded edit — restore the printed label, drop
 *   the least-preferred representation family, or drop the largest catalogue denominator — so two adjacent
 *   rungs differ in exactly one dimension, which is asserted rather than assumed;
 * - a rung is only kept when it is *still a satisfiable lane*, so adaptation can never walk into a board the
 *   lane layer would refuse. When no bounded edit is possible the ladder simply stops: a one-rung ladder is
 *   a legitimate answer, and an easier lie would not be.
 *
 * A rung is never allowed to widen a lane's own catalogue or mix, so adaptation cannot escape the lane the
 * learner chose.
 */

import type { RepresentationCandidate } from "../representations";
import { LABEL_VISIBILITY_VALUES, type LabelVisibility, type LaneConfig } from "./schema";
import { isSatisfiableLane } from "./validate";

/** The bounded dimensions a rung may differ in. Nothing else is ever touched. */
export type DifficultyDimension = "denominator-reach" | "representation-mixing" | "label-scaffolding";

/** Canonical dimension order, cheapest reduction first. */
export const DIFFICULTY_DIMENSIONS: readonly DifficultyDimension[] = Object.freeze([
  "label-scaffolding",
  "representation-mixing",
  "denominator-reach",
]);

/** One rung: a valid lane plus what changed to reach it from the rung below. */
export type LaneRung = {
  readonly step: number;
  /** `null` only at step 0, which is the most scaffolded rung. */
  readonly dimension: DifficultyDimension | null;
  readonly variant: LaneConfig;
};

/** A lane's ordered rungs, easiest first. */
export type LaneLadder = {
  readonly laneId: string;
  readonly rungs: readonly LaneRung[];
  /** The index of the lane as written. Always `rungs.length - 1`. */
  readonly hardestStep: number;
};

/** Thrown when a ladder would misrepresent a lane. */
export class LaneLadderError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`lane ladder is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "LaneLadderError";
    this.problems = [...problems];
  }
}

type Signature = {
  readonly denominators: string;
  readonly families: string;
  readonly labels: LabelVisibility;
};

function signatureOf(lane: LaneConfig): Signature {
  return {
    denominators: [...lane.denominatorCatalogue].sort((left, right) => left - right).join(","),
    families: lane.representationMix.map((candidate) => candidate.family).join(","),
    labels: lane.labelVisibility ?? "always",
  };
}

/** Which bounded dimensions two lanes differ in. Used to prove "one at a time". */
export function differingDimensions(left: LaneConfig, right: LaneConfig): readonly DifficultyDimension[] {
  const a = signatureOf(left);
  const b = signatureOf(right);
  const differing: DifficultyDimension[] = [];
  if (a.denominators !== b.denominators) differing.push("denominator-reach");
  if (a.families !== b.families) differing.push("representation-mixing");
  if (a.labels !== b.labels) differing.push("label-scaffolding");
  return Object.freeze(differing);
}

function withLabel(lane: LaneConfig, labelVisibility: LabelVisibility): LaneConfig {
  return { ...lane, labelVisibility };
}

function withoutLastFamily(lane: LaneConfig): LaneConfig {
  const mix: readonly RepresentationCandidate[] = lane.representationMix.slice(0, -1);
  return { ...lane, representationMix: mix };
}

function withoutLargestDenominator(lane: LaneConfig): LaneConfig {
  const sorted = [...lane.denominatorCatalogue].sort((left, right) => left - right);
  return { ...lane, denominatorCatalogue: sorted.slice(0, -1) };
}

/**
 * The bounded edits that make a lane easier, hardest first.
 *
 * Each edit is kept only when the result is still a satisfiable lane, and the walk stops at the first edit
 * that is not. That is deliberately conservative: a ladder that keeps going past an undealable rung would
 * hand adaptation a configuration the layer would refuse at deal time.
 */
function reductions(lane: LaneConfig): readonly { readonly dimension: DifficultyDimension; readonly variant: LaneConfig }[] {
  const steps: { dimension: DifficultyDimension; variant: LaneConfig }[] = [];
  let current = lane;

  // Label visibility is content scaffolding, not content: no part of lane validation reads it, so restoring
  // the printed label cannot make a satisfiable lane unsatisfiable and needs no probe. The two content
  // dimensions below do change what can be dealt, so each is probed before it is kept.
  if ((current.labelVisibility ?? "always") !== "always") {
    const easier = withLabel(current, "always");
    steps.push({ dimension: "label-scaffolding", variant: easier });
    current = easier;
  }

  while (current.representationMix.length > 1) {
    const easier = withoutLastFamily(current);
    if (!isSatisfiableLane(easier)) break;
    steps.push({ dimension: "representation-mixing", variant: easier });
    current = easier;
  }

  while (current.denominatorCatalogue.length > 1) {
    const easier = withoutLargestDenominator(current);
    if (!isSatisfiableLane(easier)) break;
    steps.push({ dimension: "denominator-reach", variant: easier });
    current = easier;
  }

  return Object.freeze(steps);
}

/**
 * Derive a lane's ladder.
 *
 * @throws {LaneLadderError} when the lane itself cannot be dealt as written, or when the derived ladder
 * fails {@link assertLaneLadderInvariants}.
 */
export function laneLadder(lane: LaneConfig): LaneLadder {
  if (!isSatisfiableLane(lane)) {
    throw new LaneLadderError([
      `lane "${String(lane?.laneId)}" is not satisfiable as written, so no ladder can be derived from it`,
    ]);
  }

  const steps = reductions(lane);
  // Hardest first while walking, easiest first as a ladder.
  const chain: LaneConfig[] = [lane, ...steps.map((step) => step.variant)];
  const easiestFirst = [...chain].reverse();

  const rungs: LaneRung[] = easiestFirst.map((variant, index) => {
    if (index === 0) return Object.freeze({ step: 0, dimension: null, variant });
    const previous = easiestFirst[index - 1]!;
    // Every reduction changes something, so a rung above step 0 differs from the one below it in at least
    // one dimension. `assertLaneLadderInvariants` re-derives this and refuses a rung that changes two, so
    // the label is checked rather than trusted.
    const differing = differingDimensions(previous, variant);
    return Object.freeze({
      step: index,
      dimension: differing[0] as DifficultyDimension,
      variant,
    });
  });

  const ladder: LaneLadder = Object.freeze({
    laneId: lane.laneId,
    rungs: Object.freeze(rungs),
    hardestStep: rungs.length - 1,
  });

  assertLaneLadderInvariants(ladder, lane);
  return ladder;
}

/**
 * Prove a ladder without trusting the derivation.
 *
 * Every rung is re-validated with the lane layer's own validator, the top rung is compared against the lane
 * as written, and each adjacent pair is shown to differ in exactly one dimension and to move in the
 * *easier* direction. Exported so a session, a fixture or a future story can assert a ladder it did not
 * build.
 *
 * @throws {LaneLadderError} when the ladder could not have been derived from the lane.
 */
export function assertLaneLadderInvariants(ladder: LaneLadder, lane: LaneConfig): void {
  const problems: string[] = [];

  if (!Array.isArray(ladder.rungs) || ladder.rungs.length === 0) {
    problems.push("a ladder must hold at least one rung");
    throw new LaneLadderError(problems);
  }
  if (ladder.rungs.length !== ladder.hardestStep + 1) {
    problems.push(`hardestStep ${ladder.hardestStep} does not match ${ladder.rungs.length} rung(s)`);
  }
  if (ladder.rungs[0]!.step !== 0 || ladder.rungs[0]!.dimension !== null) {
    problems.push("step 0 must be the most scaffolded rung and carry no dimension");
  }

  ladder.rungs.forEach((rung, index) => {
    if (rung.step !== index) problems.push(`rung at index ${index} is labelled step ${rung.step}`);
    if (!isSatisfiableLane(rung.variant)) problems.push(`step ${rung.step} is not satisfiable`);
    if (rung.variant.laneId !== lane.laneId) problems.push(`step ${rung.step} changes the lane identity`);
    if (rung.variant.gradeBand !== lane.gradeBand) problems.push(`step ${rung.step} changes the grade band`);
    if (rung.variant.pairCount !== lane.pairCount) problems.push(`step ${rung.step} changes the pair count`);
  });

  const hardest = ladder.rungs[ladder.hardestStep];
  if (hardest === undefined) {
    problems.push(`hardestStep ${String(ladder.hardestStep)} does not name a rung`);
  } else {
    if (signatureOf(hardest.variant).denominators !== signatureOf(lane).denominators) {
      problems.push("the hardest rung is not the lane as written (denominator catalogue differs)");
    }
    if (signatureOf(hardest.variant).families !== signatureOf(lane).families) {
      problems.push("the hardest rung is not the lane as written (representation mix differs)");
    }
    if (signatureOf(hardest.variant).labels !== signatureOf(lane).labels) {
      problems.push("the hardest rung is not the lane as written (label visibility differs)");
    }
  }

  for (let index = 1; index < ladder.rungs.length; index += 1) {
    const easier = ladder.rungs[index - 1]!;
    const harder = ladder.rungs[index]!;
    const differing = differingDimensions(easier.variant, harder.variant);

    if (differing.length !== 1) {
      problems.push(
        `steps ${easier.step} and ${harder.step} differ in ${differing.length} dimension(s); every rung must change exactly one`,
      );
      continue;
    }
    if (harder.dimension !== differing[0]) {
      problems.push(`step ${harder.step} is labelled ${String(harder.dimension)} but differs in ${differing[0]}`);
    }

    const dimension = differing[0]!;
    if (dimension === "label-scaffolding") {
      const easierIndex = LABEL_VISIBILITY_VALUES.indexOf(easier.variant.labelVisibility ?? "always");
      const harderIndex = LABEL_VISIBILITY_VALUES.indexOf(harder.variant.labelVisibility ?? "always");
      if (easierIndex > harderIndex) problems.push(`step ${harder.step} adds scaffolding instead of removing it`);
    }
    if (dimension === "representation-mixing") {
      const easierFamilies = easier.variant.representationMix.map((candidate: RepresentationCandidate) => candidate.family);
      const harderFamilies = harder.variant.representationMix.map((candidate: RepresentationCandidate) => candidate.family);
      if (easierFamilies.join(",") !== harderFamilies.slice(0, easierFamilies.length).join(",")) {
        problems.push(`step ${harder.step} does not extend step ${easier.step}'s representation mix in place`);
      }
    }
    if (dimension === "denominator-reach") {
      const harderCatalogue = new Set(harder.variant.denominatorCatalogue);
      for (const denominator of easier.variant.denominatorCatalogue) {
        if (!harderCatalogue.has(denominator)) {
          problems.push(`step ${harder.step} does not keep step ${easier.step}'s denominator ${denominator}`);
        }
      }
    }
  }

  if (problems.length > 0) throw new LaneLadderError(problems);
}
