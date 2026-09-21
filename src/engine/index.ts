/**
 * Public engine boundary.
 *
 * This module is the only engine surface presentation code may import. The `check:boundary`
 * repository guard fails the build when anything under `src/` outside `src/engine/` reaches past
 * this file into a deeper engine module, so the mathematical comparison internals cannot leak into
 * the UI.
 *
 * CONSUMER RULES
 * - Presentation may read engine state and dispatch engine actions. It may not compute
 *   equivalence, decide a match, or infer correctness from text, SVG geometry, CSS, card ids or
 *   pair ids.
 * - `pairId` is generation/debug metadata. Use `cardStateOf`, `isCardSelectable` and
 *   `applyAction` for anything that affects play.
 * - Seeds come from outside the engine. In production the shell samples a cryptographically strong
 *   browser source and passes the resulting number in as data.
 *
 * DOWNSTREAM OWNERS
 * - GAME-186 adds SVG/representation primitives on top of these rational values.
 * - GAME-187 supplies lane configurations (denominator catalogues, representation mixes,
 *   distractors) as `DeckConfig` data. It must not add a second math implementation.
 * - GAME-189/190 project `GameState` and `lastResolution`; they do not own matching correctness.
 */

export { RATIONAL_ZERO, RationalError, rational, rationalSigned } from "./rational";
export type { Rational } from "./rational";
export {
  countRationalOccurrences,
  distinctRationals,
  greatestCommonDivisor,
  isRational,
  rationalEquals,
  tryRational,
} from "./rational";

export { FractionFormError, createFractionForm, createFractionFormFromInput } from "./fractionForm";
export type { FractionForm, FractionFormInput } from "./fractionForm";
export {
  fractionFormsShareValue,
  isReducedFractionForm,
  isSameAuthoredForm,
  tryCreateFractionForm,
} from "./fractionForm";

export {
  MAX_PAIR_COUNT,
  MIN_PAIR_COUNT,
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  DeckConfigError,
  DeckInvariantError,
  assertDeckEquivalenceInvariants,
  createDeck,
  isSatisfiableDeckConfig,
  validateDeckConfig,
} from "./deck";
export type { Deck, DeckCard, DeckConfig, DeckConstraints, EquivalenceFamily } from "./deck";

export {
  GameStateError,
  applyAction,
  cardStateOf,
  createGameState,
  isCardMatched,
  isCardSelectable,
  isCardRevealed,
  isGameComplete,
  isValidCardIndex,
  remainingPairCount,
} from "./gameState";
export type {
  CardState,
  ComparisonOutcome,
  ComparisonResolution,
  GameAction,
  GamePhase,
  GameState,
  GameStatus,
  PendingComparison,
  RejectionReason,
  TransitionResult,
} from "./gameState";
