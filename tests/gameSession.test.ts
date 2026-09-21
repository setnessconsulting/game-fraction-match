import { describe, expect, it } from "vitest";

import { PRODUCTION_PAIR_COUNT, WARM_UP_PAIR_COUNT, createDeck, createGameState, isGameComplete } from "../src/engine";
import { planBoardLayout } from "../src/design";
import { curriculumLanes, laneEquivalenceFamilies } from "../src/lanes";
import type { GradeBand } from "../src/lanes";
import {
  BOARD_KINDS,
  SESSION_STAGES,
  applyIntent,
  boardCardsInEngineOrder,
  boardPairCount,
  canSelectCard,
  cardStateOfBoard,
  boardLaneFor,
  createSession,
  fittingPairCount,
  gradeOptions,
  instructionFor,
  lanesForGrade,
  pairsRemaining,
  planBoard,
  productionLaneFor,
  valueVisibilityFor,
  warmUpLaneFor,
  warmUpLaneProblems,
  type GameIntent,
  type GameSession,
} from "../src/game";

/**
 * The shell's decisions, tested without React.
 *
 * `session.ts` is where the game can change, so it is where the interesting claims live: which lane a grade
 * plays, that the warm-up is the same lane re-dealt, that an intent which does not apply changes nothing, and
 * that a card's value only reaches the DOM when the engine says it may.
 *
 * Completing a board in these tests groups cards by the engine's own `canonical` pair. That is deliberately not
 * a second equivalence check: `canonical` *is* the engine's answer, and reading it is how a presentation-side
 * test avoids re-implementing the thing it is testing.
 */

const SEED = 20_260_921;

/** A desktop viewport: large enough for the full production board at the qualified card box. */
const DESKTOP = Object.freeze({ width: 1280, height: 800 });

/** A 320x568 phone: the smallest base viewport, and the one where board size has to give way. */
const PHONE_SMALL = Object.freeze({ width: 320, height: 568 });

function sessionFor(gradeBand: "grade-3" | "grade-4" | "grade-5", seed = SEED): GameSession {
  return createdFor(gradeBand, DESKTOP, seed);
}

/** Choose a grade at a given viewport: that choice is what decides the board sizes that follow. */
function createdFor(
  gradeBand: "grade-3" | "grade-4" | "grade-5",
  viewport: { readonly width: number; readonly height: number },
  seed = SEED,
): GameSession {
  return applyIntent(createSession(), { type: "choose-grade", gradeBand, seed, viewport });
}

function started(gradeBand: "grade-3" | "grade-4" | "grade-5", seed = SEED): GameSession {
  return applyIntent(sessionFor(gradeBand, seed), { type: "begin-board" });
}

function canonicalKeyOf(session: GameSession, cardIndex: number): string {
  const card = session.state?.cards[cardIndex];
  if (card === undefined) throw new Error(`no card at ${cardIndex}`);
  return `${card.form.canonical.numerator}/${card.form.canonical.denominator}`;
}

/** Play a board to completion using only the engine's own answers, then acknowledge whatever it holds. */
function playBoardToCompletion(session: GameSession): GameSession {
  let current = session;
  for (let step = 0; step < 400; step += 1) {
    if (current.stage !== "board") return current;

    const state = current.state;
    if (state === null) return current;

    if (state.pendingComparison !== null) {
      current = applyIntent(current, { type: "acknowledge-comparison" });
      continue;
    }

    const firstIndex = state.cards.findIndex((_, index) => canSelectCard(current, index));
    if (firstIndex === -1) return current;

    const first = applyIntent(current, { type: "select-card", cardIndex: firstIndex });
    const key = canonicalKeyOf(first, firstIndex);
    const partnerIndex = first.state!.cards.findIndex(
      (_, index) => index !== firstIndex && canSelectCard(first, index) && canonicalKeyOf(first, index) === key,
    );
    if (partnerIndex === -1) throw new Error("no partner found for a dealt value");
    current = applyIntent(first, { type: "select-card", cardIndex: partnerIndex });
  }
  throw new Error("board did not complete within the step budget");
}

describe("grade and lane selection", () => {
  it("offers the curriculum's own grade bands, in its order", () => {
    expect([...gradeOptions()]).toEqual(["grade-3", "grade-4", "grade-5"]);
  });

  it("takes every lane from the reviewed curriculum map rather than the neutral fixtures", () => {
    const mapped = new Set(curriculumLanes().map((lane) => lane.laneId));
    for (const gradeBand of gradeOptions()) {
      for (const lane of lanesForGrade(gradeBand)) {
        expect(mapped.has(lane.laneId), lane.laneId).toBe(true);
        expect(lane.gradeBand).toBe(gradeBand);
      }
    }
    expect(curriculumLanes().length).toBeGreaterThan(0);
  });

  it("chooses the largest board a grade publishes, deterministically", () => {
    for (const gradeBand of gradeOptions()) {
      const lanes = lanesForGrade(gradeBand);
      const chosen = productionLaneFor(gradeBand);
      expect(chosen).toEqual(productionLaneFor(gradeBand));
      expect(chosen.pairCount).toBe(Math.max(...lanes.map((lane) => lane.pairCount)));
    }

    // Grades 4 and 5 publish the production shape; grade 3's reviewed catalogue is narrower, and the shell
    // does not inflate a grade's content to reach a number.
    expect(productionLaneFor("grade-4").pairCount).toBe(PRODUCTION_PAIR_COUNT);
    expect(productionLaneFor("grade-5").pairCount).toBe(PRODUCTION_PAIR_COUNT);
    expect(productionLaneFor("grade-3").pairCount).toBeLessThan(PRODUCTION_PAIR_COUNT);
  });
});

describe("the warm-up is the same lane, re-dealt smaller", () => {
  it("lowers the pair count and never raises it", () => {
    for (const lane of curriculumLanes()) {
      const warmUp = warmUpLaneFor(lane);
      expect(warmUp.pairCount).toBeLessThanOrEqual(WARM_UP_PAIR_COUNT);
      expect(warmUp.pairCount).toBeLessThanOrEqual(lane.pairCount);
      expect(warmUp.laneId).not.toBe(lane.laneId);
      expect(warmUp.gradeBand).toBe(lane.gradeBand);
    }
  });

  it("changes nothing but identity and size, so the warm-up shares the production board's path", () => {
    const lane = productionLaneFor("grade-4");
    const warmUp = warmUpLaneFor(lane);

    expect(warmUp.denominatorCatalogue).toBe(lane.denominatorCatalogue);
    expect(warmUp.representationMix).toBe(lane.representationMix);
    expect(warmUp.whole).toBe(lane.whole);
    expect(warmUp.cardBox).toEqual(lane.cardBox);
    expect(warmUp.title).toContain(lane.title);
  });

  it("is satisfiable for every published lane", () => {
    for (const lane of curriculumLanes()) {
      expect(warmUpLaneProblems(lane), lane.laneId).toEqual([]);
    }
  });

  it("deals a real board for every grade's warm-up", () => {
    for (const gradeBand of gradeOptions()) {
      const warmUp = warmUpLaneFor(productionLaneFor(gradeBand));
      const board = planBoard("warm-up", warmUp, SEED);
      expect(board.plan.cards).toHaveLength(warmUp.pairCount * 2);
      expect(board.facesVisible).toBe(true);
    }
  });
});

describe("dealing a board", () => {
  it("carries the lane's own scaffolding rather than inventing one", () => {
    const lane = productionLaneFor("grade-4");
    const production = planBoard("production-board", lane, SEED);
    const warmUp = planBoard("warm-up", lane, SEED);

    expect(production.facesVisible).toBe(false);
    expect(warmUp.facesVisible).toBe(true);
    expect(production.labelVisibility).toBe(lane.labelVisibility ?? "always");
    expect(warmUp.labelVisibility).toBe(production.labelVisibility);
  });

  it("is deterministic for a seed and different for a different one", () => {
    const lane = productionLaneFor("grade-4");
    const once = planBoard("production-board", lane, SEED);
    const twice = planBoard("production-board", lane, SEED);
    expect(once.plan.cards.map((card) => card.cardId)).toEqual(twice.plan.cards.map((card) => card.cardId));

    const other = planBoard("production-board", lane, SEED + 1);
    expect(other.plan.cards.map((card) => card.cardId)).not.toEqual(once.plan.cards.map((card) => card.cardId));
  });

  it("states the board kind in its instruction without turning into a rulebook", () => {
    const lane = productionLaneFor("grade-4");
    expect(instructionFor(null)).toContain("Choose a grade");
    expect(instructionFor(planBoard("warm-up", lane, SEED))).toContain("Every card is showing");
    expect(instructionFor(planBoard("production-board", lane, SEED))).not.toContain("Every card is showing");
    expect(instructionFor(planBoard("production-board", lane, SEED)).length).toBeLessThan(120);
  });
});

describe("the stage machine", () => {
  it("starts at setup with nothing dealt", () => {
    const session = createSession();
    expect(session.stage).toBe("grade-setup");
    expect(session.gradeBand).toBeNull();
    expect(session.board).toBeNull();
    expect(session.state).toBeNull();
    expect(session.completedBoards).toBe(0);
    expect(boardCardsInEngineOrder(session)).toEqual([]);
    expect(boardPairCount(session)).toBe(0);
    expect(pairsRemaining(session)).toBe(0);
    expect(cardStateOfBoard(session, 0)).toBeNull();
    expect(canSelectCard(session, 0)).toBe(false);
  });

  it("moves to an instruction for the warm-up when a grade is chosen", () => {
    const session = sessionFor("grade-4");
    expect(session.stage).toBe("instruction");
    expect(session.gradeBand).toBe("grade-4");
    expect(session.board?.kind).toBe("warm-up");
    expect(session.board?.plan.cards).toHaveLength(WARM_UP_PAIR_COUNT * 2);
    expect(session.state?.cards).toHaveLength(WARM_UP_PAIR_COUNT * 2);
  });

  it("only enters the board on an explicit begin", () => {
    const instruction = sessionFor("grade-4");
    expect(instruction.stage).toBe("instruction");
    expect(applyIntent(instruction, { type: "begin-board" }).stage).toBe("board");
  });

  it("never auto-starts the next board", () => {
    const completed = playBoardToCompletion(started("grade-4"));
    expect(completed.stage).toBe("board-complete");
    expect(completed.completedBoards).toBe(1);
    expect(isGameComplete(completed.state!)).toBe(true);

    // Sitting in board-complete changes nothing, however many times the shell re-renders or re-reads it.
    expect(applyIntent(completed, { type: "select-card", cardIndex: 0 }).stage).toBe("board-complete");
    expect(applyIntent(completed, { type: "acknowledge-comparison" })).toBe(completed);
  });

  it("toggles between the warm-up and the production board, each behind an instruction", () => {
    const completed = playBoardToCompletion(started("grade-4"));
    const next = applyIntent(completed, { type: "next-board", seed: SEED + 2, viewport: DESKTOP });
    expect(next.stage).toBe("instruction");
    expect(next.board?.kind).toBe("production-board");
    expect(next.board?.plan.cards).toHaveLength(PRODUCTION_PAIR_COUNT * 2);

    const back = applyIntent(
      playBoardToCompletion(applyIntent(next, { type: "begin-board" })),
      { type: "next-board", seed: SEED + 3, viewport: DESKTOP },
    );
    expect(back.board?.kind).toBe("warm-up");
  });

  it("re-deals the identical board on reset, because the seed is the board", () => {
    const playing = started("grade-4");
    const advanced = applyIntent(playing, { type: "select-card", cardIndex: 0 });
    const reset = applyIntent(advanced, { type: "reset-board" });

    expect(reset.stage).toBe("board");
    expect(reset.board?.seed).toBe(playing.board?.seed);
    expect(reset.state?.cards.map((card) => card.cardId)).toEqual(playing.state?.cards.map((card) => card.cardId));
    expect(reset.state?.revealedCardIndexes).toEqual([]);
    expect(reset.state?.moves).toBe(0);
  });

  it("returns to setup on end-session, from any stage", () => {
    const stages: readonly GameSession[] = [
      createSession(),
      sessionFor("grade-5"),
      started("grade-5"),
      playBoardToCompletion(started("grade-5")),
    ];
    for (const session of stages) {
      const ended = applyIntent(session, { type: "end-session" });
      expect(ended.stage, session.stage).toBe("grade-setup");
      expect(ended.board).toBeNull();
      expect(ended.state).toBeNull();
    }
  });

  it("ignores an intent that does not apply to the current stage", () => {
    const setup = createSession();
    expect(applyIntent(setup, { type: "begin-board" })).toBe(setup);
    expect(applyIntent(setup, { type: "select-card", cardIndex: 0 })).toBe(setup);
    expect(applyIntent(setup, { type: "acknowledge-comparison" })).toBe(setup);
    expect(applyIntent(setup, { type: "reset-board" })).toBe(setup);
    expect(applyIntent(setup, { type: "next-board", seed: 1, viewport: DESKTOP })).toBe(setup);

    const instruction = sessionFor("grade-4");
    expect(applyIntent(instruction, { type: "select-card", cardIndex: 0 })).toBe(instruction);
    expect(applyIntent(instruction, { type: "acknowledge-comparison" })).toBe(instruction);
  });

  it("never lets a third card in while a comparison is pending", () => {
    const playing = started("grade-4");
    const first = applyIntent(playing, { type: "select-card", cardIndex: 0 });
    const second = applyIntent(first, { type: "select-card", cardIndex: 1 });
    const pending = second.state!.pendingComparison;

    if (pending === null) return; // cards 0 and 1 happened to match; the mismatch path is covered below.

    const movesBefore = second.state!.moves;
    const third = applyIntent(second, { type: "select-card", cardIndex: 2 });
    expect(third.state!.revealedCardIndexes).toEqual(second.state!.revealedCardIndexes);
    expect(third.state!.moves).toBe(movesBefore);
  });

  it("resolves a mismatch exactly once, however many times it is acknowledged", () => {
    const playing = started("grade-4");
    let session = applyIntent(playing, { type: "select-card", cardIndex: 0 });

    const key = canonicalKeyOf(session, 0);
    const partner = session.state!.cards.findIndex(
      (_, index) => index > 0 && canonicalKeyOf(session, index) === key,
    );
    const different = session.state!.cards.findIndex(
      (_, index) => index > 0 && canonicalKeyOf(session, index) !== key,
    );
    expect(partner).toBeGreaterThan(0);
    expect(different).toBeGreaterThan(0);

    session = applyIntent(session, { type: "select-card", cardIndex: different });
    expect(session.state!.moves).toBe(1);
    expect(session.state!.pendingComparison).not.toBeNull();

    const acknowledged = applyIntent(session, { type: "acknowledge-comparison" });
    expect(acknowledged.state!.pendingComparison).toBeNull();
    expect(acknowledged.state!.moves).toBe(1);

    // A second acknowledgement has nothing to clear and must not invent one.
    expect(applyIntent(acknowledged, { type: "acknowledge-comparison" }).state!.moves).toBe(1);
  });

  it("completes every published board at every grade", () => {
    for (const gradeBand of gradeOptions()) {
      const completed = playBoardToCompletion(started(gradeBand));
      expect(completed.stage, gradeBand).toBe("board-complete");
      expect(pairsRemaining(completed), gradeBand).toBe(0);
      expect(completed.state?.matchedCardIndexes).toHaveLength(boardPairCount(completed) * 2);
    }
  });

  it("pins every stage of the machine as a declared value", () => {
    expect([...SESSION_STAGES]).toEqual([
      "grade-setup",
      "instruction",
      "board",
      "board-complete",
      "calm-recovery",
    ]);
    expect([...BOARD_KINDS]).toEqual(["warm-up", "production-board"]);
  });

  it("only ever changes state in response to a declared intent", () => {
    const intents: readonly GameIntent[] = [
      { type: "begin-board" },
      { type: "select-card", cardIndex: 0 },
      { type: "acknowledge-comparison" },
      { type: "reset-board" },
      { type: "next-board", seed: 7, viewport: DESKTOP },
      { type: "end-session" },
    ];
    const playing = started("grade-4");
    for (const intent of intents) {
      const next = applyIntent(playing, intent);
      expect(Object.isFrozen(next)).toBe(true);
      // The session in hand is never mutated: an intent returns a new value.
      expect(playing.state?.moves).toBe(0);
    }
  });

  it("refuses to publish a grade with no lanes rather than dealing an empty board", () => {
    // An invariant between two declarations — `GRADE_BANDS` and the curriculum map — rather than a case a
    // learner can reach. A band added to one without the other must fail loudly here.
    expect(() => productionLaneFor("grade-9" as GradeBand)).toThrow(/no curriculum lane is published/);
    expect(lanesForGrade("grade-9" as GradeBand)).toEqual([]);
  });

  it("stays total for a session whose stage and state disagree", () => {
    // A stage of "board" with nothing dealt cannot be produced by `applyIntent`, but a total function is one
    // that answers for every value of its input type rather than only the reachable ones.
    const malformed: GameSession = {
      ...createSession(),
      stage: "board",
    };
    expect(applyIntent(malformed, { type: "select-card", cardIndex: 0 })).toBe(malformed);
    expect(applyIntent(malformed, { type: "acknowledge-comparison" })).toBe(malformed);
    expect(applyIntent(malformed, { type: "reset-board" })).toBe(malformed);
    expect(canSelectCard(malformed, 0)).toBe(false);
    expect(pairsRemaining(malformed)).toBe(0);
  });

  it("answers null for a card index the board does not have", () => {
    const session = started("grade-4");
    expect(cardStateOfBoard(session, -1)).toBeNull();
    expect(cardStateOfBoard(session, session.state!.cards.length)).toBeNull();
    expect(cardStateOfBoard(session, 0)).toBe("hidden");
  });

  it("skips a plan card the state does not carry, instead of inventing a placement", () => {
    // The planner's invariants make this impossible for a real board. Built by hand anyway, because the join has
    // to answer for it: a card with no engine index has no position, so it is dropped rather than misplaced.
    const session = started("grade-4");
    const half = session.state!.cards.slice(0, 4);
    const truncated: GameSession = { ...session, state: { ...session.state!, cards: half } };

    const placed = boardCardsInEngineOrder(truncated);
    expect(placed).toHaveLength(half.length);
    expect(placed.map((entry) => entry.cardIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe("cards in the engine's own order", () => {
  it("places every card at the index the engine addresses it by", () => {
    for (const gradeBand of gradeOptions()) {
      const session = started(gradeBand);
      const placed = boardCardsInEngineOrder(session);

      expect(placed).toHaveLength(session.state!.cards.length);
      placed.forEach((entry) => {
        // The join is on cardId, so the placed card must be the deck card the engine addresses at that index.
        expect(session.state!.cards[entry.cardIndex]!.cardId).toBe(entry.card.cardId);
        expect(entry.card.form).toEqual(session.state!.cards[entry.cardIndex]!.form);
      });

      // Strictly ascending, and every engine index covered exactly once.
      expect(placed.map((entry) => entry.cardIndex)).toEqual([...placed.map((entry) => entry.cardIndex)].sort((a, b) => a - b));
      expect(new Set(placed.map((entry) => entry.cardIndex)).size).toBe(placed.length);
    }
  });

  it("joins the plan to the engine on cardId rather than trusting the plan's own order", () => {
    // The lane plan groups its cards by pair, so the plan's order is not the deck's. Joining on cardId is what
    // makes that difference harmless; the assertion is therefore about coverage of the deck, not about order.
    const session = started("grade-4");
    const planOrder = session.board!.plan.cards.map((card) => card.cardId);
    const engineOrder = boardCardsInEngineOrder(session).map((entry) => entry.card.cardId);
    expect(new Set(planOrder)).toEqual(new Set(engineOrder));
    expect(planOrder).toHaveLength(engineOrder.length);
  });
});

describe("what a card is allowed to show", () => {
  it("hides both value and label on a production board until the engine reveals the card", () => {
    // The warm-up shows every face by design, so the hidden-value discipline is asserted on the board where
    // hiding is the point: `next-board` deals the production board.
    const session = started("grade-4");
    const production = applyIntent(
      applyIntent(session, { type: "next-board", seed: SEED, viewport: DESKTOP }),
      { type: "begin-board" },
    );
    expect(production.board!.kind).toBe("production-board");
    expect(production.board!.facesVisible).toBe(false);

    expect(valueVisibilityFor(production, "hidden")).toEqual({ valueVisible: false, labelVisible: false });
    expect(valueVisibilityFor(production, "revealed")).toEqual({ valueVisible: true, labelVisible: true });
    expect(valueVisibilityFor(production, "matched")).toEqual({ valueVisible: true, labelVisible: true });
  });

  it("shows every value on the warm-up while still withholding an on-reveal label", () => {
    const lane = { ...productionLaneFor("grade-4"), labelVisibility: "on-reveal" as const };
    const board = planBoard("warm-up", lane, SEED);
    const session = applyIntent(createSession(), { type: "choose-grade", gradeBand: "grade-4", seed: SEED, viewport: DESKTOP });
    const withLane: GameSession = { ...session, board };

    expect(valueVisibilityFor(withLane, "hidden").valueVisible).toBe(true);
    expect(valueVisibilityFor(withLane, "hidden").labelVisible).toBe(false);
    expect(valueVisibilityFor(withLane, "revealed").labelVisible).toBe(true);
  });

  it("never states a label on a lane that asked for none", () => {
    const lane = { ...productionLaneFor("grade-4"), labelVisibility: "never" as const };
    const board = planBoard("warm-up", lane, SEED);
    const session = applyIntent(createSession(), { type: "choose-grade", gradeBand: "grade-4", seed: SEED, viewport: DESKTOP });
    const withLane: GameSession = { ...session, board };

    expect(valueVisibilityFor(withLane, "hidden").labelVisible).toBe(false);
    expect(valueVisibilityFor(withLane, "matched").labelVisible).toBe(false);
    expect(valueVisibilityFor(withLane, "matched").valueVisible).toBe(true);
  });
});

describe("the engine stays the authority", () => {
  it("asks the engine whether a card is playable rather than deciding", () => {
    const session = started("grade-4");
    expect(canSelectCard(session, 0)).toBe(true);

    const revealed = applyIntent(session, { type: "select-card", cardIndex: 0 });
    expect(cardStateOfBoard(revealed, 0)).toBe("revealed");
    // Re-selecting the same card is the engine's refusal, not the shell's.
    expect(applyIntent(revealed, { type: "select-card", cardIndex: 0 }).state!.revealedCardIndexes).toEqual([0]);
  });

  it("builds the same deck the lane planner dealt", () => {
    const lane = productionLaneFor("grade-4");
    const board = planBoard("production-board", lane, SEED);
    const state = createGameState(board.plan.deck);
    expect(state.cards.map((card) => card.cardId)).toEqual(board.plan.deck.cards.map((card) => card.cardId));
    expect(state.seed).toBe(SEED);
  });

  it("deals the engine's own deck rather than a bespoke one", () => {
    // The planner delegates the deal, so the shell's board must be exactly what the engine produces for the
    // lane's own families and seed. Card ids are positional, which is why this compares them rather than values.
    const lane = productionLaneFor("grade-4");
    const board = planBoard("production-board", lane, SEED);
    const expected = createDeck({ pairCount: lane.pairCount, seed: SEED, families: laneEquivalenceFamilies(lane) });
    expect(board.plan.deck.cards.map((card) => card.cardId)).toEqual(expected.cards.map((card) => card.cardId));
  });
});

describe("the board size gives way before the card does", () => {
  function layoutAt(session: GameSession, viewport: { readonly width: number; readonly height: number }) {
    const board = session.board!;
    return planBoardLayout({
      viewport,
      cardCount: board.plan.cards.length,
      fixedCardCssPx: board.lane.cardBox.width,
    });
  }

  it("deals the lane's own size where there is room for it", () => {
    for (const gradeBand of gradeOptions()) {
      const lane = productionLaneFor(gradeBand);
      expect(fittingPairCount(lane, DESKTOP), gradeBand).toBe(lane.pairCount);
    }
  });

  it("deals fewer pairs on a phone rather than a smaller card", () => {
    const lane = productionLaneFor("grade-4");
    const pairs = fittingPairCount(lane, PHONE_SMALL);

    expect(pairs).toBeLessThan(lane.pairCount);
    expect(pairs).toBeGreaterThanOrEqual(2);

    // The resolution this story chose: the card keeps its qualified box and the board gives way.
    const resized = boardLaneFor(lane, "production-board", PHONE_SMALL);
    expect(resized.pairCount).toBe(pairs);
    expect(resized.cardBox).toEqual(lane.cardBox);
    expect(resized.denominatorCatalogue).toBe(lane.denominatorCatalogue);
  });

  it("leaves the warm-up alone, because it already fits every base viewport", () => {
    for (const gradeBand of gradeOptions()) {
      const lane = productionLaneFor(gradeBand);
      expect(boardLaneFor(lane, "warm-up", PHONE_SMALL)).toEqual(warmUpLaneFor(lane));
      expect(boardLaneFor(lane, "warm-up", DESKTOP)).toEqual(warmUpLaneFor(lane));
    }
  });

  it("fits the dealt production board at the smallest base viewport, for every grade", () => {
    for (const gradeBand of gradeOptions()) {
      const session = applyIntent(createdFor(gradeBand, PHONE_SMALL), {
        type: "next-board",
        seed: SEED,
        viewport: PHONE_SMALL,
      });
      const layout = layoutAt(session, PHONE_SMALL);

      expect(session.board!.kind, gradeBand).toBe("production-board");
      expect(layout.problems, gradeBand).toEqual([]);
      expect(layout.fitsWithoutScrolling, gradeBand + " must show the whole board at 320x568").toBe(true);
      expect(layout.cardCssPx, gradeBand).toBe(session.board!.lane.cardBox.width);
    }
  });

  it("deals a smaller production board on a phone than on a desktop", () => {
    const phone = applyIntent(createdFor("grade-4", PHONE_SMALL), {
      type: "next-board",
      seed: SEED,
      viewport: PHONE_SMALL,
    });
    const desktop = applyIntent(createdFor("grade-4", DESKTOP), {
      type: "next-board",
      seed: SEED,
      viewport: DESKTOP,
    });

    expect(phone.board!.plan.cards.length).toBeLessThan(desktop.board!.plan.cards.length);
    expect(desktop.board!.plan.cards).toHaveLength(PRODUCTION_PAIR_COUNT * 2);
    expect(desktop.board!.lane.cardBox).toEqual(phone.board!.lane.cardBox);
  });
});
