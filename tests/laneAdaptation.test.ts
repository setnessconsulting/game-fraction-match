import { describe, expect, it } from "vitest";

import * as lanes from "../src/lanes";
import {
  LaneSessionError,
  MAX_PENDING_REVIEW,
  boardOutcomeFor,
  createLaneSession,
  dueReviewItems,
  laneLadder,
  laneSessionSummary,
  planLaneBoard,
  recordBoardOutcome,
  type BoardConfusion,
  type LaneBoard,
  type LaneConfig,
  type LaneLadder,
  type LaneSession,
} from "../src/lanes";
import { laneWithCatalogue, laneWithMix, testLane } from "./laneTestFixtures";

/**
 * Adaptation is where product rules become falsifiable. The tests below assert the rules the story states:
 * difficulty moves only between boards and only one rung at a time, speed is evidence and never a lever,
 * review is scheduled and fresh, the session is bounded, and nothing anywhere concludes mastery.
 */

const FAST_SESSION_SEED = 0x51ed270b;

/** A lane whose thresholds make one clean board enough to climb one rung, and one confusion enough to drop. */
function eagerLane(overrides: Partial<LaneConfig> = {}): LaneConfig {
  return testLane({ thresholds: { progression: 1, fallback: 1, review: 1 }, ...overrides });
}

function cleanOutcome(board: LaneBoard) {
  return boardOutcomeFor(board, { matchedPairs: board.plan.lane.pairCount, activeMs: 1_000 });
}

function lossOutcome(board: LaneBoard, pairIds: readonly string[], activeMs = 4_000) {
  return boardOutcomeFor(board, { matchedPairs: 0, confusedPairIds: pairIds, activeMs });
}

function advanceClean(session: LaneSession, ladder: LaneLadder, boards: number): LaneSession {
  let current = session;
  for (let index = 0; index < boards; index += 1) {
    current = recordBoardOutcome(current, ladder, cleanOutcome(planLaneBoard(current, ladder)));
  }
  return current;
}

function memorizedKeyOfCanonical(board: LaneBoard, canonical: lanes.CanonicalValue): string | null {
  const pair = board.plan.pairs.find(
    (candidate) =>
      candidate.canonical.numerator === canonical.numerator && candidate.canonical.denominator === canonical.denominator,
  );
  if (pair === undefined) return null;
  return pair.cards
    .map((card) => `${card.form.numerator}/${card.form.denominator}@${card.representation}`)
    .sort()
    .join("|");
}

describe("session lifecycle", () => {
  it("starts at the most scaffolded rung of the lane's own ladder", () => {
    const lane = testLane();
    const ladder = laneLadder(lane);
    const session = createLaneSession(lane, FAST_SESSION_SEED);

    expect(session).toEqual({
      laneId: lane.laneId,
      seed: FAST_SESSION_SEED,
      boardIndex: 0,
      currentStep: 0,
      completedBoards: 0,
      consecutiveCleanBoards: 0,
      review: [],
      evidence: [],
    });
    expect(Object.isFrozen(session)).toBe(true);

    const board = planLaneBoard(session, ladder);
    expect(board.step).toBe(0);
    expect(board.dimension).toBeNull();
    expect(board.plan.lane.representationMix).toEqual(ladder.rungs[0]!.variant.representationMix);
  });

  it("refuses a lane that cannot be dealt and a seed that is not a 32-bit unsigned integer", () => {
    expect(() => createLaneSession(testLane({ pairCount: 99 }), 1)).toThrow(/lane configuration is invalid/);
    expect(() => createLaneSession(testLane(), -1)).toThrow(LaneSessionError);
    expect(() => createLaneSession(testLane(), 2 ** 32)).toThrow(/seed must be a 32-bit unsigned integer/);
    expect(() => createLaneSession(testLane(), 1.5)).toThrow(/seed must be a 32-bit unsigned integer/);
  });

  it("deals the same board for the same session, deterministically", () => {
    const lane = testLane();
    const ladder = laneLadder(lane);
    const session = createLaneSession(lane, FAST_SESSION_SEED);

    const first = planLaneBoard(session, ladder);
    const second = planLaneBoard(session, ladder);

    expect(second.randomSeed).toBe(first.randomSeed);
    expect(second.plan.deck.cards.map((card) => card.cardId)).toEqual(first.plan.deck.cards.map((card) => card.cardId));
    expect(second.plan.cards.map((card) => card.representation)).toEqual(
      first.plan.cards.map((card) => card.representation),
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.plan)).toBe(true);
  });

  it("rejects an outcome that describes a different board or a different lane", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const session = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(session, ladder);

    expect(() => recordBoardOutcome(session, ladder, { ...cleanOutcome(board), boardIndex: 7 })).toThrow(
      /outcome is for board 7, but board 0 is in play/,
    );
    expect(() => recordBoardOutcome(session, ladder, { ...cleanOutcome(board), laneId: "other-lane" })).toThrow(
      /outcome belongs to lane "other-lane"/,
    );
  });

  it("rejects a ladder that belongs to a different lane", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const session = createLaneSession(lane, FAST_SESSION_SEED);
    const foreign = laneLadder(laneWithCatalogue([2, 4, 8], { laneId: "other-lane" }));

    expect(() => recordBoardOutcome(session, foreign, cleanOutcome(planLaneBoard(session, ladder)))).toThrow(
      /ladder belongs to lane "other-lane", but this session is "test-lane"/,
    );
  });

  it("clamps a session whose step has drifted past the end of its ladder", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const drifted: LaneSession = { ...createLaneSession(lane, FAST_SESSION_SEED), currentStep: 99 };

    const board = planLaneBoard(drifted, ladder);
    expect(board.step).toBe(0);
    expect(board.plan.lane).toEqual(ladder.rungs[0]!.variant);
  });

  it("ignores a confusion that names a pair the board never held", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const session = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(session, ladder);

    const outcome = boardOutcomeFor(board, { matchedPairs: 1, confusedPairIds: ["not-a-pair"], activeMs: 100 });
    expect(outcome.confusions).toEqual([]);
    expect(recordBoardOutcome(session, ladder, outcome).review).toEqual([]);
  });
});

describe("difficulty moves only between boards", () => {
  it("never lowers difficulty mid-board when a round is lost", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const climbed = advanceClean(createLaneSession(lane, FAST_SESSION_SEED), ladder, 1);
    expect(climbed.currentStep).toBe(1);

    // The board the learner is looking at, dealt at the current step.
    const inPlay = planLaneBoard(climbed, ladder);
    expect(inPlay.step).toBe(1);

    const afterLoss = recordBoardOutcome(climbed, ladder, lossOutcome(inPlay, [inPlay.plan.pairs[0]!.pairId]));

    // The board in play did not move beneath the learner...
    expect(climbed.currentStep).toBe(1);
    expect(inPlay.step).toBe(1);
    expect(planLaneBoard(climbed, ladder).step).toBe(1);
    expect(Object.isFrozen(climbed)).toBe(true);
    expect(Object.isFrozen(inPlay)).toBe(true);

    // ...and only the board that has not been shown yet is easier.
    expect(afterLoss.boardIndex).toBe(climbed.boardIndex + 1);
    expect(afterLoss.completedBoards).toBe(climbed.completedBoards + 1);
    expect(afterLoss.currentStep).toBe(0);
  });

  it("climbs one rung per progression threshold and stops at the lane as written", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);

    const afterOne = recordBoardOutcome(start, ladder, cleanOutcome(planLaneBoard(start, ladder)));
    expect(afterOne.currentStep).toBe(1);

    const afterTwo = recordBoardOutcome(afterOne, ladder, cleanOutcome(planLaneBoard(afterOne, ladder)));
    expect(afterTwo.currentStep).toBe(ladder.hardestStep);
    expect(afterTwo.currentStep).toBe(1);

    const afterThree = recordBoardOutcome(afterTwo, ladder, cleanOutcome(planLaneBoard(afterTwo, ladder)));
    expect(afterThree.currentStep).toBe(ladder.hardestStep);
  });

  it("holds the rung below progression and steps back at most one rung", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const climbed = advanceClean(createLaneSession(lane, FAST_SESSION_SEED), ladder, 1);
    const inPlay = planLaneBoard(climbed, ladder);

    // One confusion is enough at this lane's fallback threshold of 1, and it can only cost one rung.
    const back = recordBoardOutcome(climbed, ladder, lossOutcome(inPlay, [inPlay.plan.pairs[0]!.pairId]));
    expect(back.currentStep).toBe(0);

    const grounded = recordBoardOutcome(
      back,
      ladder,
      lossOutcome(planLaneBoard(back, ladder), [planLaneBoard(back, ladder).plan.pairs[0]!.pairId]),
    );
    expect(grounded.currentStep).toBe(0);
  });

  it("holds the rung while a clean board has not yet reached the progression threshold", () => {
    const lane = testLane({ thresholds: { progression: 3, fallback: 2, review: 1 } });
    const ladder = laneLadder(lane);
    let session = createLaneSession(lane, FAST_SESSION_SEED);

    for (let index = 0; index < 2; index += 1) {
      session = recordBoardOutcome(session, ladder, cleanOutcome(planLaneBoard(session, ladder)));
    }
    expect(session.currentStep).toBe(0);
    expect(session.consecutiveCleanBoards).toBe(2);

    session = recordBoardOutcome(session, ladder, cleanOutcome(planLaneBoard(session, ladder)));
    expect(session.currentStep).toBe(1);
    expect(session.consecutiveCleanBoards).toBe(0);
  });

  it("keeps the streak honest: a partially confused board neither promotes nor counts as clean", () => {
    const lane = testLane({ thresholds: { progression: 3, fallback: 2, review: 1 } });
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(start, ladder);

    const partial = recordBoardOutcome(start, ladder, lossOutcome(board, [board.plan.pairs[0]!.pairId]));
    expect(partial.currentStep).toBe(0);
    expect(partial.consecutiveCleanBoards).toBe(0);
  });

  it("never lets speed promote or demote", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(start, ladder);

    const quick = recordBoardOutcome(start, ladder, lossOutcome(board, [board.plan.pairs[0]!.pairId], 250));
    const slow = recordBoardOutcome(start, ladder, lossOutcome(board, [board.plan.pairs[0]!.pairId], 90_000));

    expect(quick.evidence[0]!.activeMs).toBe(250);
    expect(slow.evidence[0]!.activeMs).toBe(90_000);
    // Everything except the recorded latency is identical, including the board that will be dealt next.
    expect({ ...quick, evidence: [] }).toEqual({ ...slow, evidence: [] });
    expect(planLaneBoard(quick, ladder).randomSeed).toBe(planLaneBoard(slow, ladder).randomSeed);

    const quickClean = recordBoardOutcome(start, ladder, cleanOutcome(board));
    const slowClean = recordBoardOutcome(start, ladder, { ...cleanOutcome(board), activeMs: 120_000 });
    expect(quickClean.currentStep).toBe(slowClean.currentStep);
  });
});

describe("bounded session-local review", () => {
  it("schedules a fresh review one board later and serves it exactly once", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(start, ladder);
    const pairId = board.plan.pairs[0]!.pairId;

    expect(dueReviewItems(start)).toEqual([]);

    const afterConfusion = recordBoardOutcome(start, ladder, lossOutcome(board, [pairId]));
    expect(afterConfusion.review).toHaveLength(1);
    expect(afterConfusion.review[0]!.reason).toBe("confusion");
    expect(afterConfusion.review[0]!.raisedOnBoard).toBe(0);
    expect(afterConfusion.review[0]!.dueOnBoard).toBe(1);
    expect(dueReviewItems(afterConfusion)).toHaveLength(1);

    const reviewBoard = planLaneBoard(afterConfusion, ladder);
    expect(reviewBoard.reviewedValues).toHaveLength(1);
    expect(reviewBoard.reviewedValues[0]).toEqual(afterConfusion.review[0]!.canonical);

    // Served once: the following transition retires it.
    const afterReview = recordBoardOutcome(afterConfusion, ladder, cleanOutcome(reviewBoard));
    expect(afterReview.review).toEqual([]);
    expect(dueReviewItems(afterReview)).toEqual([]);
  });

  it("deals a fresh instance, never the memorized pair, and restores labels when scaffolding was off", () => {
    // `fallback: 3` keeps the session on the hardest rung after a single confusion, which is the only rung
    // whose label visibility can be lower than `always`.
    const lane = testLane({
      labelVisibility: "never",
      thresholds: { progression: 1, fallback: 3, review: 1 },
    });
    const ladder = laneLadder(lane);
    const climbed = advanceClean(createLaneSession(lane, FAST_SESSION_SEED), ladder, ladder.hardestStep);
    expect(ladder.rungs[climbed.currentStep]!.variant.labelVisibility).toBe("never");

    const inPlay = planLaneBoard(climbed, ladder);
    const pairId = inPlay.plan.pairs[1]!.pairId;
    const afterConfusion = recordBoardOutcome(climbed, ladder, lossOutcome(inPlay, [pairId]));

    const memorized = afterConfusion.review[0]!.memorized;
    const memorizedKey = [...memorized.cards]
      .map((card) => `${card.numerator}/${card.denominator}@${card.representation}`)
      .sort()
      .join("|");

    const reviewBoard = planLaneBoard(afterConfusion, ladder);
    expect(reviewBoard.reviewRestoredLabels).toBe(true);
    expect(reviewBoard.labelVisibility).toBe("always");
    expect(reviewBoard.reviewedValues).toHaveLength(1);

    // Re-encountering the reviewed *value* is measured, not promised: the engine still owns which pool
    // values are dealt. The promise is narrower and stronger — never this exact pair again.
    expect(reviewBoard.reviewedValuesDealt.length).toBeLessThanOrEqual(reviewBoard.reviewedValues.length);

    for (const pair of reviewBoard.plan.pairs) {
      const key = pair.cards
        .map((card) => `${card.form.numerator}/${card.form.denominator}@${card.representation}`)
        .sort()
        .join("|");
      expect(key).not.toBe(memorizedKey);
    }
    expect(memorizedKeyOfCanonical(reviewBoard, memorized.canonical)).not.toBe(memorizedKey);
  });

  it("refuses to deal at all when no fresh instance of the memorized pair exists", () => {
    // This lane has one dealable shape: every value has exactly two authored forms, only the symbolic family
    // is offered, and the board deals the whole pool. The pair the learner memorized is therefore the only
    // pair that can ever appear, and the session fails loudly rather than repeating it.
    const lane = laneWithCatalogue([2, 4, 8], {
      pairCount: 3,
      maxFormsPerFamily: 2,
      representationMix: [{ family: "symbolic" }],
      requireDistinctRepresentationPerPair: false,
      thresholds: { progression: 1, fallback: 1, review: 1 },
    });
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(start, ladder);
    const memorizedPair = board.plan.pairs.find(
      (pair) => pair.canonical.numerator === 1 && pair.canonical.denominator === 2,
    )!;

    const afterConfusion = recordBoardOutcome(start, ladder, lossOutcome(board, [memorizedPair.pairId]));
    expect(dueReviewItems(afterConfusion)).toHaveLength(1);
    expect(() => planLaneBoard(afterConfusion, ladder)).toThrow(LaneSessionError);
    expect(() => planLaneBoard(afterConfusion, ladder)).toThrow(/the memorized pair would have been shown again/);
  });

  it("keeps the review queue bounded, oldest first", () => {
    // A long review delay is what lets several items be pending at once; at a delay of 1 the queue is served
    // a board later and can never grow.
    const lane = testLane({ thresholds: { progression: 1, fallback: 1, review: 100 } });
    const ladder = laneLadder(lane);
    let session = createLaneSession(lane, FAST_SESSION_SEED);

    for (let index = 0; index < MAX_PENDING_REVIEW + 3; index += 1) {
      const board = planLaneBoard(session, ladder);
      // A distinct canonical per board, so nothing is deduplicated away.
      const distinct: BoardConfusion = {
        canonical: { numerator: index + 1, denominator: 100 },
        memorized: { canonical: { numerator: index + 1, denominator: 100 }, cards: [] },
      };
      session = recordBoardOutcome(session, ladder, { ...lossOutcome(board, []), confusions: [distinct] });
    }

    expect(session.review).toHaveLength(MAX_PENDING_REVIEW);
    // The oldest were dropped: what survives is the most recently raised, still in order.
    const raised = session.review.map((item) => item.raisedOnBoard);
    expect(raised).toEqual([...raised].sort((left, right) => left - right));
    expect(session.review.map((item) => item.canonical.numerator)).toEqual([4, 5, 6, 7]);
    expect(session.review.at(-1)!.canonical.numerator).toBe(MAX_PENDING_REVIEW + 3);
  });

  it("does not queue the same value twice while its review is still pending", () => {
    const lane = testLane({ thresholds: { progression: 1, fallback: 20, review: 100 } });
    const ladder = laneLadder(lane);
    let session = createLaneSession(lane, FAST_SESSION_SEED);

    const first = planLaneBoard(session, ladder);
    const pair = first.plan.pairs[0]!;
    const canonical = { numerator: pair.canonical.numerator, denominator: pair.canonical.denominator };

    session = recordBoardOutcome(session, ladder, lossOutcome(first, [pair.pairId]));
    expect(session.review).toHaveLength(1);

    // The same value is confused again on the next board while the first review is still pending.
    const second = planLaneBoard(session, ladder);
    session = recordBoardOutcome(session, ladder, {
      ...lossOutcome(second, []),
      confusions: [{ canonical, memorized: { canonical, cards: [] } }],
    });
    expect(session.review).toHaveLength(1);
  });

  it("keeps the evidence bounded too", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    let session = createLaneSession(lane, FAST_SESSION_SEED);
    for (let index = 0; index < lanes.MAX_EVIDENCE_BOARDS + 5; index += 1) {
      session = recordBoardOutcome(session, ladder, cleanOutcome(planLaneBoard(session, ladder)));
    }
    expect(session.evidence).toHaveLength(lanes.MAX_EVIDENCE_BOARDS);
    expect(session.completedBoards).toBe(lanes.MAX_EVIDENCE_BOARDS + 5);
  });
});

describe("no mastery, and nothing persisted", () => {
  it("exposes no mastery, proficiency, placement or score concept at all", () => {
    const suspicious = Object.keys(lanes).filter((name) =>
      /master|proficien|placement|level[-_]?up|score|percentile/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });

  it("reports a session as counts of what happened", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const board = planLaneBoard(start, ladder);
    const session = recordBoardOutcome(start, ladder, lossOutcome(board, [board.plan.pairs[0]!.pairId], 700));

    const summary = laneSessionSummary(session, ladder);
    expect(summary).toEqual({
      boardIndex: 1,
      completedBoards: 1,
      step: 0,
      totalSteps: ladder.rungs.length,
      pendingReviewCount: 1,
      dueReviewCount: 1,
      confusionCount: 1,
      activeMs: 700,
    });

    const suspicious = Object.keys(summary).filter((key) => /master|proficien|placement|score|level/i.test(key));
    expect(suspicious).toEqual([]);
    expect(session).not.toHaveProperty("storage");
    expect(session).not.toHaveProperty("persisted");
  });

  it("is deterministic under fixtures: identical inputs give identical sessions", () => {
    const lane = eagerLane();
    const ladder = laneLadder(lane);
    const run = () => {
      let session = createLaneSession(lane, FAST_SESSION_SEED);
      for (let index = 0; index < 4; index += 1) {
        const board = planLaneBoard(session, ladder);
        const pairId = board.plan.pairs[index % board.plan.pairs.length]!.pairId;
        session =
          index % 2 === 0
            ? recordBoardOutcome(session, ladder, lossOutcome(board, [pairId], 1_000 + index))
            : recordBoardOutcome(session, ladder, cleanOutcome(board));
      }
      return session;
    };

    expect(run()).toEqual(run());
  });

  it("never mutates the session it is given, even for a mixed-dimension lane", () => {
    const lane = laneWithMix([{ family: "bar" }, { family: "circle" }, { family: "symbolic" }], {
      labelVisibility: "on-reveal",
      thresholds: { progression: 1, fallback: 1, review: 1 },
    });
    const ladder = laneLadder(lane);
    const start = createLaneSession(lane, FAST_SESSION_SEED);
    const snapshot = JSON.stringify(start);

    advanceClean(start, ladder, 3);
    recordBoardOutcome(start, ladder, cleanOutcome(planLaneBoard(start, ladder)));

    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
