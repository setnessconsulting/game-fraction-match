/**
 * Public game-shell boundary (GAME-189).
 *
 * CONSUMER RULES
 * - The shell **renders** engine state and **emits** intents. It never computes equivalence, never decides a
 *   match, and never infers either from text, SVG geometry, CSS, card ids or pair ids.
 * - The card size is not the shell's to choose: a card is drawn at the box its lane was qualified at, and the
 *   grid reflows columns around it. Shrinking the picture to fit a viewport would invalidate GAME-187's
 *   coverage proof, because the families were selected by measuring geometry at that box.
 * - Nothing is scheduled. No timer, no animation callback and no transport can advance game state; every
 *   transition comes from `applyIntent` and therefore from a learner action.
 * - The surface never navigates the host: no `window.parent`, no top-level route, no `postMessage`. The
 *   games-site play toolbar owns the way out, and ending a session returns to this game's own setup.
 *
 * DOWNSTREAM OWNERS
 * - GAME-190 owns explanatory feedback: this shell renders a factual mismatch line and an explicit continue,
 *   and nothing that reads as teaching.
 * - GAME-191 owns session bounds, the factual summary and the replay arc. This shell deliberately has no soft
 *   or hard cap, no idle panel and no summary — ending a session returns to setup.
 * - GAME-192 owns final accessibility qualification; the accessible names, the roving focus model and the
 *   hidden-value discipline here are its starting surface.
 * - GAME-194 owns publication and the release manifest.
 */

export {
  BOARD_KINDS,
  SESSION_STAGES,
  SHELL_PRODUCTION_PAIR_COUNT,
  applyIntent,
  boardCardsInEngineOrder,
  boardLaneFor,
  boardPairCount,
  canSelectCard,
  cardStateOfBoard,
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
} from "./session";
export type {
  BoardKind,
  BoardPlan,
  GameIntent,
  GameSession,
  PlacedBoardCard,
  SessionStage,
} from "./session";

export { GRID_KEYS, focusAnchorIndex, isGridKey, nextFocusIndex, rovingTabIndexes, rowCountOf } from "./focus";
export type { FocusGrid, GridKey } from "./focus";

export {
  MAX_EXPLANATION_WORDS,
  MAX_INSPECTION_MS,
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
} from "./feedback";
export type {
  FeedbackSide,
  InspectionPlan,
  MatchFeedback,
  MismatchClass,
  MismatchFeedback,
} from "./feedback";

export { useInspectionWindow, useMotionPreference } from "./useInspectionWindow";
export type { InspectionWindow } from "./useInspectionWindow";

export {
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
} from "./sessionBounds";
export type {
  ActiveTimeAccount,
  SessionBounds,
  SessionEvidence,
  SessionEvidenceFacts,
  SessionSummary,
} from "./sessionBounds";

export { TICK_MS, useSessionClock } from "./useSessionClock";
export type { SessionClock } from "./useSessionClock";

export { Board, currentViewport, useBoardLayout } from "./Board";
export { BoardErrorBoundary, CalmRecovery, GameApp, GameStage, SessionSummaryPanel } from "./GameApp";
