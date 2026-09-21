/**
 * Explanatory feedback (GAME-190).
 *
 * Every resolve should teach something about equal quantity, and the copy that does it has to be *exact*. That
 * requirement shapes this module in two ways:
 *
 * 1. **No mathematics happens here.** Which amount is larger comes from the engine's `compareRationals`, and the
 *    shared value of a matched pair is the engine's own canonical pair. This module chooses words; it never
 *    decides a quantity.
 * 2. **The copy is data, not prose.** Each class produces one string from a fixed template, so the copy register
 *    can list every learner-facing sentence the game can say, and a test can hold each one to a word bound.
 *
 * WHAT IT DELIBERATELY AVOIDS
 * No shame, no red X, no life lost, no streak, no timer pressure and no "try harder". A mismatch is a fact about
 * two amounts, and the copy states the fact and names the relationship. Nothing here can be lost by looking.
 *
 * The inspection window is a *learning* guarantee rather than a motion effect, which is why it is identical under
 * a reduced-motion preference: the two cards have to stay visible long enough to be compared, and that is
 * information, not decoration. GAME-188's motion plan collapses durations to zero; this plan deliberately does
 * not, and `tests/gameFeedback.test.ts` asserts the parity rather than assuming it.
 */

import { compareRationals, type FractionForm } from "../engine";
import {
  canonicalNotation,
  canonicalSpokenNotation,
  compactNotation,
  planRepresentationComparison,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../representations";
import type { LaneCardPlan } from "../lanes";
import type { MotionPreference } from "../design";

/** The learner-facing word ceiling from the feedback contract. */
export const MAX_EXPLANATION_WORDS = 12;

/** The mismatch classes the game authors copy for. */
export const MISMATCH_CLASSES = Object.freeze(["same-numerator", "same-denominator", "different-both"] as const);
export type MismatchClass = (typeof MISMATCH_CLASSES)[number];

/** Count the words a learner would read. Whitespace-separated tokens, punctuation attached is still one word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Which mismatch class a pair belongs to.
 *
 * The two near-miss classes are GAME-187's own distractor families — the signals a lane uses to make a distractor
 * plausible — so the explanation names the same relationship the content was built to test. Anything else is
 * `different-both`.
 */
export function classifyMismatch(left: FractionForm, right: FractionForm): MismatchClass {
  if (left.numerator === right.numerator) return "same-numerator";
  if (left.denominator === right.denominator) return "same-denominator";
  return "different-both";
}

/** One presented card, as the explanation needs it. */
export type FeedbackSide = {
  readonly form: FractionForm;
  readonly representation: RepresentationFamily;
  readonly whole: RepresentationWhole;
};

export type MismatchFeedback = {
  readonly kind: "mismatch";
  readonly mismatchClass: MismatchClass;
  readonly text: string;
  readonly words: number;
  /** The engine's own ordering of the two amounts: never `0`, because a mismatch means they differ. */
  readonly comparison: -1 | 1;
  readonly leftNotation: string;
  readonly rightNotation: string;
};

/**
 * The explanation for a mismatch.
 *
 * The class sets the lead and the engine's comparison sets the relation, so the sentence is exact for whatever
 * the learner actually picked. A pair that reached this function cannot be equal — the engine only retains a
 * pending comparison for a mismatch — so the comparison is narrowed to `-1 | 1` rather than handled as a third
 * case.
 */
export function mismatchFeedback(left: FeedbackSide, right: FeedbackSide): MismatchFeedback {
  const leftNotation = compactNotation(left.form);
  const rightNotation = compactNotation(right.form);
  const ordering = compareRationals(left.form.canonical, right.form.canonical);
  if (ordering === 0) {
    // Unreachable through the engine, which keeps a pending comparison only for a mismatch. Loud rather than
    // silently authoring copy that claims two equal amounts differ.
    throw new Error(
      `${leftNotation} and ${rightNotation} are the same amount, so there is no mismatch to explain`,
    );
  }

  const relation = ordering === 1 ? "is more than" : "is less than";
  const mismatchClass = classifyMismatch(left.form, right.form);

  const lead =
    mismatchClass === "same-numerator"
      ? "Same top number."
      : mismatchClass === "same-denominator"
        ? "Same bottom number."
        : "Different top and bottom numbers.";

  const text = `${lead} ${leftNotation} ${relation} ${rightNotation}.`;

  return Object.freeze({
    kind: "mismatch",
    mismatchClass,
    text,
    words: countWords(text),
    comparison: ordering,
    leftNotation,
    rightNotation,
  });
}

export type MatchFeedback = {
  readonly kind: "match";
  readonly text: string;
  readonly words: number;
  /** The engine's canonical value both cards share. */
  readonly sharedNotation: string;
  readonly spokenShared: string;
  readonly leftNotation: string;
  readonly rightNotation: string;
  /** The two representations the learner can see side by side. */
  readonly forms: readonly RepresentationFamily[];
  /**
   * True when the pair landed on two *different* families, which is what makes the demonstration show one
   * quantity two ways rather than twice.
   */
  readonly distinctForms: boolean;
  /** Problems the representation contract reported for drawing these two together. Empty means comparable. */
  readonly comparisonProblems: readonly string[];
};

/**
 * The explanation for a match: what the two cards have in common, and in how many forms it is being shown.
 *
 * The comparison plan is asked rather than assumed, so a pair that cannot honestly be drawn on one shared whole
 * is reported instead of being presented as a demonstration.
 */
export function matchFeedback(left: FeedbackSide, right: FeedbackSide): MatchFeedback {
  const leftNotation = compactNotation(left.form);
  const rightNotation = compactNotation(right.form);
  // The shared value is the engine's canonical pair, printed through the representation layer's own formatter
  // rather than assembled here: the copy and the pictures then agree by construction.
  const sharedNotation = canonicalNotation(left.form.canonical);
  const spokenShared = canonicalSpokenNotation(left.form.canonical);

  const comparison = planRepresentationComparison(
    { family: left.representation, fraction: left.form, whole: left.whole },
    { family: right.representation, fraction: right.form, whole: right.whole },
  );

  const identical = leftNotation === rightNotation;
  const forms = Object.freeze([left.representation, right.representation]);
  const distinctForms = left.representation !== right.representation;

  // One fixed template per shape, so the register is exhaustive rather than illustrative.
  const text = identical
    ? `Both cards show ${leftNotation}. Same amount.`
    : `${leftNotation} and ${rightNotation} are the same amount: ${spokenShared}.`;

  return Object.freeze({
    kind: "match",
    text,
    words: countWords(text),
    sharedNotation,
    spokenShared,
    leftNotation,
    rightNotation,
    forms,
    distinctForms,
    comparisonProblems: Object.freeze([...comparison.problems]),
  });
}

/** The feedback for one resolved pair, chosen by the engine's own outcome. */
export function feedbackFor(
  outcome: "match" | "mismatch",
  left: FeedbackSide,
  right: FeedbackSide,
): MatchFeedback | MismatchFeedback {
  return outcome === "match" ? matchFeedback(left, right) : mismatchFeedback(left, right);
}

/** Turn a planned card into the side an explanation takes. */
export function sideFromPlan(card: LaneCardPlan): FeedbackSide {
  return Object.freeze({ form: card.form, representation: card.representation, whole: card.whole });
}

/** The inspection-window contract: how long a mismatch stays on screen, and when it may be left. */
export const MIN_INSPECTION_MS = 1200;
export const MAX_INSPECTION_MS = 3000;

export type InspectionPlan = {
  /** The preference this plan was built for. Recorded so the parity between the two is inspectable. */
  readonly preference: MotionPreference;
  /** Both cards stay visible at least this long, so the relationship can be inspected. */
  readonly minimumMs: number;
  /** The window closes automatically by this point, so a learner can never be stuck. */
  readonly maximumMs: number;
  /** The earliest the learner may continue. */
  readonly dismissableAfterMs: number;
  /** When the board clears the pair on its own. */
  readonly autoDismissAfterMs: number;
};

/**
 * The inspection plan.
 *
 * **The durations are identical under both motion preferences**, deliberately, and the plan records which
 * preference asked for it so the difference is inspectable rather than implicit. A reduced-motion preference is a
 * statement about animation, and this window is not an animation: it is the time the two amounts need to be looked
 * at. Collapsing it would change what the learner is told rather than how it is drawn, so the parity is a
 * guarantee rather than an oversight — and it is asserted in the tests.
 */
export function inspectionPlanFor(preference: MotionPreference): InspectionPlan {
  return Object.freeze({
    preference,
    minimumMs: MIN_INSPECTION_MS,
    maximumMs: MAX_INSPECTION_MS,
    dismissableAfterMs: MIN_INSPECTION_MS,
    autoDismissAfterMs: MAX_INSPECTION_MS,
  });
}

/** Whether a plan satisfies the contract: a real inspection minimum, and a maximum no later than the ceiling. */
export function inspectionPlanProblems(plan: InspectionPlan): readonly string[] {
  const problems: string[] = [];
  if (plan.dismissableAfterMs < plan.minimumMs) {
    problems.push("the pair could be dismissed before the minimum inspection time");
  }
  if (plan.autoDismissAfterMs > plan.maximumMs) {
    problems.push("the pair could outstay the maximum inspection time");
  }
  if (plan.autoDismissAfterMs < plan.dismissableAfterMs) {
    problems.push("the window closes before the learner may dismiss it");
  }
  return Object.freeze(problems);
}
