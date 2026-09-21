/**
 * GAME-188 design reference surface.
 *
 * This is a design surface, not the game board. GAME-189 owns the semantic board and binds the real engine
 * intents; what this panel does is make the design authority *measurable*, so the fit contract is proved in a
 * browser instead of asserted in a document:
 *
 * - it renders the planned board for the *current* viewport by calling `planBoardLayout`, and writes the
 *   plan's own numbers into the custom properties the stylesheet consumes, so CSS cannot disagree with the
 *   arithmetic that produced it;
 * - it renders one card in every colour-independent state, so `tests/e2e/designSystem.spec.ts` can measure
 *   boundary style and width rather than trusting a colour swatch;
 * - it prints the token contract, the state inventory and the motion bounds, so a reviewer can read the
 *   authority from the artifact that ships rather than from a document that might have drifted.
 *
 * The panel holds no game state and computes no mathematics. It reads `window.innerWidth` to know which
 * viewport it is being rendered at, which is a presentation fact rather than a game one.
 */

import { useEffect, useState } from "react";

import {
  BASE_VIEWPORTS,
  CELEBRATION_MAX_DURATION_MS,
  CELEBRATION_SKIP_WITHIN_MS,
  DESIGN_PALETTE,
  DESIGN_STATES,
  MIN_LEGIBLE_CARD_CSS_PX,
  MIN_TOUCH_TARGET_CSS_PX,
  MOTION_SPECS,
  REQUIRED_CONTRAST_PAIRS,
  planBoardLayout,
} from "../design";

/** The number of cards a production board deals: 8 pairs. Mirrors `PRODUCTION_PAIR_COUNT`. */
const PRODUCTION_CARD_COUNT = 16;

/** Every colour-independent state, in the order the story lists them, with a deterministic sample index. */
const SAMPLE_STATES = Object.freeze([
  Object.freeze({ state: "hidden", marker: "?", sample: "2/4" }),
  Object.freeze({ state: "revealed", marker: "1", sample: "1/2" }),
  Object.freeze({ state: "matched", marker: "=", sample: "3/6" }),
]);

/**
 * Assign a deterministic state to each of the 16 production cards so every designed state appears at least
 * once. Index-based on purpose: the same board every render, so a browser measurement is comparable.
 */
function stateForIndex(index: number): string {
  if (index % 7 === 6) return "matched";
  if (index % 5 === 4) return "revealed";
  return "hidden";
}

function viewportWidth(): number {
  return typeof window === "undefined" ? BASE_VIEWPORTS[0]!.width : window.innerWidth;
}

export function DesignPanel() {
  const [width, setWidth] = useState(viewportWidth);

  useEffect(() => {
    const onResize = () => setWidth(viewportWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const layout = planBoardLayout({
    viewport: { width, height: typeof window === "undefined" ? 800 : window.innerHeight },
    cardCount: PRODUCTION_CARD_COUNT,
  });

  const boardStyle = {
    "--fm-board-columns": String(layout.columns),
    "--fm-card-size": `${layout.cardCssPx}px`,
    "--fm-board-gap": `${layout.gapCssPx}px`,
  } as React.CSSProperties;

  return (
    <section className="panel design-panel" aria-labelledby="design-heading" data-testid="design-panel">
      <h2 id="design-heading">Design authority (GAME-188)</h2>
      <p className="design-authority" data-testid="design-authority">
        FALLBACK / FIGMA NOT QUALIFIED
      </p>
      <p className="design-note">
        This checked-in specification is the design authority. A persistent Figma fileKey is preferred by the
        story and does not exist for this project, so the label above stays until one does. No Figma evidence
        is claimed anywhere in this repository.
      </p>

      <h3>Planned production board</h3>
      <p className="design-note" data-testid="design-layout">
        Viewport {width}px &middot; {layout.layoutClass} &middot; {layout.columns} columns &times;{" "}
        {layout.rows} rows &middot; card {layout.cardCssPx}px &middot; gap {layout.gapCssPx}px &middot; board{" "}
        {layout.boardWidthCssPx}&times;{layout.boardHeightCssPx}px &middot;{" "}
        {layout.fitsWithoutScrolling ? "fits without scrolling" : "page scroll"}
      </p>
      <p className="design-note">
        Card floor {MIN_LEGIBLE_CARD_CSS_PX}px (GAME-186 legibility) &middot; target floor{" "}
        {MIN_TOUCH_TARGET_CSS_PX}px (touch).
      </p>

      <ul className="fm-board" data-testid="design-board" data-comparison="pending" style={boardStyle}>
        {Array.from({ length: PRODUCTION_CARD_COUNT }, (_, index) => {
          const state = stateForIndex(index);
          return (
            <li className="fm-board__item" key={index}>
              <div
                className="fm-board__card"
                data-testid="design-card"
                data-card-state={state}
                data-card-index={index}
              >
                {state === "hidden" ? (
                  <span className="fm-board__marker" aria-hidden="true">
                    ?
                  </span>
                ) : (
                  <span className="fm-board__stamp">{index % 5 === 4 ? "1/2" : "3/6"}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h3>Colour-independent card states</h3>
      <p className="design-note">
        These five are distinguishable without colour: boundary style, boundary width and a marker glyph carry
        the state, and colour only reinforces it.
      </p>
      <ul className="fm-board design-sample-board" data-testid="design-state-board" style={boardStyle}>
        {SAMPLE_STATES.map((sample) => (
          <li className="fm-board__item" key={sample.state}>
            <div className="fm-board__card" data-card-state={sample.state} data-testid="design-state-card">
              <span className="fm-board__marker">{sample.marker}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="fm-board__explanation" data-feedback="explaining" data-testid="design-explanation">
        Explaining slot: reserved below the pair so GAME-190&rsquo;s explanation never covers a card.
      </p>

      <h3>Tokens and contrast floors</h3>
      <ul className="design-token-list" data-testid="design-tokens">
        {REQUIRED_CONTRAST_PAIRS.map((pair) => (
          <li key={pair.id}>
            <code>{pair.id}</code>: <code>{pair.foreground}</code> on <code>{pair.background}</code> at{" "}
            {pair.minimum}:1 or better
          </li>
        ))}
      </ul>

      <h3>Required states ({DESIGN_STATES.length})</h3>
      <ul className="design-state-list" data-testid="design-states">
        {DESIGN_STATES.map((state) => (
          <li key={state.id} data-state-id={state.id}>
            <code>{state.selector.attribute}</code>=<code>{state.selector.value}</code> &mdash; {state.label}
          </li>
        ))}
      </ul>

      <h3>Motion bounds</h3>
      <ul className="design-motion-list" data-testid="design-motion">
        {MOTION_SPECS.map((spec) => (
          <li key={spec.kind}>
            <code>{spec.kind}</code>: {spec.durationMs}ms
            {spec.skippable ? " (skippable)" : ""} &mdash; fallback: {spec.nonMotionFallback}
          </li>
        ))}
        <li>
          Celebration ceiling {CELEBRATION_MAX_DURATION_MS}ms, skippable within {CELEBRATION_SKIP_WITHIN_MS}ms.
        </li>
      </ul>
      <p className="design-note">
        Motion is presentation only. Under reduced motion every duration collapses to zero and the outcomes are
        identical, so no information lives in a transition.
      </p>

      <h3>Theme sample</h3>
      <ul className="design-token-list" data-testid="design-palette">
        {Object.entries(DESIGN_PALETTE.light).map(([token, value]) => (
          <li key={token}>
            <span className="design-swatch" style={{ background: value }} aria-hidden="true" />{" "}
            <code>--fm-{token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}</code> {value}
          </li>
        ))}
      </ul>
    </section>
  );
}
