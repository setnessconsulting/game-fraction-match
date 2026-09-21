/**
 * Deterministic game state machine.
 *
 * The engine owns legal actions and match correctness. React (or any other renderer) only ever
 * projects this state; it never decides whether two cards are equivalent.
 *
 * INVARIANTS
 * - Correctness is decided by canonical rational equality between the two selected cards.
 * - `pairId` is never consulted here. It exists for generation diagnostics only.
 * - The first selection is not a move. Exactly one genuine second-card selection produces exactly
 *   one comparison and increments `moves` by exactly one.
 * - Selecting the same card twice cannot produce a comparison.
 * - While a comparison is awaiting acknowledgement, further selections are explicitly rejected and
 *   return the unchanged state, so a rapid double action can never resolve twice.
 * - Matched cards can never be selected again.
 * - Board completion is derived from the authoritative matched-card set.
 * - No timing lives here. Feedback dwell and motion belong to GAME-190; a mismatch stays visible
 *   because it is `awaiting-acknowledgement` state, not because a timer has not elapsed.
 */

import type { Deck, DeckCard } from "./deck";
import { rationalEquals } from "./rational";

/** The outcome of one resolved two-card comparison. */
export type ComparisonOutcome = "match" | "mismatch";

/** How a single card currently projects. */
export type CardState = "hidden" | "revealed" | "matched";

/** A resolved comparison, retained for downstream feedback work (GAME-190). */
export type ComparisonResolution = {
  readonly cardIndexes: readonly [number, number];
  readonly outcome: ComparisonOutcome;
  /** One-based move number this comparison ended. */
  readonly moveNumber: number;
};

/** A mismatch that is visible until the presenter acknowledges it. */
export type PendingComparison = {
  readonly cardIndexes: readonly [number, number];
  readonly outcome: "mismatch";
  readonly moveNumber: number;
};

/** `awaiting-acknowledgement` means a mismatch is still on screen. */
export type GamePhase = "selecting" | "awaiting-acknowledgement";

/** Board status derived from the authoritative matched-card set. */
export type GameStatus = "active" | "complete";

/** The complete authoritative game state. */
export type GameState = {
  readonly cards: readonly DeckCard[];
  readonly seed: number;
  /** Zero, one or two card indexes currently face up. */
  readonly revealedCardIndexes: readonly number[];
  readonly matchedCardIndexes: readonly number[];
  /** Completed comparisons. The first selection of a move never increments this. */
  readonly moves: number;
  readonly lastResolution: ComparisonResolution | null;
  readonly pendingComparison: PendingComparison | null;
  readonly phase: GamePhase;
  readonly status: GameStatus;
};

/** Every legal engine action. */
export type GameAction =
  | { readonly type: "select-card"; readonly cardIndex: number }
  | { readonly type: "acknowledge-comparison" };

/** Why an action was refused. Refusals are deterministic and always leave state untouched. */
export type RejectionReason =
  | "invalid-card-index"
  | "card-already-matched"
  | "duplicate-selection"
  | "comparison-pending"
  | "no-pending-comparison"
  | "board-complete"
  | "unknown-action";

/** The result of applying an action: always a state, plus whether it changed. */
export type TransitionResult =
  | { readonly kind: "applied"; readonly action: GameAction; readonly state: GameState }
  | {
      readonly kind: "rejected";
      readonly action: GameAction;
      readonly reason: RejectionReason;
      readonly state: GameState;
    };

/** Thrown when a deck cannot become a game board. */
export class GameStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameStateError";
  }
}

/**
 * Create the initial authoritative state for a dealt deck.
 *
 * @throws {GameStateError} when the deck is empty or does not contain whole pairs.
 */
export function createGameState(deck: Deck): GameState {
  if (typeof deck !== "object" || deck === null || !Array.isArray(deck.cards)) {
    throw new GameStateError("game state requires a dealt deck with a cards array");
  }
  if (deck.cards.length === 0) {
    throw new GameStateError("game state requires at least one card");
  }
  if (deck.cards.length % 2 !== 0) {
    throw new GameStateError(`game state requires whole pairs; received ${deck.cards.length} cards`);
  }

  return Object.freeze({
    cards: deck.cards,
    seed: deck.seed,
    revealedCardIndexes: Object.freeze([]) as readonly number[],
    matchedCardIndexes: Object.freeze([]) as readonly number[],
    moves: 0,
    lastResolution: null,
    pendingComparison: null,
    phase: "selecting" as GamePhase,
    status: "active" as GameStatus,
  });
}

/** Whether `cardIndex` addresses a card in this state. */
export function isValidCardIndex(state: GameState, cardIndex: number): boolean {
  return Number.isSafeInteger(cardIndex) && cardIndex >= 0 && cardIndex < state.cards.length;
}

/** Whether a card has already been matched. */
export function isCardMatched(state: GameState, cardIndex: number): boolean {
  return state.matchedCardIndexes.includes(cardIndex);
}

/** Whether a card is currently face up. */
export function isCardRevealed(state: GameState, cardIndex: number): boolean {
  return state.revealedCardIndexes.includes(cardIndex);
}

/**
 * How one card projects right now.
 * Presentation reads this instead of re-deriving legality or visibility itself.
 */
export function cardStateOf(state: GameState, cardIndex: number): CardState {
  if (isCardMatched(state, cardIndex)) return "matched";
  if (isCardRevealed(state, cardIndex)) return "revealed";
  return "hidden";
}

/** Whether the board is finished. Derived from authoritative state only. */
export function isGameComplete(state: GameState): boolean {
  return state.status === "complete";
}

/** Matched pairs remaining. Derived, never stored independently. */
export function remainingPairCount(state: GameState): number {
  return (state.cards.length - state.matchedCardIndexes.length) / 2;
}

/**
 * The single source of selection legality.
 *
 * Returns `null` when the selection is legal. Order is deliberate: an out-of-range index is always
 * reported as such, even on a finished board.
 */
function selectionRejectionReason(state: GameState, cardIndex: number): RejectionReason | null {
  if (!isValidCardIndex(state, cardIndex)) return "invalid-card-index";
  if (state.status !== "active") return "board-complete";
  if (state.pendingComparison !== null) return "comparison-pending";
  if (isCardMatched(state, cardIndex)) return "card-already-matched";
  if (isCardRevealed(state, cardIndex)) return "duplicate-selection";
  return null;
}

/**
 * Whether the presenter may offer this card as selectable.
 * Convenience projection of {@link selectionRejectionReason}; it is not an authority by itself.
 */
export function isCardSelectable(state: GameState, cardIndex: number): boolean {
  return selectionRejectionReason(state, cardIndex) === null;
}

function withRevealed(state: GameState, cardIndex: number): GameState {
  const revealedCardIndexes = [...state.revealedCardIndexes, cardIndex];
  return Object.freeze({ ...state, revealedCardIndexes: Object.freeze(revealedCardIndexes) });
}

function resolveComparison(state: GameState): GameState {
  const firstIndex = state.revealedCardIndexes[0]!;
  const secondIndex = state.revealedCardIndexes[1]!;
  const firstCard = state.cards[firstIndex]!;
  const secondCard = state.cards[secondIndex]!;

  // The one and only correctness rule. Canonical rational equality — no ids, no text, no geometry.
  const outcome: ComparisonOutcome = rationalEquals(firstCard.form.canonical, secondCard.form.canonical)
    ? "match"
    : "mismatch";
  const moves = state.moves + 1;
  const resolution: ComparisonResolution = Object.freeze({
    cardIndexes: Object.freeze([firstIndex, secondIndex]) as readonly [number, number],
    outcome,
    moveNumber: moves,
  });

  if (outcome === "mismatch") {
    return Object.freeze({
      ...state,
      moves,
      lastResolution: resolution,
      pendingComparison: Object.freeze({
        cardIndexes: resolution.cardIndexes,
        outcome: "mismatch" as const,
        moveNumber: moves,
      }),
      phase: "awaiting-acknowledgement" as GamePhase,
      status: "active" as GameStatus,
    });
  }

  const matchedCardIndexes = Object.freeze([...state.matchedCardIndexes, firstIndex, secondIndex]);
  const status: GameStatus = matchedCardIndexes.length === state.cards.length ? "complete" : "active";
  return Object.freeze({
    ...state,
    revealedCardIndexes: Object.freeze([]) as readonly number[],
    matchedCardIndexes,
    moves,
    lastResolution: resolution,
    pendingComparison: null,
    phase: "selecting" as GamePhase,
    status,
  });
}

function applySelection(state: GameState, cardIndex: number): TransitionResult {
  const action: GameAction = { type: "select-card", cardIndex };
  const reason = selectionRejectionReason(state, cardIndex);
  if (reason !== null) return { kind: "rejected", action, reason, state };

  const revealed = withRevealed(state, cardIndex);
  if (revealed.revealedCardIndexes.length < 2) {
    return { kind: "applied", action, state: revealed };
  }
  return { kind: "applied", action, state: resolveComparison(revealed) };
}

function applyAcknowledgement(state: GameState): TransitionResult {
  const action: GameAction = { type: "acknowledge-comparison" };
  if (state.pendingComparison === null) {
    return { kind: "rejected", action, reason: "no-pending-comparison", state };
  }
  return {
    kind: "applied",
    action,
    state: Object.freeze({
      ...state,
      revealedCardIndexes: Object.freeze([]) as readonly number[],
      pendingComparison: null,
      phase: "selecting" as GamePhase,
    }),
  };
}

/**
 * Apply one action.
 *
 * Pure: the returned state is a new frozen object (or the identical input for a rejection), and the
 * input state is never mutated. Applying the same action to the same state always yields the same
 * result, which is what makes double-resolution structurally impossible.
 */
export function applyAction(state: GameState, action: GameAction): TransitionResult {
  if (typeof action !== "object" || action === null) {
    return { kind: "rejected", action: action as GameAction, reason: "unknown-action", state };
  }
  if (action.type === "select-card") return applySelection(state, action.cardIndex);
  if (action.type === "acknowledge-comparison") return applyAcknowledgement(state);
  return { kind: "rejected", action, reason: "unknown-action", state };
}
