import { describe, expect, it } from "vitest";

import { compareRationals, createFractionForm } from "../src/engine";
import {
  MAX_EXPLANATION_WORDS,
  MAX_INSPECTION_MS,
  announcementFor,
  boardCompleteCopy,
  MIN_INSPECTION_MS,
  MISMATCH_CLASSES,
  classifyMismatch,
  countWords,
  feedbackFor,
  inspectionPlanFor,
  inspectionPlanProblems,
  matchFeedback,
  mismatchFeedback,
  sideFromPlan,
  type FeedbackSide,
} from "../src/game";
import { planBoard, productionLaneFor } from "../src/game";
import { canonicalNotation } from "../src/representations";

/**
 * The feedback contract, tested as copy and as timing.
 *
 * The explanations are asserted against the engine's own values rather than against hand-written strings, so a
 * change to the classifier cannot quietly make the copy wrong: `compareRationals` says which amount is larger,
 * and the test requires the sentence to say the same thing.
 */

const SEED = 20_260_921;
const LANE = productionLaneFor("grade-4");
const PLAN = planBoard("production-board", LANE, SEED).plan;

/** Two cards from *different* pairs: different values, so the engine will call them a mismatch. */
function mismatchingPair(): readonly [FeedbackSide, FeedbackSide] {
  const first = PLAN.pairs[0]!.cards[0];
  const second = PLAN.pairs[1]!.cards[0];
  return [sideFromPlan(first), sideFromPlan(second)];
}

/** The two cards of one pair: the same value, authored and drawn differently. */
function matchingPair(): readonly [FeedbackSide, FeedbackSide] {
  const pair = PLAN.pairs[0]!;
  return [sideFromPlan(pair.cards[0]), sideFromPlan(pair.cards[1])];
}

function sideOf(numerator: number, denominator: number): FeedbackSide {
  return {
    form: createFractionForm(numerator, denominator),
    representation: "symbolic",
    whole: PLAN.cards[0]!.whole,
  };
}

describe("word counting", () => {
  it("counts whitespace-separated tokens and ignores padding", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("  one   two  ")).toBe(2);
    expect(countWords("1/2 is less than 3/4.")).toBe(5);
    expect(countWords("")).toBe(0);
  });
});

describe("the mismatch classifier", () => {
  it("names the two near-miss signals GAME-187 authors distractors from", () => {
    expect(classifyMismatch(createFractionForm(1, 2), createFractionForm(1, 3))).toBe("same-numerator");
    expect(classifyMismatch(createFractionForm(1, 4), createFractionForm(3, 4))).toBe("same-denominator");
    expect(classifyMismatch(createFractionForm(2, 3), createFractionForm(3, 4))).toBe("different-both");
  });

  it("prefers the numerator signal when both are shared", () => {
    // The same numerator *and* the same denominator would be the same authored form, which a lane's invariants
    // forbid in a pair; the classifier still has to answer deterministically for any pair it is handed.
    expect(classifyMismatch(createFractionForm(1, 2), createFractionForm(1, 2))).toBe("same-numerator");
  });

  it("only ever returns a declared class", () => {
    for (let numerator = 1; numerator <= 4; numerator += 1) {
      for (let denominator = 2; denominator <= 6; denominator += 1) {
        for (let otherNumerator = 1; otherNumerator <= 4; otherNumerator += 1) {
          const value = classifyMismatch(
            createFractionForm(numerator, denominator),
            createFractionForm(otherNumerator, 7),
          );
          expect(MISMATCH_CLASSES).toContain(value);
        }
      }
    }
  });
});

describe("mismatch copy is exact and bounded", () => {
  it("names the relationship the engine reports", () => {
    const left = sideOf(1, 2);
    const right = sideOf(1, 3);
    const feedback = mismatchFeedback(left, right);

    expect(compareRationals(left.form.canonical, right.form.canonical)).toBe(1);
    expect(feedback.comparison).toBe(1);
    expect(feedback.text).toContain("is more than");
    expect(feedback.text).toContain("1/2");
    expect(feedback.text).toContain("1/3");
    expect(feedback.mismatchClass).toBe("same-numerator");

    // The reverse pair says the opposite, which is the property that makes the copy exact rather than plausible.
    const reversed = mismatchFeedback(right, left);
    expect(reversed.comparison).toBe(-1);
    expect(reversed.text).toContain("is less than");
  });

  it("leads with the signal the pair actually shares", () => {
    expect(mismatchFeedback(sideOf(1, 2), sideOf(1, 3)).text.startsWith("Same top number.")).toBe(true);
    expect(mismatchFeedback(sideOf(1, 4), sideOf(3, 4)).text.startsWith("Same bottom number.")).toBe(true);
    expect(mismatchFeedback(sideOf(2, 3), sideOf(3, 4)).text.startsWith("Different top and bottom numbers.")).toBe(
      true,
    );
  });

  it("keeps every explanation inside the word ceiling, for every class and a wide range of values", () => {
    const values: readonly (readonly [number, number])[] = [
      [1, 2],
      [1, 3],
      [1, 4],
      [3, 4],
      [2, 3],
      [7, 8],
      [5, 6],
      [999, 1000],
      [100, 101],
      [12, 13],
    ];

    for (const [n1, d1] of values) {
      for (const [n2, d2] of values) {
        if (n1 === n2 && d1 === d2) continue;
        const left = sideOf(n1, d1);
        const right = sideOf(n2, d2);
        if (compareRationals(left.form.canonical, right.form.canonical) === 0) continue;

        const feedback = mismatchFeedback(left, right);
        expect(feedback.words, feedback.text).toBeLessThanOrEqual(MAX_EXPLANATION_WORDS);
        expect(countWords(feedback.text)).toBe(feedback.words);
        // No shame, no punishment, no engagement pressure — asserted on the words themselves.
        expect(feedback.text.toLowerCase()).not.toMatch(/wrong|try again|oops|again!|streak|lost|fail/);
      }
    }
  });

  it("refuses to explain a pair that is not a mismatch at all", () => {
    // Unreachable through the engine, which keeps a pending comparison only for a mismatch. The guard exists so a
    // future caller cannot author copy claiming two equal amounts differ.
    expect(() => mismatchFeedback(sideOf(1, 2), sideOf(2, 4))).toThrow(/same amount/);
  });

  it("explains a real mismatching pair from a real lane", () => {
    const [left, right] = mismatchingPair();
    const feedback = mismatchFeedback(left, right);
    expect(feedback.words).toBeLessThanOrEqual(MAX_EXPLANATION_WORDS);
    expect(feedback.text).toContain(feedback.leftNotation);
    expect(feedback.comparison).not.toBe(0);
  });
});

describe("match copy demonstrates the shared amount", () => {
  it("states the engine's canonical value, not the authored one", () => {
    const [left, right] = matchingPair();
    const feedback = matchFeedback(left, right);

    expect(feedback.sharedNotation).toBe(canonicalNotation(left.form.canonical));
    expect(feedback.text).toContain(feedback.sharedNotation.length > 0 ? feedback.sharedNotation : "");
    expect(feedback.words).toBeLessThanOrEqual(MAX_EXPLANATION_WORDS);

    // Both authored forms are named, so the learner sees what was written as well as what it means.
    expect(feedback.leftNotation).toBe(`${left.form.numerator}/${left.form.denominator}`);
    expect(feedback.rightNotation).toBe(`${right.form.numerator}/${right.form.denominator}`);
  });

  it("reports the two forms it is showing, and whether they differ", () => {
    const [left, right] = matchingPair();
    const feedback = matchFeedback(left, right);
    expect(feedback.forms).toEqual([left.representation, right.representation]);
    expect(feedback.distinctForms).toBe(left.representation !== right.representation);
  });

  it("asks the representation contract whether the pair can share one whole", () => {
    const [left, right] = matchingPair();
    const feedback = matchFeedback(left, right);
    // The pair came from one lane, so it declares one whole for both families and the comparison is allowed.
    expect(feedback.comparisonProblems).toEqual([]);
  });

  it("does not pretend two identical pictures show the amount two ways", () => {
    const [left] = matchingPair();
    const feedback = matchFeedback(left, left);
    expect(feedback.distinctForms).toBe(false);
    expect(feedback.text).toContain("Both cards show");
    expect(feedback.words).toBeLessThanOrEqual(MAX_EXPLANATION_WORDS);
  });

  it("is chosen by the engine's own outcome through the shared entry point", () => {
    const [matchingLeft, matchingRight] = matchingPair();
    expect(feedbackFor("match", matchingLeft, matchingRight).kind).toBe("match");

    const [left, right] = mismatchingPair();
    expect(feedbackFor("mismatch", left, right).kind).toBe("mismatch");
  });
});

describe("the inspection window", () => {
  it("holds for the contracted minimum and closes by the contracted maximum", () => {
    const plan = inspectionPlanFor("full");
    expect(plan.minimumMs).toBe(MIN_INSPECTION_MS);
    expect(plan.maximumMs).toBe(MAX_INSPECTION_MS);
    expect(plan.dismissableAfterMs).toBe(1200);
    expect(plan.autoDismissAfterMs).toBe(3000);
    expect(inspectionPlanProblems(plan)).toEqual([]);
  });

  it("is identical under a reduced-motion preference, because it is not motion", () => {
    // The window is the time the two amounts need to be looked at. Collapsing it would change what the learner is
    // told rather than how it is drawn, so reduced motion must not touch the durations — only the preference the
    // plan records differs, which is why the durations are compared rather than the whole value.
    const full = inspectionPlanFor("full");
    const reduced = inspectionPlanFor("reduced");

    expect(reduced.preference).toBe("reduced");
    expect(full.preference).toBe("full");
    expect(reduced.minimumMs).toBe(full.minimumMs);
    expect(reduced.maximumMs).toBe(full.maximumMs);
    expect(reduced.dismissableAfterMs).toBe(full.dismissableAfterMs);
    expect(reduced.autoDismissAfterMs).toBe(full.autoDismissAfterMs);
  });

  it("reports a plan that would let the learner dismiss too early, or stay too long", () => {
    expect(
      inspectionPlanProblems({ preference: "full", minimumMs: 1200, maximumMs: 3000, dismissableAfterMs: 0, autoDismissAfterMs: 3000 }),
    ).toContain("the pair could be dismissed before the minimum inspection time");
    expect(
      inspectionPlanProblems({ preference: "full", minimumMs: 1200, maximumMs: 3000, dismissableAfterMs: 1200, autoDismissAfterMs: 4000 }),
    ).toContain("the pair could outstay the maximum inspection time");
    expect(
      inspectionPlanProblems({ preference: "full", minimumMs: 1200, maximumMs: 3000, dismissableAfterMs: 2500, autoDismissAfterMs: 2000 }),
    ).toContain("the window closes before the learner may dismiss it");
  });

  it("gives the learner a real stretch of time to dismiss the pair themselves", () => {
    const plan = inspectionPlanFor("full");
    expect(plan.autoDismissAfterMs - plan.dismissableAfterMs).toBeGreaterThanOrEqual(1000);
  });
});

describe("the bounded live region", () => {
  it("says nothing when there is nothing to say", () => {
    expect(announcementFor({ outcome: null, feedback: null, remainingPairs: 4, complete: false })).toBe("");
  });

  it("announces the explanation for the pair the engine just resolved", () => {
    const [matchLeft, matchRight] = matchingPair();
    const matched = matchFeedback(matchLeft, matchRight);
    expect(
      announcementFor({ outcome: "match", feedback: matched, remainingPairs: 4, complete: false }),
    ).toBe(matched.text);

    const [left, right] = mismatchingPair();
    const mismatched = mismatchFeedback(left, right);
    expect(
      announcementFor({ outcome: "mismatch", feedback: mismatched, remainingPairs: 4, complete: false }),
    ).toBe(mismatched.text);
  });

  it("lets the completion of the board win over the pair that completed it", () => {
    const [matchLeft, matchRight] = matchingPair();
    const matched = matchFeedback(matchLeft, matchRight);

    // Both are true after the last pair, so exactly one message is chosen rather than two being queued.
    const announcement = announcementFor({ outcome: "match", feedback: matched, remainingPairs: 0, complete: true });
    expect(announcement).toBe(boardCompleteCopy(0));
    expect(announcement).not.toBe(matched.text);
  });

  it("is a pure function of the board's state, which is what makes it once-per-state", () => {
    const [left, right] = mismatchingPair();
    const mismatched = mismatchFeedback(left, right);
    const input = { outcome: "mismatch" as const, feedback: mismatched, remainingPairs: 3, complete: false };

    // A re-render produces the same string, and a live region whose text does not change is not announced again.
    expect(announcementFor(input)).toBe(announcementFor(input));
  });

  it("uses one completion string for both the announcement and the visible line", () => {
    expect(boardCompleteCopy(2)).toBe(
      "Board complete. 2 pairs left. Nothing starts on its own — choose what comes next.",
    );
    expect(boardCompleteCopy(0)).toContain("Board complete.");
  });

  it("never announces a card the learner has not turned over", () => {
    // The announcement is one of the two explanation templates, and both are built from the resolved pair only —
    // there is no other source of text it could draw on.
    const [left, right] = mismatchingPair();
    const mismatched = mismatchFeedback(left, right);
    const announcement = announcementFor({
      outcome: "mismatch",
      feedback: mismatched,
      remainingPairs: 3,
      complete: false,
    });
    expect(announcement).toContain(mismatched.leftNotation);
    expect(announcement).toContain(mismatched.rightNotation);
  });
});
