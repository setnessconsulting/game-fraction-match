/**
 * Between-board adaptation and bounded session-local review (GAME-187).
 *
 * Everything here is pure, seeded and memory-only. A session is a frozen value, every transition returns a
 * *new* session, and nothing is written, scheduled or persisted anywhere. The rules are the product rules,
 * expressed as code:
 *
 * - **Difficulty changes only between boards.** A session's `currentStep` describes the board in play and is
 *   never revised; {@link recordBoardOutcome} decides the step for the *next* board. A learner who is losing
 *   the current board keeps the board they were given.
 * - **One bounded dimension at a time.** The step moves by at most one rung of the lane's ladder, and
 *   {@link laneLadder} proves that adjacent rungs differ in exactly one dimension.
 * - **Speed never promotes or demotes.** `activeMs` is carried as evidence and diagnostics and is read by no
 *   decision in this module.
 * - **Review is fresh.** A review item records the exact pair that was memorized, and the fresh board is
 *   rejected and re-dealt while it would reproduce that pair. Labels are restored on a review board, which is
 *   the story's documented scaffolding response to repeated confusion.
 * - **No mastery conclusion.** There is no score, proficiency, level or placement anywhere in this module's
 *   types or exports; a session reports what happened, not what a learner "is".
 *
 * Adaptation never escapes the lane: every board is dealt from a rung of that lane's own ladder, so the
 * catalogue and the representation mix can only ever be a subset of what the author wrote.
 */

import type { RepresentationFamily } from "../representations";
import { laneLadder, type DifficultyDimension, type LaneLadder } from "./difficulty";
import { planLaneDeck, type LanePlan } from "./plan";
import { DEFAULT_LANE_THRESHOLDS, type LabelVisibility, type LaneConfig, type LaneThresholds } from "./schema";
import { assertValidLane } from "./validate";

/** A canonical value, as the engine defines it: reduced, positive denominator. */
export type CanonicalValue = {
  readonly numerator: number;
  readonly denominator: number;
};

/** One card of the exact pair a learner saw, so a review instance can be proved to differ from it. */
export type MemorizedCard = {
  readonly numerator: number;
  readonly denominator: number;
  readonly representation: RepresentationFamily;
};

/** The exact pair a learner saw. A review schedule names it only so it can be avoided. */
export type MemorizedInstance = {
  readonly canonical: CanonicalValue;
  readonly cards: readonly MemorizedCard[];
};

/** Why a value was scheduled. Confusion is currently the only cause, and the type says so. */
export type ReviewReason = "confusion";

/** A scheduled review of one confused value. `dueOnBoard` is inclusive. */
export type ReviewItem = {
  readonly canonical: CanonicalValue;
  readonly memorized: MemorizedInstance;
  readonly raisedOnBoard: number;
  readonly dueOnBoard: number;
  readonly reason: ReviewReason;
};

/** One confused pair from one board, with the instance that was on screen when it happened. */
export type BoardConfusion = {
  readonly canonical: CanonicalValue;
  readonly memorized: MemorizedInstance;
};

/** What one finished board reported. */
export type BoardOutcome = {
  readonly laneId: string;
  readonly boardIndex: number;
  readonly pairCount: number;
  readonly matchedPairs: number;
  readonly confusions: readonly BoardConfusion[];
  /**
   * How long the board was active, in milliseconds.
   *
   * Recorded as evidence and shown as a diagnostic. It is deliberately never read when choosing difficulty:
   * speed is not a signal about understanding.
   */
  readonly activeMs: number;
};

/** The board currently in play. Frozen: adaptation never mutates it, it replaces it. */
export type LaneBoard = {
  readonly laneId: string;
  readonly boardIndex: number;
  readonly step: number;
  readonly dimension: DifficultyDimension | null;
  readonly randomSeed: number;
  readonly labelVisibility: LabelVisibility;
  /** The rung actually dealt, which equals the ladder's rung except that a review restores labels. */
  readonly lane: LaneConfig;
  readonly plan: LanePlan;
  readonly reviewedValues: readonly CanonicalValue[];
  /** Which of the reviewed values this board actually re-encountered. Measured, never promised. */
  readonly reviewedValuesDealt: readonly CanonicalValue[];
  readonly reviewRestoredLabels: boolean;
};

/** A session's whole state. Frozen value; memory only. */
export type LaneSession = {
  readonly laneId: string;
  readonly seed: number;
  readonly boardIndex: number;
  readonly currentStep: number;
  readonly completedBoards: number;
  readonly consecutiveCleanBoards: number;
  readonly review: readonly ReviewItem[];
  readonly evidence: readonly BoardOutcome[];
};

/** Factual session progress. Counts only: no mastery, proficiency or placement is expressed. */
export type LaneSessionSummary = {
  readonly boardIndex: number;
  readonly completedBoards: number;
  readonly step: number;
  readonly totalSteps: number;
  readonly pendingReviewCount: number;
  readonly dueReviewCount: number;
  readonly confusionCount: number;
  readonly activeMs: number;
};

/** How many review items a session may hold. Bounded, oldest dropped first. */
export const MAX_PENDING_REVIEW = 4;

/** How many finished boards a session keeps as evidence. Bounded, oldest dropped first. */
export const MAX_EVIDENCE_BOARDS = 32;

/** How many fresh deals a review board may try before it refuses to deal a memorized pair again. */
export const REVIEW_FRESHNESS_ATTEMPTS = 16;

/** Thrown when a session transition would break a rule, or a board cannot be dealt honestly. */
export class LaneSessionError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`lane session cannot continue:\n- ${problems.join("\n- ")}`);
    this.name = "LaneSessionError";
    this.problems = [...problems];
  }
}

/** The thresholds a lane runs on, with the documented defaults filled in. */
export function laneThresholdsOf(lane: LaneConfig): LaneThresholds {
  return lane.thresholds ?? DEFAULT_LANE_THRESHOLDS;
}

export function sameCanonicalValue(left: CanonicalValue, right: CanonicalValue): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/** The exact pair of a planned pair, in a form two boards can be compared by. */
function memorizedInstanceOfPair(plan: LanePlan, pairId: string): MemorizedInstance | null {
  const pair = plan.pairs.find((candidate) => candidate.pairId === pairId);
  if (pair === undefined) return null;
  return Object.freeze({
    canonical: Object.freeze({ numerator: pair.canonical.numerator, denominator: pair.canonical.denominator }),
    cards: Object.freeze(
      pair.cards.map((card) =>
        Object.freeze({
          numerator: card.form.numerator,
          denominator: card.form.denominator,
          representation: card.representation,
        }),
      ),
    ),
  });
}

/** Build the outcome of a finished board from the board itself, so nothing is reconstructed by hand. */
export function boardOutcomeFor(
  board: LaneBoard,
  report: {
    readonly matchedPairs: number;
    readonly confusedPairIds?: readonly string[];
    readonly activeMs: number;
  },
): BoardOutcome {
  const confusions: BoardConfusion[] = [];
  for (const pairId of report.confusedPairIds ?? []) {
    const memorized = memorizedInstanceOfPair(board.plan, pairId);
    if (memorized === null) continue;
    confusions.push(Object.freeze({ canonical: memorized.canonical, memorized }));
  }

  return Object.freeze({
    laneId: board.laneId,
    boardIndex: board.boardIndex,
    pairCount: board.plan.lane.pairCount,
    matchedPairs: report.matchedPairs,
    confusions: Object.freeze(confusions),
    activeMs: report.activeMs,
  });
}

/**
 * Start a session at the most scaffolded rung of the lane's ladder.
 *
 * @throws {LaneConfigError} when the lane is not valid as written.
 * @throws {LaneLadderError} when no honest ladder can be derived.
 */
export function createLaneSession(lane: LaneConfig, seed: number): LaneSession {
  assertValidLane(lane);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new LaneSessionError([`seed must be a 32-bit unsigned integer; received ${String(seed)}`]);
  }
  // Deriving the ladder here is what makes "adaptation never escapes the lane" a checked statement rather
  // than a comment: a session cannot exist for a lane that has no honest ladder.
  laneLadder(lane);

  return Object.freeze({
    laneId: lane.laneId,
    seed,
    boardIndex: 0,
    currentStep: 0,
    completedBoards: 0,
    consecutiveCleanBoards: 0,
    review: Object.freeze([]),
    evidence: Object.freeze([]),
  });
}

/** Review items whose due board has arrived. */
export function dueReviewItems(session: LaneSession): readonly ReviewItem[] {
  return Object.freeze(session.review.filter((item) => item.dueOnBoard <= session.boardIndex));
}

function boardSeed(sessionSeed: number, boardIndex: number, attempt: number): number {
  let value = (sessionSeed >>> 0) ^ Math.imul(boardIndex + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  return (value ^ (value >>> 12)) >>> 0;
}

/** A deal's pair reduced to what a learner would actually have seen: two authored forms, two families. */
function pairKey(cards: readonly MemorizedCard[]): string {
  return cards
    .map((card) => `${card.numerator}/${card.denominator}@${card.representation}`)
    .sort()
    .join("|");
}

function memorizedKeyOfPair(pair: LanePlan["pairs"][number]): string {
  return pairKey(
    pair.cards.map((card) => ({
      numerator: card.form.numerator,
      denominator: card.form.denominator,
      representation: card.representation,
    })),
  );
}

/**
 * Deal the board on screen.
 *
 * A board with due review restores printed labels and then refuses to deal the memorized pair again: the
 * same equivalence class may come back, but never the identical instance. Freshness is a property of the
 * deal, so it is checked against the deal rather than assumed from the seed.
 *
 * @throws {LaneSessionError} when no fresh deal can be found, which is a loud refusal rather than a quiet
 * repeat of the pair the learner already met.
 */
export function planLaneBoard(session: LaneSession, ladder: LaneLadder): LaneBoard {
  const rung = ladder.rungs[session.currentStep] ?? ladder.rungs[0]!;
  const due = dueReviewItems(session);
  const reviewRestoredLabels = due.length > 0 && (rung.variant.labelVisibility ?? "always") !== "always";
  const lane = reviewRestoredLabels ? { ...rung.variant, labelVisibility: "always" as const } : rung.variant;

  const avoided = due.map((item) => pairKey(item.memorized.cards));
  let plan: LanePlan | null = null;
  let randomSeed = 0;

  for (let attempt = 0; attempt < REVIEW_FRESHNESS_ATTEMPTS; attempt += 1) {
    randomSeed = boardSeed(session.seed, session.boardIndex, attempt);
    const dealt = planLaneDeck(lane, randomSeed);
    if (dealt.pairs.every((pair) => !avoided.includes(memorizedKeyOfPair(pair)))) {
      plan = dealt;
      break;
    }
  }

  if (plan === null) {
    throw new LaneSessionError([
      `could not deal a fresh review board for ${due.map((item) => `${item.canonical.numerator}/${item.canonical.denominator}`).join(", ")} ` +
        `in ${REVIEW_FRESHNESS_ATTEMPTS} attempt(s); the memorized pair would have been shown again`,
    ]);
  }

  const reviewedValues = Object.freeze(due.map((item) => item.canonical));
  const dealtValues = new Set(plan.pairs.map((pair) => `${pair.canonical.numerator}/${pair.canonical.denominator}`));
  const reviewedValuesDealt = Object.freeze(
    reviewedValues.filter((value) => dealtValues.has(`${value.numerator}/${value.denominator}`)),
  );

  return Object.freeze({
    laneId: session.laneId,
    boardIndex: session.boardIndex,
    step: rung.step,
    dimension: rung.dimension,
    randomSeed,
    labelVisibility: lane.labelVisibility ?? "always",
    lane,
    plan,
    reviewedValues,
    reviewedValuesDealt,
    reviewRestoredLabels,
  });
}

/**
 * Record a finished board and decide the next board's difficulty.
 *
 * The board that finished keeps its own step: the returned session is the *next* board, so a losing round
 * can only ever lower the difficulty of a board the learner has not been shown yet.
 *
 * @throws {LaneSessionError} when the outcome is not about the board that is in play.
 */
export function recordBoardOutcome(session: LaneSession, ladder: LaneLadder, outcome: BoardOutcome): LaneSession {
  const problems: string[] = [];
  if (outcome.laneId !== session.laneId) {
    problems.push(`outcome belongs to lane "${String(outcome.laneId)}", but this session is "${session.laneId}"`);
  }
  if (outcome.boardIndex !== session.boardIndex) {
    problems.push(`outcome is for board ${String(outcome.boardIndex)}, but board ${session.boardIndex} is in play`);
  }
  if (ladder.laneId !== session.laneId) {
    problems.push(`ladder belongs to lane "${ladder.laneId}", but this session is "${session.laneId}"`);
  }
  if (problems.length > 0) throw new LaneSessionError(problems);

  const lane = ladder.rungs[ladder.hardestStep]!.variant;
  const thresholds = laneThresholdsOf(lane);
  const confusionCount = outcome.confusions.length;

  let step = session.currentStep;
  let streak = session.consecutiveCleanBoards;

  if (confusionCount >= thresholds.fallback) {
    // Step down for the next board only. The board just described keeps the step it was dealt with.
    step = Math.max(0, step - 1);
    streak = 0;
  } else if (confusionCount === 0) {
    streak += 1;
    if (streak >= thresholds.progression) {
      step = Math.min(ladder.hardestStep, step + 1);
      streak = 0;
    }
  } else {
    streak = 0;
  }

  // `outcome.activeMs` is intentionally not mentioned here: latency is evidence, never a lever.
  const review = scheduleReview(session.review, outcome, thresholds);
  const evidence = [...session.evidence, outcome].slice(-MAX_EVIDENCE_BOARDS);

  return Object.freeze({
    laneId: session.laneId,
    seed: session.seed,
    boardIndex: session.boardIndex + 1,
    currentStep: step,
    completedBoards: session.completedBoards + 1,
    consecutiveCleanBoards: streak,
    review: Object.freeze(review),
    evidence: Object.freeze(evidence),
  });
}

function scheduleReview(
  existing: readonly ReviewItem[],
  outcome: BoardOutcome,
  thresholds: LaneThresholds,
): readonly ReviewItem[] {
  // Items that were due on the board that just finished have been served.
  const items = existing.filter((item) => item.dueOnBoard > outcome.boardIndex).slice();

  for (const confusion of outcome.confusions) {
    if (items.some((item) => sameCanonicalValue(item.canonical, confusion.canonical))) continue;
    items.push(
      Object.freeze({
        canonical: confusion.canonical,
        memorized: confusion.memorized,
        raisedOnBoard: outcome.boardIndex,
        dueOnBoard: outcome.boardIndex + thresholds.review,
        reason: "confusion" as const,
      }),
    );
  }

  // Bounded: the most recently raised items win, so a long session cannot grow without limit.
  return Object.freeze(items.slice(-MAX_PENDING_REVIEW));
}

/** Factual progress for a session. Never a conclusion about a learner. */
export function laneSessionSummary(session: LaneSession, ladder: LaneLadder): LaneSessionSummary {
  return Object.freeze({
    boardIndex: session.boardIndex,
    completedBoards: session.completedBoards,
    step: session.currentStep,
    totalSteps: ladder.rungs.length,
    pendingReviewCount: session.review.length,
    dueReviewCount: dueReviewItems(session).length,
    confusionCount: session.evidence.reduce((total, outcome) => total + outcome.confusions.length, 0),
    activeMs: session.evidence.reduce((total, outcome) => total + outcome.activeMs, 0),
  });
}
