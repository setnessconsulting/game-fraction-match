/**
 * Debug shell: the GAME-185 foundation board plus the GAME-186/187/188 inspection surfaces.
 *
 * This is deliberately NOT the product. Since GAME-189 the shipped root is the playable game, and this shell
 * lives behind `#debug` so the artefacts each earlier story qualified — the representation gallery, the lane
 * panel and the design panel — stay inspectable in a browser without being the first thing a learner sees.
 *
 * What it still proves, and why it is worth keeping reachable:
 *
 * - the built artifact boots as a standalone document;
 * - React only *projects* engine state and dispatches engine actions;
 * - every visibility and legality decision comes from the engine
 *   (`cardStateOf`, `isCardSelectable`, `applyAction`), never from the shell;
 * - a deck is reproducible from a seed, and the seed comes from outside the engine.
 *
 * Hidden cards render no value at all, not even a hint, so nothing about an unrevealed card leaks into the DOM.
 */

import { useCallback, useState } from "react";

import {
  PRODUCTION_PAIR_COUNT,
  applyAction,
  cardStateOf,
  createDeck,
  createGameState,
  isCardSelectable,
  isGameComplete,
  remainingPairCount,
  type GameState,
} from "../engine";
import { FOUNDATION_DEBUG_SEED, FOUNDATION_FAMILIES } from "./foundationFixture";
import { RepresentationGallery } from "./RepresentationGallery";
import { LanePanel } from "./LanePanel";
import { DesignPanel } from "./DesignPanel";

type FoundationSession = {
  readonly seed: number;
  readonly state: GameState;
};

/** Deal a fresh session for a seed. This is the only place a deck is created. */
function createFoundationSession(seed: number): FoundationSession {
  const deck = createDeck({
    pairCount: PRODUCTION_PAIR_COUNT,
    seed,
    families: FOUNDATION_FAMILIES,
  });
  return { seed, state: createGameState(deck) };
}

/** Sample production entropy in the shell, never in the engine, and hand the number over as data. */
function sampleEntropySeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? FOUNDATION_DEBUG_SEED;
}

function phaseCopy(state: GameState): string {
  if (isGameComplete(state)) return "Board complete.";
  if (state.pendingComparison !== null) return "Those two are not the same amount. Continue to clear them.";
  if (state.revealedCardIndexes.length === 1) return "Pick a second card.";
  return "Pick a card.";
}

export function DebugShell() {
  const [session, setSession] = useState<FoundationSession>(() => createFoundationSession(FOUNDATION_DEBUG_SEED));
  const { state } = session;

  const handleSelect = useCallback((cardIndex: number) => {
    setSession((current) => ({
      ...current,
      state: applyAction(current.state, { type: "select-card", cardIndex }).state,
    }));
  }, []);

  const handleAcknowledge = useCallback(() => {
    setSession((current) => ({
      ...current,
      state: applyAction(current.state, { type: "acknowledge-comparison" }).state,
    }));
  }, []);

  const handleResetSameSeed = useCallback(() => {
    setSession((current) => createFoundationSession(current.seed));
  }, []);

  const handleNewSeed = useCallback(() => {
    setSession(createFoundationSession(sampleEntropySeed()));
  }, []);

  return (
    <main className="page-shell" data-testid="debug-shell">
      <div className="shell">
        <header className="shell-header">
          <p className="eyebrow">GAME-97 · GAME-185 engine · GAME-186 primitives · debug</p>
          <h1>Fraction Match</h1>
          <p className="lede">
            Debug surface. The playable game is at the root of this page; everything below exists so each
            earlier story&rsquo;s artefact stays inspectable and qualified in a browser. This is not the game
            board.
          </p>
        </header>

        <section className="panel" aria-labelledby="foundation-heading">
          <h2 id="foundation-heading">Foundation status</h2>
          {/*
            Plain spans rather than <output>: a debug surface should not create a live region per counter. The
            single announceable outcome path is the phase status line below.
          */}
          <ul className="status-list">
            <li>Engine: canonical rational values, seeded deck generation, pure state machine</li>
            <li>
              Seed: <span className="status-value" data-testid="seed">{session.seed}</span>
            </li>
            <li>
              Cards: <span className="status-value" data-testid="card-count">{state.cards.length}</span>
            </li>
            <li>
              Moves: <span className="status-value" data-testid="moves">{state.moves}</span>
            </li>
            <li>
              Matched pairs:{" "}
              <span className="status-value" data-testid="matched-pairs">
                {state.matchedCardIndexes.length / 2}
              </span>
            </li>
            <li>
              Pairs remaining:{" "}
              <span className="status-value" data-testid="pairs-remaining">
                {remainingPairCount(state)}
              </span>
            </li>
            <li>
              Board: <span className="status-value" data-testid="game-status">{state.status}</span>
            </li>
          </ul>
          <div className="controls">
            <button type="button" onClick={handleResetSameSeed}>
              Reset board (same seed)
            </button>
            <button type="button" onClick={handleNewSeed}>
              New seed
            </button>
          </div>
          <p className="status-line" role="status" data-testid="phase">
            {phaseCopy(state)}
          </p>
        </section>

        <section className="panel" aria-labelledby="board-heading">
          <h2 id="board-heading">Foundation smoke board</h2>
          <p className="microcopy">
            Debug surface only. Unstyled buttons prove the engine drives the UI. The representation primitives
            are shown in the gallery below.
          </p>
          <ul className="board" data-testid="board">
            {state.cards.map((card, cardIndex) => {
              const cardState = cardStateOf(state, cardIndex);
              return (
                <li key={card.cardId}>
                  <button
                    type="button"
                    className="card"
                    data-testid="card"
                    data-card-state={cardState}
                    disabled={!isCardSelectable(state, cardIndex)}
                    onClick={() => handleSelect(cardIndex)}
                  >
                    {cardState === "hidden" ? "?" : `${card.form.numerator}/${card.form.denominator}`}
                  </button>
                </li>
              );
            })}
          </ul>
          {state.pendingComparison === null ? null : (
            <button type="button" className="continue" data-testid="acknowledge" onClick={handleAcknowledge}>
              Continue
            </button>
          )}
        </section>

        <RepresentationGallery />

        <LanePanel />

        <DesignPanel />

        <footer className="shell-footer">
          <span>Session-only, memory-only play.</span>
          <span>No accounts, no cookies, no storage, no telemetry, no gameplay network requests.</span>
        </footer>
      </div>
    </main>
  );
}
