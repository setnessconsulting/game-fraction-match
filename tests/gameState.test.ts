import { describe, expect, it } from "vitest";

import {
  GameStateError,
  PRODUCTION_PAIR_COUNT,
  applyAction,
  cardStateOf,
  createDeck,
  createFractionForm,
  createGameState,
  isCardMatched,
  isCardSelectable,
  isCardRevealed,
  isGameComplete,
  isValidCardIndex,
  remainingPairCount,
  type Deck,
  type DeckCard,
  type GameAction,
  type GameState,
  type RejectionReason,
  type TransitionResult,
} from "../src/engine";
import { DEFAULT_TEST_SEED, GENERIC_FAMILIES, equivalentPair, nonEquivalentPair, solveBoard } from "./fixtures";

const deckFor = (seed = DEFAULT_TEST_SEED) =>
  createDeck({ pairCount: PRODUCTION_PAIR_COUNT, families: GENERIC_FAMILIES, seed });

const stateFor = (seed = DEFAULT_TEST_SEED): GameState => createGameState(deckFor(seed));

const select = (state: GameState, cardIndex: number) => applyAction(state, { type: "select-card", cardIndex });
const acknowledge = (state: GameState) => applyAction(state, { type: "acknowledge-comparison" });

const reasonOf = (result: TransitionResult): RejectionReason | null =>
  result.kind === "rejected" ? result.reason : null;

const card = (numerator: number, denominator: number, pairId: string): DeckCard => ({
  cardId: `card-${pairId}-${numerator}-${denominator}`,
  pairId,
  form: createFractionForm(numerator, denominator),
});

const handMadeDeck = (cards: DeckCard[]): Deck => ({
  seed: 0,
  pairCount: cards.length / 2,
  cardCount: cards.length,
  cards,
  usedFamilyIds: [],
});

describe("initial state", () => {
  it("starts an empty, active board", () => {
    const state = stateFor();
    expect(state.cards).toHaveLength(16);
    expect(state.seed).toBe(DEFAULT_TEST_SEED);
    expect(state.revealedCardIndexes).toEqual([]);
    expect(state.matchedCardIndexes).toEqual([]);
    expect(state.moves).toBe(0);
    expect(state.lastResolution).toBeNull();
    expect(state.pendingComparison).toBeNull();
    expect(state.phase).toBe("selecting");
    expect(state.status).toBe("active");
    expect(isGameComplete(state)).toBe(false);
    expect(remainingPairCount(state)).toBe(PRODUCTION_PAIR_COUNT);
  });

  it("refuses a deck that cannot be a board", () => {
    expect(() => createGameState(null as unknown as Deck)).toThrow(GameStateError);
    expect(() => createGameState({ cards: undefined } as unknown as Deck)).toThrow(/cards array/);
    expect(() => createGameState(handMadeDeck([]))).toThrow(/at least one card/);
    expect(() => createGameState(handMadeDeck([card(1, 2, "a")]))).toThrow(/whole pairs; received 1 cards/);
  });
});

describe("reveal and resolve", () => {
  it("does not count the first selection as a move", () => {
    const state = stateFor();
    const result = select(state, 0);
    expect(result.kind).toBe("applied");
    expect(result.state.revealedCardIndexes).toEqual([0]);
    expect(result.state.moves).toBe(0);
    expect(result.state.phase).toBe("selecting");
    expect(cardStateOf(result.state, 0)).toBe("revealed");
    expect(isCardSelectable(result.state, 0)).toBe(false);
  });

  it("resolves a correct match from canonical equality and locks the pair", () => {
    const state = stateFor();
    const [left, right] = equivalentPair(state);
    const first = select(state, left).state;
    const result = select(first, right);

    expect(result.kind).toBe("applied");
    expect(result.state.moves).toBe(1);
    expect(result.state.matchedCardIndexes).toEqual([left, right]);
    expect(result.state.revealedCardIndexes).toEqual([]);
    expect(result.state.pendingComparison).toBeNull();
    expect(result.state.phase).toBe("selecting");
    expect(result.state.lastResolution).toEqual({ cardIndexes: [left, right], outcome: "match", moveNumber: 1 });
    expect(cardStateOf(result.state, left)).toBe("matched");
    expect(cardStateOf(result.state, right)).toBe("matched");
    expect(isCardMatched(result.state, left)).toBe(true);
    expect(isCardRevealed(result.state, left)).toBe(false);
    expect(isCardSelectable(result.state, left)).toBe(false);
    expect(remainingPairCount(result.state)).toBe(PRODUCTION_PAIR_COUNT - 1);
    expect(result.state.status).toBe("active");
  });

  it("keeps a mismatch visible until it is acknowledged, without a timer", () => {
    const state = stateFor();
    const [left, right] = nonEquivalentPair(state);
    const first = select(state, left).state;
    const result = select(first, right);

    expect(result.state.moves).toBe(1);
    expect(result.state.matchedCardIndexes).toEqual([]);
    expect(result.state.revealedCardIndexes).toEqual([left, right]);
    expect(result.state.phase).toBe("awaiting-acknowledgement");
    expect(result.state.status).toBe("active");
    expect(result.state.lastResolution).toEqual({ cardIndexes: [left, right], outcome: "mismatch", moveNumber: 1 });
    expect(result.state.pendingComparison).toEqual({
      cardIndexes: [left, right],
      outcome: "mismatch",
      moveNumber: 1,
    });

    const cleared = acknowledge(result.state);
    expect(cleared.kind).toBe("applied");
    expect(cleared.state.revealedCardIndexes).toEqual([]);
    expect(cleared.state.pendingComparison).toBeNull();
    expect(cleared.state.phase).toBe("selecting");
    expect(cleared.state.moves).toBe(1);
    expect(cardStateOf(cleared.state, left)).toBe("hidden");
    expect(cleared.state.lastResolution).toEqual({
      cardIndexes: [left, right],
      outcome: "mismatch",
      moveNumber: 1,
    });
  });

  it("rejects acknowledgement when nothing is pending", () => {
    const state = stateFor();
    const result = acknowledge(state);
    expect(result.kind).toBe("rejected");
    expect(result.kind === "rejected" ? result.reason : null).toBe("no-pending-comparison");
    expect(result.state).toBe(state);
    expect(result.state.moves).toBe(0);
  });
});

describe("illegal and repeated actions", () => {
  it("cannot select the same card twice into a comparison", () => {
    const state = stateFor();
    const first = select(state, 3).state;
    const repeated = select(first, 3);

    expect(repeated.kind).toBe("rejected");
    expect(repeated.kind === "rejected" ? repeated.reason : null).toBe("duplicate-selection");
    expect(repeated.state).toBe(first);
    expect(repeated.state.moves).toBe(0);
    expect(repeated.state.revealedCardIndexes).toEqual([3]);
  });

  it("rejects a third card while a comparison awaits acknowledgement", () => {
    const state = stateFor();
    const [left, right] = nonEquivalentPair(state);
    const third = state.cards.map((_, index) => index).find((index) => index !== left && index !== right)!;

    const pending = select(select(state, left).state, right).state;
    const blocked = select(pending, third);

    expect(blocked.kind).toBe("rejected");
    expect(blocked.kind === "rejected" ? blocked.reason : null).toBe("comparison-pending");
    expect(blocked.state).toBe(pending);
    expect(blocked.state.moves).toBe(1);
    expect(isCardSelectable(pending, third)).toBe(false);
  });

  it("rejects matched cards and out-of-range indexes", () => {
    const state = stateFor();
    const [left, right] = equivalentPair(state);
    const matched = select(select(state, left).state, right).state;

    expect(select(matched, left).kind).toBe("rejected");
    expect(reasonOf(select(matched, right))).toBe("card-already-matched");
    for (const index of [-1, 16, 4.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      expect(reasonOf(select(state, index))).toBe("invalid-card-index");
      expect(isCardSelectable(state, index)).toBe(false);
    }
    expect(isValidCardIndex(state, 0)).toBe(true);
    expect(isValidCardIndex(state, 15)).toBe(true);
    expect(isValidCardIndex(state, 16)).toBe(false);
  });

  it("refuses malformed actions deterministically", () => {
    const state = stateFor();
    const unknown = applyAction(state, { type: "teleport" } as unknown as GameAction);
    expect(reasonOf(unknown)).toBe("unknown-action");
    expect(unknown.state).toBe(state);

    const nothing = applyAction(state, null as unknown as GameAction);
    expect(reasonOf(nothing)).toBe("unknown-action");
    expect(nothing.state).toBe(state);
  });
});

describe("idempotency and purity", () => {
  it("produces identical results for the same state and action", () => {
    const state = stateFor();
    const [left, right] = equivalentPair(state);
    const first = select(state, left);

    expect(select(state, left)).toEqual(first);
    expect(select(state, left).state).not.toBe(first.state);

    const resolved = select(first.state, right);
    const repeated = select(first.state, right);
    expect(repeated.state).toEqual(resolved.state);
    expect(repeated.state.moves).toBe(1);
  });

  it("cannot double-increment from a rapid repeat of the same comparison", () => {
    const state = stateFor();
    const [left, right] = nonEquivalentPair(state);
    const settled = select(select(state, left).state, right).state;

    // A rapid second click on either already-revealed card, and any third card, must not move state.
    const sameCard = select(settled, left);
    const otherCard = select(settled, right);
    const anyOther = select(settled, settled.cards.length - 1);

    for (const result of [sameCard, otherCard, anyOther]) {
      expect(result.kind).toBe("rejected");
      expect(result.state).toBe(settled);
      expect(result.state.moves).toBe(1);
    }
    expect(acknowledge(settled).state.moves).toBe(1);
  });

  it("never mutates the input state", () => {
    const state = stateFor();
    const snapshot = JSON.stringify(state);
    const [left, right] = equivalentPair(state);
    select(select(state, left).state, right);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.moves).toBe(0);
    expect(state.matchedCardIndexes).toEqual([]);
  });
});

describe("correctness never consults pairId", () => {
  /**
   * The decisive test for the authority rule: equivalence follows canonical values only, so a
   * shared `pairId` cannot create a match and a mismatched `pairId` cannot prevent one.
   */
  const deceptiveDeck = handMadeDeck([
    card(1, 2, "alpha"),
    card(1, 3, "alpha"),
    card(2, 4, "beta"),
    card(2, 6, "beta"),
  ]);

  it("matches two cards that share a canonical value but not a pairId", () => {
    const state = createGameState(deceptiveDeck);
    const result = select(select(state, 0).state, 2);
    expect(result.state.lastResolution?.outcome).toBe("match");
    expect(result.state.matchedCardIndexes).toEqual([0, 2]);
  });

  it("refuses to match two cards that share a pairId but disagree mathematically", () => {
    const state = createGameState(deceptiveDeck);
    const result = select(select(state, 0).state, 1);
    expect(result.state.lastResolution?.outcome).toBe("mismatch");
    expect(result.state.matchedCardIndexes).toEqual([]);
    expect(result.state.pendingComparison?.outcome).toBe("mismatch");
  });

  it("completes that deceptive board through canonical equality alone", () => {
    const { state, comparisons } = solveBoard(deceptiveDeck.cards);
    expect(isGameComplete(state)).toBe(true);
    expect(comparisons).toBe(2);
  });
});

describe("equivalence, not notation, decides a match", () => {
  /** Deal a two-card board, choose both cards in order, and return the resolved state. */
  const resolvePair = (left: readonly [number, number], right: readonly [number, number]): GameState => {
    const deck = handMadeDeck([card(left[0], left[1], "left"), card(right[0], right[1], "right")]);
    const state = createGameState(deck);
    return select(select(state, 0).state, 1).state;
  };

  /**
   * Every enumerated equivalent representation must resolve as a match and complete the board. The
   * first two entries are the canonical cases (`1/2` vs `2/4`, `2/3` vs `4/6`); the rest exercise the
   * supported corners: larger equivalents, one, an improper fraction, a denominator of one, a zero
   * numerator and a negative value.
   */
  const MATCHING_PAIRS: readonly (readonly [readonly [number, number], readonly [number, number], string])[] = [
    [[1, 2], [2, 4], "halves"],
    [[2, 3], [4, 6], "two thirds"],
    [[3, 4], [6, 8], "three quarters"],
    [[1, 2], [500_000_000, 1_000_000_000], "large equivalent"],
    [[1, 1], [7, 7], "equal to one"],
    [[5, 2], [10, 4], "improper fraction"],
    [[7, 1], [14, 2], "denominator of one"],
    [[0, 5], [0, 3], "zero numerator"],
    [[-1, 2], [-2, 4], "negative value"],
  ];

  for (const [left, right, label] of MATCHING_PAIRS) {
    it(`matches ${left[0]}/${left[1]} with ${right[0]}/${right[1]} (${label})`, () => {
      const state = resolvePair(left, right);

      expect(state.lastResolution).toEqual({ cardIndexes: [0, 1], outcome: "match", moveNumber: 1 });
      expect(state.matchedCardIndexes).toEqual([0, 1]);
      expect(state.revealedCardIndexes).toEqual([]);
      expect(state.pendingComparison).toBeNull();
      expect(state.moves).toBe(1);
      expect(state.status).toBe("complete");
      expect(isGameComplete(state)).toBe(true);
      expect(cardStateOf(state, 0)).toBe("matched");
      expect(cardStateOf(state, 1)).toBe("matched");
    });
  }

  /** Near-miss distractors and precision traps: different amounts that must never resolve as a match. */
  const MISMATCHING_PAIRS: readonly (readonly [readonly [number, number], readonly [number, number], string])[] = [
    [[1, 2], [1, 3], "same numerator, different denominator"],
    [[3, 4], [3, 5], "same numerator, different denominator"],
    [[2, 5], [3, 5], "different numerator, same denominator"],
    [[7, 10], [9, 10], "different numerator, same denominator"],
    [[1, 2], [2, 3], "adjacent values"],
    [[3, 4], [4, 5], "close but not equal"],
    [[1, 1], [1, 2], "whole versus part"],
    [[0, 1], [1, 1], "zero versus one"],
    [[-1, 2], [1, 2], "the sign is part of the value"],
    [[9_007_199_254_988, 9_007_199_254_989], [9_007_199_254_989, 9_007_199_254_990], "identical double quotient"],
  ];

  for (const [left, right, label] of MISMATCHING_PAIRS) {
    it(`refuses to match ${left[0]}/${left[1]} with ${right[0]}/${right[1]} (${label})`, () => {
      const state = resolvePair(left, right);

      expect(state.lastResolution?.outcome).toBe("mismatch");
      expect(state.matchedCardIndexes).toEqual([]);
      expect(state.pendingComparison?.outcome).toBe("mismatch");
      expect(state.phase).toBe("awaiting-acknowledgement");
      expect(state.status).toBe("active");
      expect(state.moves).toBe(1);
      expect(remainingPairCount(state)).toBe(1);
      expect(isGameComplete(state)).toBe(false);
    });
  }

  it("counts deliberate mismatches as moves without disturbing completion", () => {
    const deck = handMadeDeck([card(1, 2, "a"), card(2, 4, "a"), card(2, 3, "b"), card(4, 6, "b")]);
    let state = createGameState(deck);

    // A deliberate wrong pairing first: 1/2 against 2/3, then acknowledged.
    state = select(select(state, 0).state, 2).state;
    expect(state.lastResolution?.outcome).toBe("mismatch");
    expect(state.moves).toBe(1);
    state = acknowledge(state).state;
    expect(state.moves).toBe(1);
    expect(state.revealedCardIndexes).toEqual([]);

    // Then the two real pairs, in either order.
    state = select(select(state, 0).state, 1).state;
    expect(state.lastResolution?.outcome).toBe("match");
    state = select(select(state, 2).state, 3).state;
    expect(state.lastResolution?.outcome).toBe("match");

    expect(state.moves).toBe(3);
    expect(state.status).toBe("complete");
    expect(remainingPairCount(state)).toBe(0);
    expect(state.matchedCardIndexes).toEqual([0, 1, 2, 3]);
  });

  it("ignores pair ids when it decides a board of equivalent fractions", () => {
    // Every card carries a cross-wise pair id, so a shared id never lines up with a shared value.
    const state = createGameState(
      handMadeDeck([card(1, 2, "b"), card(1, 3, "a"), card(1, 2, "a"), card(1, 3, "b")]),
    );
    // Cards 0 and 2 are both 1/2 despite disagreeing on pairId.
    expect(select(select(state, 0).state, 2).state.lastResolution?.outcome).toBe("match");
    // Cards 0 and 1 disagree in value despite sharing a compatible id elsewhere.
    expect(select(select(state, 0).state, 1).state.lastResolution?.outcome).toBe("mismatch");
  });

  it("replays an identical deal to an identical result", () => {
    const cards = [card(1, 2, "a"), card(2, 4, "a"), card(2, 3, "b"), card(4, 6, "b")];
    const sequence: readonly number[] = [0, 1, 2, 3];

    const play = (): GameState => {
      let state = createGameState(handMadeDeck(cards));
      for (const index of sequence) {
        state = select(state, index).state;
        if (state.pendingComparison !== null) state = acknowledge(state).state;
      }
      return state;
    };

    const first = play();
    expect(play()).toEqual(first);
    expect(first.status).toBe("complete");
    expect(first.moves).toBe(2);
  });
});

describe("board completion", () => {
  it("completes an 8-pair board and derives status from matched cards", () => {
    const deck = deckFor();
    const { state, comparisons } = solveBoard(deck.cards);

    expect(isGameComplete(state)).toBe(true);
    expect(state.status).toBe("complete");
    expect(state.matchedCardIndexes).toHaveLength(16);
    expect(new Set(state.matchedCardIndexes).size).toBe(16);
    expect(remainingPairCount(state)).toBe(0);
    // A perfect solve needs exactly one comparison per pair, and one move per comparison.
    expect(comparisons).toBe(PRODUCTION_PAIR_COUNT);
    expect(state.moves).toBe(PRODUCTION_PAIR_COUNT);
    expect(state.pendingComparison).toBeNull();
    expect(state.lastResolution?.outcome).toBe("match");
  });

  it("refuses every further action on a finished board", () => {
    const { state } = solveBoard(deckFor().cards);

    const selection = select(state, 0);
    expect(reasonOf(selection)).toBe("board-complete");
    expect(selection.state).toBe(state);

    const acknowledgement = acknowledge(state);
    expect(reasonOf(acknowledgement)).toBe("no-pending-comparison");

    const invalidIndex = select(state, 99);
    expect(reasonOf(invalidIndex)).toBe("invalid-card-index");
    expect(isCardSelectable(state, 0)).toBe(false);
    expect(cardStateOf(state, 0)).toBe("matched");
  });

  it("counts mismatches as moves while leaving completion unfinished", () => {
    const state = stateFor();
    const [left, right] = nonEquivalentPair(state);
    const mismatch = select(select(state, left).state, right).state;
    const cleared = acknowledge(mismatch).state;

    expect(cleared.moves).toBe(1);
    expect(isGameComplete(cleared)).toBe(false);
    expect(remainingPairCount(cleared)).toBe(PRODUCTION_PAIR_COUNT);
  });
});
