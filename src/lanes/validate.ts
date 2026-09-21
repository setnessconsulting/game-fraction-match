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
import { familiesWithoutNearMissLinks, laneFamilies, nearMissLinks } from "./families";
import { LaneConfigError, laneStructureProblems, type LaneConfig } from "./schema";
import { laneWholeProblems } from "./wholes";

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
