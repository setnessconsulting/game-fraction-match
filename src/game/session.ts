/**
 * Game session model (GAME-189).
 *
 * This module is the whole of the shell's *decisions*, and it contains no React. That split is the story's
 * authority rule made structural: React renders this state and emits these intents, and never computes a
 * match, a legality or a board shape of its own.
 *
 * WHAT THIS MODULE DECIDES
 * - which lane a grade plays (`productionLaneFor`), taken from GAME-187's reviewed curriculum map rather than
 *   from the neutral fixtures;
 * - what the warm-up is (`warmUpLaneFor`): the *same* lane with the product's warm-up pair count, so the
 *   warm-up and the production board share one engine/action path and differ only by configuration;
 * - the board sequence and the stage machine that walks it;
 * - every transition, as a pure function of `(session, intent)`.
 *
 * WHAT IT DELIBERATELY DOES NOT DECIDE
 * - whether two cards match, which card is selectable, how many pairs remain: those are the engine's, reached
 *   through `cardStateOf`, `isCardSelectable`, `remainingPairCount` and `applyAction`;
 * - which picture a card gets: GAME-187's planner asks GAME-186's legibility policy, and this module only
 *   carries the resulting plan;
 * - session bounds, the factual summary and review scheduling: GAME-191 owns those. Ending a session returns
 *   to setup, which is what this story's host contract asks for.
 *
 * NO TIMERS, NO ANIMATION COUPLING
 * Nothing here is scheduled. An animation completing can never advance this state, because this state has no
 * notion of an animation: every transition is caused by an intent.
 */

import {
  MIN_PAIR_COUNT,
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  applyAction,
  cardStateOf,
  createGameState,
  isCardSelectable,
  isGameComplete,
  remainingPairCount,
  type CardState,
  type GameAction,
  type GameState,
} from "../engine";
import { planBoardLayout, type Viewport } from "../design";
import {
  GRADE_BANDS,
  curriculumLanes,
  isSatisfiableLane,
  planLaneDeck,
  type GradeBand,
  type LabelVisibility,
  type LaneCardPlan,
  type LaneConfig,
  type LanePlan,
} from "../lanes";

/** The stages of the shell. GAME-191 extends the arc; this story owns the playable middle. */
export const SESSION_STAGES = Object.freeze([
  "grade-setup",
  "instruction",
  "board",
  "board-complete",
  "calm-recovery",
] as const);
export type SessionStage = (typeof SESSION_STAGES)[number];

/** The two board shapes a session plays, in order. */
export const BOARD_KINDS = Object.freeze(["warm-up", "production-board"] as const);
export type BoardKind = (typeof BOARD_KINDS)[number];

/** Everything the board screen needs, in one frozen value. */
export type BoardPlan = {
  readonly kind: BoardKind;
  readonly lane: LaneConfig;
  readonly seed: number;
  /** The dealt board: the engine's deck plus one representation decision per card. */
  readonly plan: LanePlan;
  /**
   * Whether every card's value is on display.
   *
   * True for the warm-up only. This is a *rendering* decision and nothing else: the engine still decides
   * visibility and legality from the same state, so a visible face is a face the learner may look at, never a
   * face the shell pretends is selected.
   */
  readonly facesVisible: boolean;
  /** The lane's own scaffolding setting, carried through so the board does not invent one. */
  readonly labelVisibility: LabelVisibility;
};

export type GameSession = {
  readonly stage: SessionStage;
  readonly gradeBand: GradeBand | null;
  readonly board: BoardPlan | null;
  readonly state: GameState | null;
  /** Boards finished in this session. Facts only: no score, no streak, no mastery. */
  readonly completedBoards: number;
};

/** The typed intents the shell emits. Every one of them is caused by a learner action. */
export type GameIntent =
  | {
      readonly type: "choose-grade";
      readonly gradeBand: GradeBand;
      readonly seed: number;
      /** The viewport at deal time. A presentation fact the shell samples and hands over, like the seed. */
      readonly viewport: Viewport;
    }
  | { readonly type: "begin-board" }
  | { readonly type: "select-card"; readonly cardIndex: number }
  | { readonly type: "acknowledge-comparison" }
  | { readonly type: "reset-board" }
  | { readonly type: "next-board"; readonly seed: number; readonly viewport: Viewport }
  | { readonly type: "end-session" };

/** The starting session: nothing chosen, nothing dealt. */
export function createSession(): GameSession {
  return Object.freeze({
    stage: "grade-setup",
    gradeBand: null,
    board: null,
    state: null,
    completedBoards: 0,
  });
}

/** The grade bands a learner may choose, in the curriculum's own order. */
export function gradeOptions(): readonly GradeBand[] {
  return Object.freeze([...GRADE_BANDS]);
}

/** Every curriculum lane for a grade, in the map's order. */
export function lanesForGrade(gradeBand: GradeBand): readonly LaneConfig[] {
  return Object.freeze(curriculumLanes().filter((lane) => lane.gradeBand === gradeBand));
}

/**
 * The lane a grade plays as its production board: the largest board its reviewed content deals.
 *
 * Chosen by board size rather than by hand, so the map stays the authority on what a grade plays. Ties fall to
 * the map's order, which keeps the choice deterministic.
 */
export function productionLaneFor(gradeBand: GradeBand): LaneConfig {
  const lanes = lanesForGrade(gradeBand);
  const first = lanes[0];
  if (first === undefined) throw new Error(`no curriculum lane is published for ${gradeBand}`);

  let best = first;
  for (const lane of lanes) if (lane.pairCount > best.pairCount) best = lane;
  return best;
}

/**
 * The warm-up lane: the production lane, re-dealt smaller.
 *
 * The pair count is *lowered* to the product's warm-up size and never raised, because raising it would ask a
 * catalogue for values it may not have. A lane that cannot supply the warm-up size is reported rather than
 * silently dealt as something else.
 */
export function warmUpLaneFor(productionLane: LaneConfig): LaneConfig {
  return resizeLane(productionLane, Math.min(WARM_UP_PAIR_COUNT, productionLane.pairCount), "warm-up");
}

/** Re-deal a lane at a different size, changing only identity and size. */
function resizeLane(lane: LaneConfig, pairCount: number, kind: BoardKind): LaneConfig {
  const label = kind === "warm-up" ? "warm-up" : "board";
  return Object.freeze({
    ...lane,
    laneId: `${lane.laneId}-${label}`,
    title: `${lane.title} — ${label}`,
    pairCount,
  });
}

/**
 * The largest board this lane can deal while every card stays visible at once.
 *
 * A card is drawn at the box its lane was qualified at, so the board cannot shrink to fit a phone; the *board
 * size* gives way instead. Walking down from the lane's own pair count finds the largest deal whose grid fits the
 * viewport with no internal scrolling at the qualified box, which is the resolution of the conflict between
 * GAME-188's fit contract and GAME-187's coverage box: neither is weakened.
 *
 * The engine's own minimum is the floor, so a viewport that cannot host even that is a layout problem reported
 * elsewhere rather than an empty board.
 */
export function fittingPairCount(lane: LaneConfig, viewport: Viewport): number {
  for (let pairs = lane.pairCount; pairs > MIN_PAIR_COUNT; pairs -= 1) {
    const layout = planBoardLayout({
      viewport,
      cardCount: pairs * 2,
      fixedCardCssPx: lane.cardBox.width,
    });
    if (layout.fitsWithoutScrolling && layout.problems.length === 0) return pairs;
  }
  return MIN_PAIR_COUNT;
}

/** The lane as one board kind deals it: the warm-up is smaller, the production board as large as fits. */
export function boardLaneFor(lane: LaneConfig, kind: BoardKind, viewport: Viewport): LaneConfig {
  if (kind === "warm-up") return warmUpLaneFor(lane);
  return resizeLane(lane, fittingPairCount(lane, viewport), kind);
}

/** Why a warm-up lane could not be dealt, in the lane layer's own terms. Empty means it can. */
export function warmUpLaneProblems(productionLane: LaneConfig): readonly string[] {
  const warmUp = warmUpLaneFor(productionLane);
  return Object.freeze(isSatisfiableLane(warmUp) ? [] : ["the warm-up lane is not satisfiable"]);
}

/**
 * Deal a board.
 *
 * The lane is the content authority and the lane planner is the board authority, so this function adds nothing
 * of its own: it delegates the deal and freezes the result into the board value the shell renders.
 */
export function planBoard(kind: BoardKind, lane: LaneConfig, seed: number): BoardPlan {
  return Object.freeze({
    kind,
    lane,
    seed,
    plan: planLaneDeck(lane, seed),
    facesVisible: kind === "warm-up",
    labelVisibility: lane.labelVisibility ?? "always",
  });
}

/** The instruction line for a board. One bounded sentence, and never a rulebook. */
export function instructionFor(board: BoardPlan | null): string {
  if (board === null) return "Choose a grade to begin.";
  return board.facesVisible
    ? "Every card is showing. Pick two cards that show the same amount."
    : "Pick two cards that show the same amount.";
}

/** How a card projects right now, or null when the board has no such card. */
export function cardStateOfBoard(session: GameSession, cardIndex: number): CardState | null {
  const state = session.state;
  if (state === null) return null;
  if (state.cards[cardIndex] === undefined) return null;
  return cardStateOf(state, cardIndex);
}

/** Whether `select-card` would do anything. Presentation asks; the engine decides. */
export function canSelectCard(session: GameSession, cardIndex: number): boolean {
  const state = session.state;
  if (state === null) return false;
  return isCardSelectable(state, cardIndex);
}

/** How many pairs are left on the current board, or 0 when nothing is dealt. */
export function pairsRemaining(session: GameSession): number {
  return session.state === null ? 0 : remainingPairCount(session.state);
}

/** How many pairs the current board was dealt with, straight from the plan. */
export function boardPairCount(session: GameSession): number {
  return session.board === null ? 0 : session.board.plan.pairs.length;
}

/** One card of the current board, placed at the index the engine addresses it by. */
export type PlacedBoardCard = {
  readonly cardIndex: number;
  readonly card: LaneCardPlan;
};

/**
 * The board's cards, in the engine's own order.
 *
 * The lane planner groups its cards by pair (`plan.cards`), which is the order a *fixture* wants and the wrong
 * order for a board: the engine addresses cards by their position in the deck, so rendering the plan's order
 * would put the wrong picture under every index. The two are joined on `cardId`, which `assertLanePlanInvariants`
 * has already proved is one-to-one with the deck.
 */
export function boardCardsInEngineOrder(session: GameSession): readonly PlacedBoardCard[] {
  const state = session.state;
  const plan = session.board?.plan;
  if (state === null || plan === undefined) return Object.freeze([]);

  const indexByCardId = new Map<string, number>();
  state.cards.forEach((deckCard, index) => indexByCardId.set(deckCard.cardId, index));

  const placed: PlacedBoardCard[] = [];
  for (const card of plan.cards) {
    const cardIndex = indexByCardId.get(card.cardId);
    if (cardIndex !== undefined) placed.push(Object.freeze({ cardIndex, card }));
  }
  placed.sort((left, right) => left.cardIndex - right.cardIndex);
  return Object.freeze(placed);
}

/**
 * What a card shows, given the engine's state and the lane's scaffolding.
 *
 * Two separate questions, answered separately because they are genuinely different:
 * - is the *value* on display? The warm-up shows every face; a production board shows a face only when the
 *   engine says the card is revealed or matched.
 * - is the *label* printed? A lane's `labelVisibility` is its scaffolding setting, so `on-reveal` withholds
 *   the words until a card is turned over even where the geometry is showing.
 *
 * A hidden production card is answered `false` for both, which is what stops an unrevealed value reaching the
 * DOM, the accessible name or a `data-` attribute.
 */
export function valueVisibilityFor(
  session: GameSession,
  cardState: CardState,
): { readonly valueVisible: boolean; readonly labelVisible: boolean } {
  const facesVisible = session.board?.facesVisible === true;
  const labelVisibility = session.board?.labelVisibility ?? "always";

  const revealedToTheEngine = cardState !== "hidden";
  const valueVisible = facesVisible || revealedToTheEngine;
  const labelVisible = valueVisible && labelVisibility !== "never" && (labelVisibility === "always" || revealedToTheEngine);

  return Object.freeze({ valueVisible, labelVisible });
}

function withEngineState(session: GameSession, state: GameState): GameSession {
  if (!isGameComplete(state)) return Object.freeze({ ...session, state });
  return Object.freeze({
    ...session,
    state,
    stage: "board-complete",
    completedBoards: session.completedBoards + 1,
  });
}

function dispatch(session: GameSession, action: GameAction): GameSession {
  const state = session.state;
  if (state === null) return session;
  return withEngineState(session, applyAction(state, action).state);
}

function dealInto(session: GameSession, kind: BoardKind, lane: LaneConfig, seed: number): GameSession {
  const board = planBoard(kind, lane, seed);
  return Object.freeze({
    ...session,
    stage: "instruction",
    board,
    state: createGameState(board.plan.deck),
  });
}

/**
 * Apply one intent.
 *
 * Total and pure: an intent that does not apply to the current stage returns the session unchanged rather than
 * throwing, because a mis-ordered UI event is not a programme error.
 */
export function applyIntent(session: GameSession, intent: GameIntent): GameSession {
  switch (intent.type) {
    case "choose-grade": {
      const productionLane = productionLaneFor(intent.gradeBand);
      return dealInto(
        Object.freeze({ ...session, gradeBand: intent.gradeBand, completedBoards: 0 }),
        "warm-up",
        boardLaneFor(productionLane, "warm-up", intent.viewport),
        intent.seed,
      );
    }

    case "begin-board":
      return session.stage === "instruction" ? Object.freeze({ ...session, stage: "board" }) : session;

    case "select-card":
      return session.stage === "board"
        ? dispatch(session, { type: "select-card", cardIndex: intent.cardIndex })
        : session;

    case "acknowledge-comparison":
      return session.stage === "board"
        ? dispatch(session, { type: "acknowledge-comparison" })
        : session;

    case "reset-board": {
      const board = session.board;
      if (board === null) return session;
      return Object.freeze({
        ...dealInto(session, board.kind, board.lane, board.seed),
        stage: "board",
      });
    }

    case "next-board": {
      const gradeBand = session.gradeBand;
      if (gradeBand === null) return session;
      const nextKind: BoardKind = session.board?.kind === "warm-up" ? "production-board" : "warm-up";
      const lane = boardLaneFor(productionLaneFor(gradeBand), nextKind, intent.viewport);
      return dealInto(session, nextKind, lane, intent.seed);
    }

    case "end-session":
      return createSession();
  }
}

/**
 * The production board size the shell aims for, as a fact rather than a promise.
 *
 * Grades 4 and 5 deal it; grade 3's reviewed catalogue deals a smaller board, and the shell does not inflate a
 * grade's content to reach a number. Exported so a test can state which grades reach it.
 */
export const SHELL_PRODUCTION_PAIR_COUNT = PRODUCTION_PAIR_COUNT;
