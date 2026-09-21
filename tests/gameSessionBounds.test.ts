import { describe, expect, it } from "vitest";

import {
  HARD_ACTIVE_MS,
  HARD_PRODUCTION_BOARDS,
  IDLE_OFFER_AFTER_MS,
  SOFT_ACTIVE_MS,
  SOFT_PRODUCTION_BOARDS,
  activeTimeAfterInput,
  activeTimeAfterPhase,
  activeTimeAfterTick,
  activeTimeAfterVisibility,
  boundsFor,
  coachingLineFor,
  createActiveTimeAccount,
  dominantMismatchClass,
  emptySessionFacts,
  idleMs,
  idleOfferDue,
  summaryFor,
} from "../src/game";
import { applyIntent, canSelectCard, createSession } from "../src/game/session";
import type { GameSession } from "../src/game";
import type { SessionEvidenceFacts } from "../src/game";

/**
 * The session arc, tested as arithmetic.
 *
 * The clock is a *parameter*, so every claim in GAME-191 about time is checked at the exact millisecond rather
 * than by waiting: "three minutes of active play" is `179_999` versus `180_000`, and a thirty-minute tab switch is
 * a call to `activeTimeAfterVisibility` with far-future timestamps.
 */

/** A grade-4 session at the instruction stage: the state every board test starts from. */
const DESKTOP = Object.freeze({ width: 1280, height: 800 });

function sessionForTests(gradeBand: "grade-3" | "grade-4" | "grade-5", seed = 20_260_921): GameSession {
  return applyIntent(createSession(), { type: "choose-grade", gradeBand, seed, viewport: DESKTOP });
}

/** A board phase that is visible and has just received input, which is the only state that accrues time. */
function playing(nowMs = 0) {
  return activeTimeAfterPhase(
    activeTimeAfterInput(createActiveTimeAccount(nowMs), nowMs),
    true,
    nowMs,
  );
}

describe("active play time", () => {
  it("counts only while the document is visible and a board is in play", () => {
    // Setup time is not play time: with no board in play the account does not move.
    const setupOnly = activeTimeAfterPhase(createActiveTimeAccount(0), false, 0);
    expect(activeTimeAfterTick(setupOnly, 10_000).activeMs).toBe(0);

    const hidden = activeTimeAfterVisibility(playing(0), false, 0);
    expect(activeTimeAfterTick(hidden, 10_000).activeMs).toBe(0);

    const visible = playing(0);
    expect(activeTimeAfterTick(visible, 10_000).activeMs).toBe(10_000);
  });

  it("does not credit the time a tab spends hidden, however long it is", () => {
    // The learner is mid-board and switches away for half an hour, then comes back.
    const before = activeTimeAfterTick(playing(0), 1_000);
    const hidden = activeTimeAfterVisibility(before, false, 1_000);
    const returned = activeTimeAfterVisibility(hidden, true, 30 * 60 * 1000);

    // Every millisecond of the interval before the switch counts; none of the hidden time does.
    expect(returned.activeMs).toBe(1_000);

    // And coming back is not input, so the account is still idle until the learner acts.
    expect(idleMs(returned, 30 * 60 * 1000)).toBeGreaterThanOrEqual(IDLE_OFFER_AFTER_MS);
  });

  it("stops accruing once the learner has been idle for thirty seconds", () => {
    // Visible, board in play, and no input for two minutes: only the first thirty seconds are play time.
    const account = playing(0);
    const after = activeTimeAfterTick(account, 120_000);
    expect(after.activeMs).toBe(IDLE_OFFER_AFTER_MS);
  });

  it("credits the interval up to a gate change and no further", () => {
    const account = playing(0);
    const leftBoard = activeTimeAfterPhase(account, false, 5_000);
    expect(leftBoard.activeMs).toBe(5_000);

    // The five minutes that followed are setup time, not play time.
    expect(activeTimeAfterTick(leftBoard, 5 * 60 * 1000).activeMs).toBe(5_000);
  });

  it("never credits an interval twice", () => {
    const account = playing(0);
    const once = activeTimeAfterTick(account, 1_000);
    const twice = activeTimeAfterTick(once, 2_000);
    expect(once.activeMs).toBe(1_000);
    expect(twice.activeMs).toBe(2_000);

    // Re-ticking the same instant, or going backwards, must not add anything.
    expect(activeTimeAfterTick(twice, 2_000).activeMs).toBe(2_000);
    expect(activeTimeAfterTick(twice, 500).activeMs).toBe(2_000);
  });

  it("resets the idle streak on input", () => {
    let account = playing(0);
    account = activeTimeAfterTick(account, 40_000);
    expect(account.activeMs).toBe(IDLE_OFFER_AFTER_MS);

    const touched = activeTimeAfterInput(account, 40_000);
    expect(idleMs(touched, 40_000)).toBe(0);
    expect(activeTimeAfterTick(touched, 50_000).activeMs).toBe(IDLE_OFFER_AFTER_MS + 10_000);
  });
});

describe("the idle offer", () => {
  it("is due at exactly thirty seconds and not before", () => {
    const account = playing(0);
    expect(idleOfferDue(account, IDLE_OFFER_AFTER_MS - 1)).toBe(false);
    expect(idleOfferDue(account, IDLE_OFFER_AFTER_MS)).toBe(true);
  });

  it("is not offered to somebody who is not there", () => {
    const hidden = activeTimeAfterVisibility(playing(0), false, 0);
    expect(idleOfferDue(hidden, 10 * 60 * 1000)).toBe(false);
  });

  it("never ends anything by itself", () => {
    // `idleOfferDue` is a question. There is no corresponding "terminate", which is what makes the behaviour
    // non-destructive rather than merely calm.
    const account = playing(0);
    expect(idleOfferDue(account, 60 * 60 * 1000)).toBe(true);
    expect(account.activeMs).toBe(0);
  });
});

describe("the soft and hard bounds, at their exact edges", () => {
  it("prompts at two boards or three minutes, whichever comes first", () => {
    expect(boundsFor({ productionBoards: SOFT_PRODUCTION_BOARDS - 1, activeMs: SOFT_ACTIVE_MS - 1 }).soft).toBe(false);
    expect(boundsFor({ productionBoards: SOFT_PRODUCTION_BOARDS, activeMs: 0 }).soft).toBe(true);
    expect(boundsFor({ productionBoards: 0, activeMs: SOFT_ACTIVE_MS - 1 }).soft).toBe(false);
    expect(boundsFor({ productionBoards: 0, activeMs: SOFT_ACTIVE_MS }).soft).toBe(true);
  });

  it("caps at four boards or six minutes, whichever comes first", () => {
    expect(boundsFor({ productionBoards: HARD_PRODUCTION_BOARDS - 1, activeMs: HARD_ACTIVE_MS - 1 }).hard).toBe(false);
    expect(boundsFor({ productionBoards: HARD_PRODUCTION_BOARDS, activeMs: 0 }).hard).toBe(true);
    expect(boundsFor({ productionBoards: 0, activeMs: HARD_ACTIVE_MS - 1 }).hard).toBe(false);
    expect(boundsFor({ productionBoards: 0, activeMs: HARD_ACTIVE_MS }).hard).toBe(true);
  });

  it("reports which bound was reached rather than a bare flag", () => {
    const byBoards = boundsFor({ productionBoards: 4, activeMs: 0 });
    expect(byBoards.hardReasons).toEqual(["4 boards finished"]);

    const byTime = boundsFor({ productionBoards: 0, activeMs: HARD_ACTIVE_MS });
    expect(byTime.hardReasons).toEqual(["360 seconds of play"]);

    // Both, when both are true: the reasons are a list rather than a single cause.
    expect(boundsFor({ productionBoards: 4, activeMs: HARD_ACTIVE_MS }).softReasons).toHaveLength(2);
  });

  it("implies the soft bound whenever the hard bound is reached", () => {
    for (const evidence of [
      { productionBoards: 4, activeMs: 0 },
      { productionBoards: 0, activeMs: HARD_ACTIVE_MS },
      { productionBoards: 9, activeMs: 10 * 60 * 1000 },
    ]) {
      const bounds = boundsFor(evidence);
      expect(bounds.hard, JSON.stringify(evidence)).toBe(true);
      expect(bounds.soft, JSON.stringify(evidence)).toBe(true);
    }
  });
});

describe("the factual summary", () => {
  const facts = (overrides: Partial<SessionEvidenceFacts> = {}): SessionEvidenceFacts => ({
    ...emptySessionFacts(),
    ...overrides,
  });

  it("reports the session's own facts, and nothing else", () => {
    const summary = summaryFor(
      facts({
        productionBoards: 2,
        pairsMatched: 3,
        moves: 4,
        mismatches: 1,
        familiesPracticed: ["bar", "circle"],
      }),
    );

    expect(summary.lines).toEqual([
      "Boards finished: 2",
      "Pairs matched: 3",
      "Moves: 4",
      "Forms practised: bar, circle",
      "Pairs that did not match: 1",
    ]);
    expect(summary.lines.join(" ")).toMatch(/bar, circle/);
  });

  it("says a form list is empty rather than pretending otherwise", () => {
    expect(summaryFor(emptySessionFacts()).lines).toContain("Forms practised: none yet");
  });

  it("makes one deterministic line out of the observations", () => {
    expect(coachingLineFor(emptySessionFacts())).toBe("No pairs finished yet this session.");
    expect(coachingLineFor(facts({ moves: 3, pairsMatched: 3, mismatches: 0 }))).toBe(
      "Every pair you tried this session matched.",
    );
    expect(
      coachingLineFor(facts({ moves: 4, mismatches: 2, mismatchesByClass: { "same-numerator": 2, "same-denominator": 0, "different-both": 0 } })),
    ).toBe("Most pairs that did not match shared a top number.");
    expect(
      coachingLineFor(facts({ moves: 4, mismatches: 2, mismatchesByClass: { "same-numerator": 0, "same-denominator": 2, "different-both": 0 } })),
    ).toBe("Most pairs that did not match shared a bottom number.");
    expect(
      coachingLineFor(facts({ moves: 4, mismatches: 2, mismatchesByClass: { "same-numerator": 0, "same-denominator": 0, "different-both": 2 } })),
    ).toBe("Most pairs that did not match shared neither number.");
  });

  it("breaks a tie by the declared class order, so the line is stable", () => {
    const counts = { "same-numerator": 1, "same-denominator": 1, "different-both": 1 };
    expect(dominantMismatchClass(counts)).toBe("same-numerator");
    expect(coachingLineFor(facts({ moves: 3, mismatches: 3, mismatchesByClass: counts }))).toBe(
      "Most pairs that did not match shared a top number.",
    );
  });

  it("has nothing to say about a class that was never observed", () => {
    expect(dominantMismatchClass(emptySessionFacts().mismatchesByClass)).toBeNull();
    expect(
      coachingLineFor(facts({ moves: 1, mismatches: 1, mismatchesByClass: { "same-numerator": 0, "same-denominator": 0, "different-both": 0 } })),
    ).toBe("Some pairs did not match.");
  });

  it("never claims mastery, progress or a comparison", () => {
    const shapes = [
      emptySessionFacts(),
      facts({ moves: 3, pairsMatched: 3 }),
      facts({ moves: 5, mismatches: 5, mismatchesByClass: { "same-numerator": 5, "same-denominator": 0, "different-both": 0 } }),
      facts({ productionBoards: 4, pairsMatched: 12, moves: 14, familiesPracticed: ["symbolic"] }),
    ];
    const banned = /\b(master|mastered|level|improve|improvement|better|best|score|streak|progress|grade up|learned)\b/i;

    for (const shape of shapes) {
      const summary = summaryFor(shape);
      const text = [...summary.lines, summary.coachingLine].join(" ");
      expect(text, text).not.toMatch(banned);
      // No percentages either: a percentage of a session is a claim about performance.
      expect(text).not.toMatch(/\d+\s*%/);
    }
  });
});

describe("the session tally is folded from the engine's own transitions", () => {
  /** Play the current board to completion using only the engine's answers, then acknowledge what it holds. */
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

      const first = state.cards.findIndex((_, index) => canSelectCard(current, index));
      if (first === -1) return current;
      const opened = applyIntent(current, { type: "select-card", cardIndex: first });
      const key = `${opened.state!.cards[first]!.form.canonical.numerator}/${opened.state!.cards[first]!.form.canonical.denominator}`;
      const partner = opened.state!.cards.findIndex(
        (_, index) =>
          index !== first &&
          canSelectCard(opened, index) &&
          `${opened.state!.cards[index]!.form.canonical.numerator}/${opened.state!.cards[index]!.form.canonical.denominator}` === key,
      );
      current = applyIntent(opened, { type: "select-card", cardIndex: partner });
    }
    throw new Error("board did not complete within the step budget");
  }

  it("starts empty and counts nothing before anything happens", () => {
    expect(createSession().tally).toEqual(emptySessionFacts());
  });

  it("counts a resolved comparison once, and knows which kind it was", () => {
    const session = applyIntent(sessionForTests("grade-4"), { type: "begin-board" });
    const opened = applyIntent(session, { type: "select-card", cardIndex: 0 });
    const key = `${opened.state!.cards[0]!.form.canonical.numerator}/${opened.state!.cards[0]!.form.canonical.denominator}`;
    const partner = opened.state!.cards.findIndex(
      (_, index) =>
        index !== 0 &&
        `${opened.state!.cards[index]!.form.canonical.numerator}/${opened.state!.cards[index]!.form.canonical.denominator}` === key,
    );

    const matched = applyIntent(opened, { type: "select-card", cardIndex: partner });
    expect(matched.tally.moves).toBe(1);
    expect(matched.tally.pairsMatched).toBe(1);
    expect(matched.tally.mismatches).toBe(0);

    // The families of the two cards that were actually compared, in the representation layer's own order.
    expect(matched.tally.familiesPracticed.length).toBeGreaterThan(0);
  });

  it("counts a mismatch, including which signal the pair shared", () => {
    const session = applyIntent(sessionForTests("grade-4"), { type: "begin-board" });
    const opened = applyIntent(session, { type: "select-card", cardIndex: 0 });
    const key = `${opened.state!.cards[0]!.form.canonical.numerator}/${opened.state!.cards[0]!.form.canonical.denominator}`;
    const different = opened.state!.cards.findIndex(
      (_, index) =>
        index !== 0 &&
        `${opened.state!.cards[index]!.form.canonical.numerator}/${opened.state!.cards[index]!.form.canonical.denominator}` !== key,
    );

    const mismatched = applyIntent(opened, { type: "select-card", cardIndex: different });
    expect(mismatched.tally.moves).toBe(1);
    expect(mismatched.tally.mismatches).toBe(1);
    expect(mismatched.tally.pairsMatched).toBe(0);

    const counts = mismatched.tally.mismatchesByClass;
    expect(counts["same-numerator"] + counts["same-denominator"] + counts["different-both"]).toBe(1);
  });

  it("excludes the warm-up from the session bounds", () => {
    const warmUpDone = playBoardToCompletion(applyIntent(sessionForTests("grade-4"), { type: "begin-board" }));
    expect(warmUpDone.stage).toBe("board-complete");
    expect(warmUpDone.tally.productionBoards).toBe(0);
    expect(warmUpDone.completedBoards).toBe(1);
  });

  it("counts a finished production board toward the bounds", () => {
    const warmUpDone = playBoardToCompletion(applyIntent(sessionForTests("grade-4"), { type: "begin-board" }));
    const production = applyIntent(warmUpDone, { type: "next-board", seed: 7, viewport: { width: 1280, height: 800 } });
    const done = playBoardToCompletion(applyIntent(production, { type: "begin-board" }));

    expect(done.tally.productionBoards).toBe(1);
    expect(boundsFor({ productionBoards: done.tally.productionBoards, activeMs: 0 }).soft).toBe(false);
  });

  it("carries the tally into the summary and starts clean again", () => {
    const played = applyIntent(sessionForTests("grade-4"), { type: "begin-board" });
    const opened = applyIntent(played, { type: "select-card", cardIndex: 0 });
    const summarised = applyIntent(opened, { type: "end-session" });

    expect(summarised.stage).toBe("session-summary");
    expect(summarised.tally.moves).toBe(0);
    expect(summarised.board).toBeNull();

    const again = applyIntent(summarised, { type: "play-again", seed: 11 });
    expect(again.stage).toBe("instruction");
    expect(again.gradeBand).toBe("grade-4");
    expect(again.tally).toEqual(emptySessionFacts());
    expect(again.board?.kind).toBe("warm-up");

    expect(applyIntent(summarised, { type: "change-grade" }).stage).toBe("grade-setup");
  });

  it("has nothing to replay or change before a session exists", () => {
    const setup = createSession();
    expect(applyIntent(setup, { type: "play-again", seed: 3 })).toEqual(setup);
    expect(applyIntent(setup, { type: "change-grade" })).toEqual(setup);
  });

  it("cannot be moved forward by any intent once it has been summarised", () => {
    const summarised = applyIntent(applyIntent(sessionForTests("grade-4"), { type: "begin-board" }), {
      type: "end-session",
    });

    // The summary has exactly two actions, and nothing else can restart play from behind them.
    for (const intent of [
      { type: "begin-board" } as const,
      { type: "select-card", cardIndex: 0 } as const,
      { type: "acknowledge-comparison" } as const,
      { type: "reset-board" } as const,
      { type: "next-board", seed: 2, viewport: DESKTOP } as const,
    ]) {
      expect(applyIntent(summarised, intent).stage, intent.type).toBe("session-summary");
    }
  });
});
