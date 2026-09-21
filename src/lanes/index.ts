/**
 * Public lane boundary (GAME-187).
 *
 * A lane is content as data: which values may be dealt, which representations they may be drawn as, the one
 * whole every card shares, the card box, and how plausible its distractors must be. This module is the only
 * surface other code needs, and it is deliberately dependency-light: no React, no DOM and no package
 * imports, so a lane is testable in plain Node and cannot smuggle UI decisions into content.
 *
 * CONSUMER RULES
 * - **Validate before dealing.** `assertValidLane` (or `isSatisfiableLane` for a soft check) answers whether
 *   a lane can be drawn at all: catalogue divisibility, pool size, distractor connectivity and per-value
 *   legibility at the lane's card box.
 * - **Never shuffle a lane.** `planLaneDeck` lets the engine choose the values and the planner only relates
 *   them to representations. There is exactly one generator in this repository.
 * - **Trust the plan's diagnostics, not its prose.** `plan.diagnostics` reports measured near-miss links and
 *   representation counts; `assertLanePlanInvariants` re-derives them from the engine's deck.
 *
 * DOWNSTREAM OWNERS
 * - GAME-188 owns the real card size; a lane's `cardBox` is the box its representations were qualified at.
 * - GAME-189 renders a planned board; it never compares fractions and never picks a family.
 * - GAME-190/191 own feedback, session bounds and review: a lane's *progression* here is ordering only,
 *   because deciding when to advance needs outcomes this layer does not have.
 */

export {
  DEFAULT_MAX_FORMS_PER_FAMILY,
  GRADE_BANDS,
  LANE_MAX_DENOMINATOR,
  LANE_MIN_DENOMINATOR,
  LaneConfigError,
  laneIndexAfter,
  laneIndexBefore,
  laneProgress,
  laneSequenceProblems,
  laneStructureProblems,
} from "./schema";
export type {
  DistractorPolicy,
  GradeBand,
  LaneConfig,
  LaneProgress,
  LaneSequence,
  LaneWholeDeclaration,
  NumeratorPolicy,
} from "./schema";

export {
  dealtNearMissLinks,
  familiesWithoutNearMissLinks,
  laneEquivalenceFamilies,
  laneFamilies,
  laneNumerators,
  nearMissLinks,
  nearMissSignals,
} from "./families";
export type { LaneFamily, NearMissKind, NearMissLink } from "./families";

export { laneWholeFor, laneWholeProblems, laneWholeSummary, laneWholes } from "./wholes";
export type { LaneWholeResolver, LaneWholes } from "./wholes";

export { laneCoverageReport } from "./coverage";
export type { LaneCoverageReport, LaneFormCoverage } from "./coverage";

export { assertValidLane, isSatisfiableLane, validateLaneConfig } from "./validate";

export { LanePlanError, assertLanePlanInvariants, planLaneDeck } from "./plan";
export type { LaneCardPlan, LanePairPlan, LanePlan } from "./plan";
