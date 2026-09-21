/**
 * The playable board (GAME-189).
 *
 * React renders engine state and emits typed intents. It does not compute a match, a legality or a pair count:
 * `cardStateOf`, `isCardSelectable` and `remainingPairCount` are asked, and `applyIntent` is told. The one
 * thing this component owns is *presentation* — the grid, the roving focus anchor and the state attributes
 * GAME-188 declared.
 *
 * THE CARD SIZE IS NOT THIS COMPONENT'S TO CHOOSE
 * Each card is drawn at the box its lane was qualified at, and the grid reflows its columns around that size.
 * Shrinking the picture to fit a phone would silently invalidate GAME-187's coverage proof — the families were
 * selected by measuring geometry at that box, and a smaller box is a different measurement.
 *
 * FOCUS IS DERIVED, THEN HANDED OVER
 * The anchor is computed from engine state (`focusAnchorIndex`), so it always lands somewhere playable; arrow
 * keys then move DOM focus, and the component remembers where it went. When the engine moves underneath — a
 * card matches — a reconciliation effect puts focus back on the engine's anchor rather than leaving it on a
 * card nobody can pick.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { planBoardLayout, type BoardLayout, type Viewport } from "../design";
import { RepresentationByFamily, accessibilityLabelFor } from "../representations";
import {
  boardCardsInEngineOrder,
  boardPairCount,
  canSelectCard,
  cardStateOfBoard,
  pairsRemaining,
  valueVisibilityFor,
  type BoardPlan,
  type GameIntent,
  type GameSession,
} from "./session";
import { focusAnchorIndex, isGridKey, nextFocusIndex, rovingTabIndexes } from "./focus";

/** Where the shell learns the viewport from. Presentation facts only; the engine knows none of this. */
export function useBoardLayout(plan: BoardPlan | null): BoardLayout {
  const cardCount = plan?.plan.cards.length ?? 0;
  const cardBox = plan?.lane.cardBox ?? { width: 0, height: 0 };
  const [viewport, setViewport] = useState(() => readViewport());

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return planBoardLayout({
    viewport,
    cardCount: cardCount > 0 ? cardCount : 16,
    fixedCardCssPx: cardBox.width > 0 ? cardBox.width : undefined,
  });
}

/**
 * Failure injection for the calm-recovery qualification.
 *
 * This story has to prove that a render failure reaches a usable surface rather than a stack trace, and the only
 * way to prove it in a browser is to cause one. The trigger is an exact hash no learner can produce, it is
 * inert unless that hash is present, and it exists solely so `tests/e2e/gameBoard.spec.ts` can assert the
 * recovery path instead of asserting that the code looks like it would work.
 */
export const BOARD_FAILURE_HASH = "#board-error-qualification";

export function failureInjected(): boolean {
  return typeof window !== "undefined" && window.location.hash === BOARD_FAILURE_HASH;
}

function readViewport(): { readonly width: number; readonly height: number } {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function fractionLabelOf(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

export function Board({
  session,
  onIntent,
}: {
  readonly session: GameSession;
  readonly onIntent: (intent: GameIntent) => void;
}) {
  const state = session.state;
  const board = session.board;
  const layout = useBoardLayout(board);
  const placedCards = boardCardsInEngineOrder(session);
  const cardCount = placedCards.length;
  const grid = { columns: layout.columns, cardCount };

  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const anchor = state === null ? 0 : focusAnchorIndex(state, cardCount);
  const tabIndexes = state === null ? [] : rovingTabIndexes(state, grid);

  // Reconciliation: the engine moved under the learner's focus, so put focus back on something playable.
  useEffect(() => {
    if (state === null || cardCount === 0) return;
    if (activeIndex < cardCount && tabIndexes[activeIndex] === 0) return;
    setActiveIndex(anchor);
  }, [state, activeIndex, anchor, cardCount, tabIndexes]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!isGridKey(event.key)) return;
      event.preventDefault();
      const next = nextFocusIndex(activeIndex, event.key, grid);
      setActiveIndex(next);
      cardRefs.current[next]?.focus();
    },
    [activeIndex, grid.columns, grid.cardCount],
  );

  if (state === null || board === null) return null;

  if (failureInjected()) {
    throw new Error("board render failure injected by the recovery qualification");
  }

  const pendingComparison = state.pendingComparison;
  const complete = session.stage === "board-complete";

  return (
    <section
      className="game-board"
      aria-labelledby="game-board-heading"
      data-testid="game-board"
      data-board-kind={board.kind}
      data-lane-id={board.lane.laneId}
      data-seed={board.seed}
      data-card-count={cardCount}
      data-pair-count={boardPairCount(session)}
      data-card-size={board.lane.cardBox.width}
      data-faces-visible={String(board.facesVisible)}
      data-label-visibility={board.labelVisibility}
      data-layout-columns={layout.columns}
      data-fits-without-scrolling={String(layout.fitsWithoutScrolling)}
      data-comparison={pendingComparison === null ? undefined : "pending"}
    >
      <h2 id="game-board-heading" className="game-board__heading">
        {board.kind === "warm-up" ? "Warm-up" : "Board"}
      </h2>

      <ul className="fm-progress" data-testid="game-progress">
        <li>
          Moves: <span className="fm-progress__value" data-testid="game-moves">{state.moves}</span>
        </li>
        <li>
          Pairs left: <span className="fm-progress__value" data-testid="game-pairs-left">{pairsRemaining(session)}</span>
        </li>
        <li>
          Matched:{" "}
          <span className="fm-progress__value" data-testid="game-matched">
            {state.matchedCardIndexes.length / 2}
          </span>
        </li>
      </ul>

      <ul
        className="fm-board"
        data-testid="game-cards"
        style={
          {
            "--fm-board-columns": String(layout.columns),
            "--fm-card-size": `${layout.cardCssPx}px`,
            "--fm-board-gap": `${layout.gapCssPx}px`,
          } as React.CSSProperties
        }
      >
        {placedCards.map(({ cardIndex, card }) => {
          const cardState = cardStateOfBoard(session, cardIndex) ?? "hidden";
          const { valueVisible, labelVisible } = valueVisibilityFor(session, cardState);
          const selectable = !complete && canSelectCard(session, cardIndex);
          const name = valueVisible
            ? `${accessibilityLabelFor({ family: card.representation, fraction: card.form, whole: card.whole })}` +
              (cardState === "matched" ? " (matched)" : cardState === "revealed" ? " (selected)" : "")
            : "Hidden card";

          return (
            <li className="fm-board__item" key={card.cardId}>
              <button
                type="button"
                ref={(element) => {
                  cardRefs.current[cardIndex] = element;
                }}
                className="fm-board__card game-card"
                data-testid="game-card"
                data-card-index={cardIndex}
                data-card-state={cardState}
                data-representation={card.representation}
                data-value-visible={String(valueVisible)}
                data-fraction={valueVisible ? fractionLabelOf(card.form.numerator, card.form.denominator) : undefined}
                aria-label={name}
                tabIndex={tabIndexes[cardIndex] ?? -1}
                disabled={!selectable}
                onKeyDown={handleKeyDown}
                onClick={() => onIntent({ type: "select-card", cardIndex })}
              >
                {valueVisible ? (
                  <RepresentationByFamily
                    family={card.representation}
                    fraction={card.form}
                    whole={card.whole}
                    box={board.lane.cardBox}
                  />
                ) : (
                  <span className="fm-board__marker" aria-hidden="true">
                    ?
                  </span>
                )}
              </button>
              {/*
                The stated value sits *outside* the card, not inside it: the card is a fixed square at the box its
                lane was qualified at, so a label inside it would either overflow the box or scale the picture
                down — and scaling the picture down is exactly what the qualification forbids.
              */}
              {labelVisible ? (
                <span className="game-card__label" data-testid="game-card-label">
                  {fractionLabelOf(card.form.numerator, card.form.denominator)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {pendingComparison === null ? null : (
        // A pending comparison only ever exists for a mismatch: the engine resolves a match immediately and
        // retains the pair, so there is no "match awaiting acknowledgement" state to branch on. The words are
        // deliberately factual and short — GAME-190 owns the explanatory classifier and the copy register.
        <div className="fm-board__explanation" data-feedback="mismatch" data-testid="game-explanation">
          <p>
            Those two are not the same amount.{" "}
            <span className="design-note">Continue to clear them and keep looking.</span>
          </p>
          <button
            type="button"
            data-testid="game-acknowledge"
            onClick={() => onIntent({ type: "acknowledge-comparison" })}
          >
            Continue
          </button>
        </div>
      )}

      <div className="controls" data-testid="game-actions">
        <button type="button" data-testid="game-reset" onClick={() => onIntent({ type: "reset-board" })}>
          Reset board
        </button>
        {complete ? (
          <button
            type="button"
            data-testid="game-next-board"
            onClick={() => onIntent({ type: "next-board", seed: nextSeed(), viewport: currentViewport() })}
          >
            Next board
          </button>
        ) : (
          <button
            type="button"
            data-testid="game-new-board"
            onClick={() => onIntent({ type: "next-board", seed: nextSeed(), viewport: currentViewport() })}
          >
            New board
          </button>
        )}
        <button type="button" data-testid="game-end-session" onClick={() => onIntent({ type: "end-session" })}>
          End session
        </button>
      </div>

      {complete ? (
        <p className="status-line" role="status" data-testid="game-board-complete">
          Board complete. {pairsRemaining(session)} pairs left. Nothing starts on its own — choose what comes next.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Sample production entropy in the shell, never in the engine, and hand the number over as data.
 *
 * Deliberately the only place a seed is invented: the engine takes seeds as data so that a seed fully explains
 * a board, and `crypto` lives here rather than in any layer that has to stay reproducible.
 */
export function nextSeed(): number {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") return 1;
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 1;
}

/**
 * The viewport as the shell sees it, handed to the session model as data.
 *
 * The session model is pure and cannot read a window, and the *board size* depends on how much room there is: a
 * card is drawn at its qualified box, so a smaller viewport deals fewer pairs rather than a smaller picture.
 * Sampling here keeps that decision in the pure model while the reading stays where reading is allowed.
 */
export function currentViewport(): Viewport {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}
