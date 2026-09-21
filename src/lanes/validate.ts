/**
 * Lane validation (GAME-187).
 *
 * Four questions, asked in this order, because each one needs the previous answer:
 *
 * 1. **Is the lane structurally a lane?** (ids, grade band, pair count, card box, catalogue, policies.)
 * 2. **Can its wholes carry its catalogue?** Every denominator must divide the declared collection and the
 *    declared axis scale, otherwise a card could not be drawn honestly.
 * 3. **Does its catalogue yield a usable pool?** At least `pairCount` values, each with two authored forms,
 *    and — unless the lane explicitly lowers the bar — connected by near-miss links so wrong answers are
 *    plausible rather than random.
 * 4. **Can its mix draw every value in that pool at its card box?** The GAME-186 floors decide.
 *
 * A structural failure stops the audit: a lane whose catalogue cannot be enumerated cannot be measured.
 * Every later stage reports all of its problems at once so a lane author fixes a lane in one pass.
 */

import { laneCoverageReport } from "./coverage";
import { familiesWithoutNearMissLinks, laneFamilies, minimumPoolTickGap, nearMissLinks } from "./families";
import {
  HUNDRED_PART_DENOMINATOR,
  LaneConfigError,
  laneStructureProblems,
  type DistractorFamily,
  type LaneConfig,
} from "./schema";
import { laneWholeProblems } from "./wholes";

/**
 * The denominator-100 rule.
 *
 * A hundredth cannot be drawn as a partition grid at any shipped card size, so a lane that may deal a
 * hundredth must resolve it symbolically or on a number line. This is stated as a lane invariant rather
 * than left to the legibility floors: a floor is a measurement of one card, and a lane author needs the
 * rule to fail at validation time with the field that caused it.
 *
 * `symbolic` and `number-line` are exempt because neither draws a partition grid. Every other family must
 * declare a `maxPartitionCount` strictly below 100, which makes a hundred-part grid unreachable rather
 * than merely illegible.
 */
export function laneHundredPartGridProblems(lane: LaneConfig): readonly string[] {
  const problems: string[] = [];

  if (!Array.isArray(lane.denominatorCatalogue) || !lane.denominatorCatalogue.includes(HUNDRED_PART_DENOMINATOR)) {
    return Object.freeze(problems);
  }
  if (!Array.isArray(lane.representationMix)) return Object.freeze(problems);

  lane.representationMix.forEach((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) return;
    if (candidate.family === "symbolic" || candidate.family === "number-line") return;

    const cap = candidate.maxPartitionCount;
    if (!Number.isSafeInteger(cap) || cap >= HUNDRED_PART_DENOMINATOR) {
      problems.push(
        `representationMix[${index}] offers ${candidate.family} to a catalogue containing ${HUNDRED_PART_DENOMINATOR}, ` +
          `but that family can still be asked for ${HUNDRED_PART_DENOMINATOR} partitions; a hundredth must resolve to a symbolic ` +
          `or number-line treatment rather than a ${HUNDRED_PART_DENOMINATOR}-part card grid`,
      );
    }
  });

  return Object.freeze(problems);
}

/** Every problem that stops this lane being dealt as written. An empty list means "usable". */
export function validateLaneConfig(lane: LaneConfig): readonly string[] {
  const problems: string[] = [...laneStructureProblems(lane)];
  if (problems.length > 0) return Object.freeze(problems);

  problems.push(...laneWholeProblems(lane));

  const families = laneFamilies(lane);
  if (families.length < lane.pairCount) {
    problems.push(
      `the denominator catalogue ${JSON.stringify(lane.denominatorCatalogue)} yields ${families.length} value(s) with at least two authored forms, ` +
        `but pairCount is ${lane.pairCount}; add a multiple of an existing denominator (it adds an authored form) or lower pairCount`,
    );
  }

  const links = nearMissLinks(families);
  const requiredLinks = lane.distractorPolicy?.minimumNearMissLinks ?? Math.max(0, families.length - 1);
  if (links.length < requiredLinks) {
    const isolated = familiesWithoutNearMissLinks(families);
    problems.push(
      `the pool needs ${requiredLinks} near-miss link(s) but has ${links.length}` +
        (isolated.length === 0
          ? ""
          : `; these values share neither a numerator nor a denominator with any other value: ${isolated.join(", ")}`),
    );
  }

  const declaredDistractorFamilies = lane.distractorPolicy?.families;
  if (Array.isArray(declaredDistractorFamilies) && declaredDistractorFamilies.length > 0) {
    const realized = new Set<DistractorFamily>();
    for (const link of links) {
      if (link.sharedSignals.some((signal) => signal.startsWith("n:"))) realized.add("same-numerator");
      if (link.sharedSignals.some((signal) => signal.startsWith("d:"))) realized.add("same-denominator");
    }
    const missing = declaredDistractorFamilies.filter((family) => !realized.has(family));
    if (missing.length > 0) {
      problems.push(
        `the pool never realizes the declared distractor class(es) ${missing.join(", ")}; ` +
          `it only realizes ${[...realized].sort().join(", ") || "none"}. Add a denominator whose values share the missing signal`,
      );
    }
  }

  const gap = lane.distractorPolicy?.minimumRationalGap;
  if (
    gap !== undefined &&
    Number.isSafeInteger(gap.numerator) &&
    gap.numerator >= 0 &&
    Number.isSafeInteger(gap.denominator) &&
    gap.denominator >= 1
  ) {
    const ticksPerUnit = lane.whole.ticksPerUnit;
    if (Number.isSafeInteger(ticksPerUnit) && ticksPerUnit > 0) {
      if (ticksPerUnit % gap.denominator !== 0) {
        problems.push(
          `the declared distractor gap ${gap.numerator}/${gap.denominator} cannot be placed on the lane's axis of ` +
            `${ticksPerUnit} parts per unit; a gap is compared in whole ticks, so its denominator must divide ticksPerUnit`,
        );
      } else {
        const requiredTicks = gap.numerator * (ticksPerUnit / gap.denominator);
        const smallest = minimumPoolTickGap(families, ticksPerUnit);
        if (smallest !== null && smallest < requiredTicks) {
          problems.push(
            `the pool's closest two values sit ${smallest} tick(s) apart, closer than the declared distractor gap of ` +
              `${gap.numerator}/${gap.denominator} (${requiredTicks} tick(s)); widen the catalogue or lower the gap`,
          );
        }
      }
    }
  }

  problems.push(...laneHundredPartGridProblems(lane));

  if (lane.numeratorPolicy?.allowImproper === true && lane.representationMix.some((candidate) => candidate.family === "set")) {
    problems.push(
      "a set model shows parts of one collection, so a lane that allows values at or above one whole cannot keep the set family in its mix; " +
        "remove \"set\" or stop allowing improper values",
    );
  }

  problems.push(...laneCoverageReport(lane).problems);

  return Object.freeze(problems);
}

/** Non-throwing validation. */
export function isSatisfiableLane(lane: LaneConfig): boolean {
  return validateLaneConfig(lane).length === 0;
}

/** Validate and throw. Used by anything that is about to deal a board. */
export function assertValidLane(lane: LaneConfig): LaneConfig {
  const problems = validateLaneConfig(lane);
  if (problems.length > 0) throw new LaneConfigError(problems);
  return lane;
}
