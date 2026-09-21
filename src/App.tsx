/**
 * Minimal foundation shell (GAME-185).
 *
 * This is deliberately NOT the Fraction Match product board. GAME-188 owns visual design, GAME-189
 * owns the semantic board UX, GAME-186 owns SVG representation primitives and GAME-190 owns
 * explanatory feedback. What this shell proves is narrower and more important:
 *
 * - the built artifact boots as a standalone document;
 * - React only *projects* engine state and dispatches engine actions;
 * - every visibility and legality decision comes from the engine
 *   (`cardStateOf`, `isCardSelectable`, `applyAction`), never from the shell;
 * - a deck is reproducible from a seed, and the seed comes from outside the engine.
 *
 * Hidden cards render no value at all, not even a hint, so nothing about an unrevealed card leaks
 * into the DOM.
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
} from "./engine";
import { FOUNDATION_DEBUG_SEED, FOUNDATION_FAMILIES } from "./app/foundationFixture";

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

/**
 * Sample production entropy in the shell, never in the engine, and hand the number over as data.
 */
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

export default function App() {
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
    <main className="page-shell">
      <div className="shell">
        <header className="shell-header">
          <p className="eyebrow">GAME-97 · GAME-185 foundation</p>
          <h1>Fraction Match</h1>
          <p className="lede">
            Deterministic fraction engine and standalone static artifact. This build is
            infrastructure — it is not the finished game board.
          </p>
        </header>

        <section className="panel" aria-labelledby="foundation-heading">
          <h2 id="foundation-heading">Foundation status</h2>
          <ul className="status-list">
            <li>Engine: canonical rational values, seeded deck generation, pure state machine</li>
            <li>
              Seed: <output data-testid="seed">{session.seed}</output>
            </li>
            <li>
              Cards: <output data-testid="card-count">{state.cards.length}</output>
            </li>
            <li>
              Moves: <output data-testid="moves">{state.moves}</output>
            </li>
            <li>
              Matched pairs:{" "}
              <output data-testid="matched-pairs">{state.matchedCardIndexes.length / 2}</output>
            </li>
            <li>
              Pairs remaining: <output data-testid="pairs-remaining">{remainingPairCount(state)}</output>
            </li>
            <li>
              Board: <output data-testid="game-status">{state.status}</output>
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
            Debug surface only. Unstyled buttons prove the engine drives the UI; production card art,
            fraction models and board UX belong to GAME-186, GAME-188 and GAME-189.
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

        <footer className="shell-footer">
          <span>Session-only, memory-only play.</span>
          <span>No accounts, no cookies, no storage, no telemetry, no gameplay network requests.</span>
        </footer>
      </div>
    </main>
  );
}
