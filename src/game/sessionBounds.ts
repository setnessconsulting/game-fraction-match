/**
 * Session bounds and the factual summary (GAME-191).
 *
 * The session arc is bounded, healthy and deterministic, and none of those words are decoration:
 *
 * - **bounded**: a soft prompt after two production boards or three minutes of *active* play, and a hard cap at
 *   four boards or six minutes;
 * - **healthy**: nothing here pressures anybody. There is no streak, no daily record, no comparison to another
 *   learner, and an idle learner is *offered* a calm way out rather than being cut off;
 * - **deterministic**: every number on this page comes from a fact the game observed, and the coaching line is a
 *   function of those facts rather than a judgement about the learner.
 *
 * THE CLOCK IS INJECTED, AND THE ENGINE NEVER SEES IT
 * Nothing in this module reads a clock. The shell samples one and hands timestamps in as data — the same
 * arrangement the seed uses — so "three minutes of active play" is testable at the exact millisecond rather than
 * by waiting. The math engine is not involved at all: how long somebody played is not a mathematical fact.
 *
 * WHAT "ACTIVE" MEANS
 * `activeMs` advances only while all three hold: the document is visible, the game is in an active board phase,
 * and the learner has not been idle for 30 seconds. The idle rule is enforced *within* the interval rather than at
 * its end, so a thirty-minute tab switch cannot retroactively credit the first thirty seconds of nothing.
 */

import type { RepresentationFamily } from "../representations";
import type { MismatchClass } from "./feedback";

/** A soft prompt may be shown once this many production boards are finished. */
export const SOFT_PRODUCTION_BOARDS = 2;
/** …or once this much active play has happened, whichever comes first. */
export const SOFT_ACTIVE_MS = 3 * 60 * 1000;
/** The hard cap, in production boards. */
export const HARD_PRODUCTION_BOARDS = 4;
/** …or in active play, whichever comes first. */
export const HARD_ACTIVE_MS = 6 * 60 * 1000;
/** How long without input before an end-session offer is due. */
export const IDLE_OFFER_AFTER_MS = 30 * 1000;

/** The clock evidence the shell feeds in. Every value is supplied; nothing here samples a clock. */
export type ActiveTimeAccount = {
  /** Milliseconds of *active* play credited so far. */
  readonly activeMs: number;
  /** The clock position the accumulation has reached, so an interval is never credited twice. */
  readonly accountedAtMs: number;
  /** When the learner last did something. */
  readonly lastInputAtMs: number;
  readonly visible: boolean;
  readonly boardActive: boolean;
};

export function createActiveTimeAccount(nowMs: number): ActiveTimeAccount {
  return Object.freeze({
    activeMs: 0,
    accountedAtMs: nowMs,
    lastInputAtMs: nowMs,
    visible: true,
    boardActive: false,
  });
}

/**
 * Credit the interval that just elapsed, then move the accumulator to `nowMs`.
 *
 * The interval credited is `[accountedAtMs, nowMs)` intersected with the gates that were in force for it — which
 * is why every transition calls this *before* changing a gate.
 */
function advance(account: ActiveTimeAccount, nowMs: number): ActiveTimeAccount {
  const elapsed = creditFor(account, nowMs);
  return Object.freeze({
    ...account,
    activeMs: account.activeMs + elapsed,
    accountedAtMs: Math.max(account.accountedAtMs, nowMs),
  });
}

/** How much of `[accountedAtMs, nowMs)` counts as active play under the account's current gates. */
function creditFor(account: ActiveTimeAccount, nowMs: number): number {
  if (!account.visible || !account.boardActive) return 0;

  // Idle time is measured from the last input, so an interval that runs past the idle threshold only credits the
  // part before it. This is the rule that stops a background tab from quietly costing a session.
  const countableUntilMs = Math.min(nowMs, account.lastInputAtMs + IDLE_OFFER_AFTER_MS);
  return Math.max(0, countableUntilMs - account.accountedAtMs);
}

/** The shell's heartbeat. */
export function activeTimeAfterTick(account: ActiveTimeAccount, nowMs: number): ActiveTimeAccount {
  return advance(account, nowMs);
}

/** The learner did something, which ends any idle streak. */
export function activeTimeAfterInput(account: ActiveTimeAccount, nowMs: number): ActiveTimeAccount {
  const advanced = advance(account, nowMs);
  return Object.freeze({ ...advanced, lastInputAtMs: nowMs });
}

/** The document became visible or hidden. Hidden time is not play time. */
export function activeTimeAfterVisibility(
  account: ActiveTimeAccount,
  visible: boolean,
  nowMs: number,
): ActiveTimeAccount {
  const advanced = advance(account, nowMs);
  // Re-appearing is not input: an idle learner who switches back is still idle until they act.
  return Object.freeze({ ...advanced, visible });
}

/** The game entered or left an active board phase. Setup and summary time is not play time. */
export function activeTimeAfterPhase(
  account: ActiveTimeAccount,
  boardActive: boolean,
  nowMs: number,
): ActiveTimeAccount {
  const advanced = advance(account, nowMs);
  return Object.freeze({ ...advanced, boardActive });
}

/** How long the learner has been idle at `nowMs`. */
export function idleMs(account: ActiveTimeAccount, nowMs: number): number {
  return Math.max(0, nowMs - account.lastInputAtMs);
}

/**
 * Whether a calm end-session offer is due.
 *
 * Non-destructive by construction: this only answers, and the caller renders an offer with two equal-weight
 * choices. Nothing ends a session on its own.
 */
export function idleOfferDue(account: ActiveTimeAccount, nowMs: number): boolean {
  return account.visible && idleMs(account, nowMs) >= IDLE_OFFER_AFTER_MS;
}

export type SessionEvidence = {
  readonly productionBoards: number;
  readonly activeMs: number;
};

export type SessionBounds = {
  readonly soft: boolean;
  readonly hard: boolean;
  /** Which bound was reached, as facts the surface can state rather than as a bare flag. */
  readonly softReasons: readonly string[];
  readonly hardReasons: readonly string[];
};

/** Evaluate the soft and hard bounds. Each reports *why* it was reached. */
export function boundsFor(evidence: SessionEvidence): SessionBounds {
  const softReasons: string[] = [];
  if (evidence.productionBoards >= SOFT_PRODUCTION_BOARDS) {
    softReasons.push(`${evidence.productionBoards} boards finished`);
  }
  if (evidence.activeMs >= SOFT_ACTIVE_MS) {
    softReasons.push(`${Math.floor(evidence.activeMs / 1000)} seconds of play`);
  }

  const hardReasons: string[] = [];
  if (evidence.productionBoards >= HARD_PRODUCTION_BOARDS) {
    hardReasons.push(`${evidence.productionBoards} boards finished`);
  }
  if (evidence.activeMs >= HARD_ACTIVE_MS) {
    hardReasons.push(`${Math.floor(evidence.activeMs / 1000)} seconds of play`);
  }

  return Object.freeze({
    soft: softReasons.length > 0,
    hard: hardReasons.length > 0,
    softReasons: Object.freeze(softReasons),
    hardReasons: Object.freeze(hardReasons),
  });
}

/** The facts a session can report. Every one is something the game actually observed. */
export type SessionEvidenceFacts = {
  readonly productionBoards: number;
  readonly pairsMatched: number;
  readonly moves: number;
  readonly familiesPracticed: readonly RepresentationFamily[];
  readonly mismatches: number;
  readonly mismatchesByClass: Readonly<Record<MismatchClass, number>>;
};

export function emptySessionFacts(): SessionEvidenceFacts {
  return Object.freeze({
    productionBoards: 0,
    pairsMatched: 0,
    moves: 0,
    familiesPracticed: Object.freeze([]),
    mismatches: 0,
    mismatchesByClass: Object.freeze({ "same-numerator": 0, "same-denominator": 0, "different-both": 0 }),
  });
}

export type SessionSummary = {
  readonly facts: SessionEvidenceFacts;
  /** The fact list, as the surface renders it. */
  readonly lines: readonly string[];
  /** One line derived from the observations, and never a claim about the learner. */
  readonly coachingLine: string;
};

/** The most frequent mismatch class, with the declared class order breaking ties. */
export function dominantMismatchClass(
  counts: Readonly<Record<MismatchClass, number>>,
): MismatchClass | null {
  let best: MismatchClass | null = null;
  for (const candidate of ["same-numerator", "same-denominator", "different-both"] as const) {
    if (counts[candidate] === 0) continue;
    if (best === null || counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

/**
 * The deterministic coaching line.
 *
 * A function of the observations and nothing else, and phrased as a fact about this session rather than as a
 * judgement about the person. Every template is listed in the copy register, and a test refuses mastery vocabulary.
 */
export function coachingLineFor(facts: SessionEvidenceFacts): string {
  if (facts.moves === 0) return "No pairs finished yet this session.";
  if (facts.mismatches === 0) return "Every pair you tried this session matched.";

  switch (dominantMismatchClass(facts.mismatchesByClass)) {
    case "same-numerator":
      return "Most pairs that did not match shared a top number.";
    case "same-denominator":
      return "Most pairs that did not match shared a bottom number.";
    case "different-both":
      return "Most pairs that did not match shared neither number.";
    case null:
      return "Some pairs did not match.";
  }
}

function familyList(families: readonly RepresentationFamily[]): string {
  return families.length === 0 ? "none yet" : families.join(", ");
}

/**
 * The summary.
 *
 * Current-session facts only. There is no percentage, no grade, no level, no "improvement" and no comparison to
 * any other session — because there is nothing to compare to: the game keeps no record of any other session.
 */
export function summaryFor(facts: SessionEvidenceFacts): SessionSummary {
  return Object.freeze({
    facts,
    lines: Object.freeze([
      `Boards finished: ${facts.productionBoards}`,
      `Pairs matched: ${facts.pairsMatched}`,
      `Moves: ${facts.moves}`,
      `Forms practised: ${familyList(facts.familiesPracticed)}`,
      `Pairs that did not match: ${facts.mismatches}`,
    ]),
    coachingLine: coachingLineFor(facts),
  });
}
