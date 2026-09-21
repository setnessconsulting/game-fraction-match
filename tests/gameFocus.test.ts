import { describe, expect, it } from "vitest";

import { applyAction, createDeck, createGameState } from "../src/engine";
import type { GameState } from "../src/engine";
import {
  GRID_KEYS,
  focusAnchorIndex,
  isGridKey,
  nextFocusIndex,
  rovingTabIndexes,
  rowCountOf,
} from "../src/game";
import { FOUNDATION_FAMILIES } from "../src/app/foundationFixture";

/**
 * The focus model, tested as arithmetic.
 *
 * A grid a learner walks has to answer "where does focus go" the same way twice, and it has to keep answering it
 * after the engine moves underneath. Everything here is a pure function of `(state, key, grid)`, which is why it
 * can be tested without a DOM and then measured in a browser.
 */

function freshState(): GameState {
  return createGameState(createDeck({ pairCount: 4, seed: 909, families: FOUNDATION_FAMILIES }));
}

/** Select two cards that do not match, leaving the engine holding a pending comparison. */
function mismatchedState(state: GameState): GameState {
  const keyOf = (index: number): string =>
    `${state.cards[index]!.form.canonical.numerator}/${state.cards[index]!.form.canonical.denominator}`;

  const first = applyAction(state, { type: "select-card", cardIndex: 0 }).state;
  const different = first.cards.findIndex((_, index) => index > 0 && keyOf(index) !== keyOf(0));
  return applyAction(first, { type: "select-card", cardIndex: different }).state;
}

/** Match the pair holding card 0, so one pair leaves play. */
function onePairMatchedState(state: GameState): GameState {
  const keyOf = (index: number): string =>
    `${state.cards[index]!.form.canonical.numerator}/${state.cards[index]!.form.canonical.denominator}`;

  const first = applyAction(state, { type: "select-card", cardIndex: 0 }).state;
  const partner = first.cards.findIndex((_, index) => index > 0 && keyOf(index) === keyOf(0));
  return applyAction(first, { type: "select-card", cardIndex: partner }).state;
}

describe("grid keys", () => {
  it("handles exactly the arrows, Home and End", () => {
    expect([...GRID_KEYS]).toEqual(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);
    for (const key of GRID_KEYS) expect(isGridKey(key)).toBe(true);
    for (const key of ["Tab", "Enter", " ", "Escape", "a", "ArrowUpLeft"]) expect(isGridKey(key)).toBe(false);
  });
});

describe("rows", () => {
  it("rounds up, and reports nothing for an empty or columnless grid", () => {
    expect(rowCountOf({ columns: 4, cardCount: 16 })).toBe(4);
    expect(rowCountOf({ columns: 4, cardCount: 8 })).toBe(2);
    expect(rowCountOf({ columns: 4, cardCount: 6 })).toBe(2);
    expect(rowCountOf({ columns: 3, cardCount: 16 })).toBe(6);
    expect(rowCountOf({ columns: 0, cardCount: 16 })).toBe(0);
    expect(rowCountOf({ columns: 4, cardCount: 0 })).toBe(0);
  });
});

describe("the focus anchor follows the engine", () => {
  it("sits on the first card the engine still lets you pick", () => {
    expect(focusAnchorIndex(freshState(), 8)).toBe(0);
  });

  it("moves off a card that can no longer be played", () => {
    const matched = onePairMatchedState(freshState());
    const anchor = focusAnchorIndex(matched, 8);

    // Cards 0 and its partner are matched, so the anchor must have left card 0 behind.
    expect(anchor).not.toBe(0);
    expect(anchor).toBeGreaterThan(0);
  });

  it("still answers while a comparison is pending, when nothing is selectable", () => {
    const pending = mismatchedState(freshState());
    const anchor = focusAnchorIndex(pending, 8);
    expect(anchor).toBeGreaterThanOrEqual(0);
    expect(anchor).toBeLessThan(8);
  });

  it("is total for an empty board", () => {
    expect(focusAnchorIndex(freshState(), 0)).toBe(0);
  });
});

describe("moving focus", () => {
  const grid = { columns: 4, cardCount: 16 };

  it("steps within a row and stops at the row's edges instead of wrapping", () => {
    expect(nextFocusIndex(0, "ArrowRight", grid)).toBe(1);
    expect(nextFocusIndex(3, "ArrowRight", grid)).toBe(3);
    expect(nextFocusIndex(0, "ArrowLeft", grid)).toBe(0);
    expect(nextFocusIndex(5, "ArrowLeft", grid)).toBe(4);
  });

  it("keeps the column when stepping rows, and stops at the top and bottom", () => {
    expect(nextFocusIndex(1, "ArrowDown", grid)).toBe(5);
    expect(nextFocusIndex(6, "ArrowUp", grid)).toBe(2);
    expect(nextFocusIndex(1, "ArrowUp", grid)).toBe(1);
    expect(nextFocusIndex(13, "ArrowDown", grid)).toBe(13);
  });

  it("does not step down into a missing cell on a ragged last row", () => {
    const ragged = { columns: 4, cardCount: 6 };
    // Index 1's neighbour below is index 5, which exists, so it is reached.
    expect(nextFocusIndex(1, "ArrowDown", ragged)).toBe(5);
    // Indexes 2 and 3 have no cell below them at all.
    expect(nextFocusIndex(2, "ArrowDown", ragged)).toBe(2);
    expect(nextFocusIndex(3, "ArrowDown", ragged)).toBe(3);
    expect(nextFocusIndex(0, "ArrowDown", ragged)).toBe(4);
  });

  it("does not step right into a missing cell either", () => {
    const ragged = { columns: 4, cardCount: 6 };
    expect(nextFocusIndex(5, "ArrowRight", ragged)).toBe(5);
    expect(nextFocusIndex(4, "ArrowRight", ragged)).toBe(5);
  });

  it("jumps to the ends of the current row", () => {
    expect(nextFocusIndex(6, "Home", grid)).toBe(4);
    expect(nextFocusIndex(6, "End", grid)).toBe(7);
    expect(nextFocusIndex(4, "Home", grid)).toBe(4);
    // End stops at the current row's last real cell, not at the board's last cell.
    expect(nextFocusIndex(2, "End", { columns: 4, cardCount: 6 })).toBe(3);
    expect(nextFocusIndex(5, "End", { columns: 4, cardCount: 6 })).toBe(5);
    expect(nextFocusIndex(5, "Home", { columns: 4, cardCount: 6 })).toBe(4);
  });

  it("reflows with the board: one column means the vertical keys are the only movement", () => {
    const single = { columns: 1, cardCount: 4 };
    expect(nextFocusIndex(0, "ArrowDown", single)).toBe(1);
    expect(nextFocusIndex(1, "ArrowUp", single)).toBe(0);
    expect(nextFocusIndex(1, "ArrowRight", single)).toBe(1);
    expect(nextFocusIndex(1, "ArrowLeft", single)).toBe(1);
    expect(nextFocusIndex(1, "Home", single)).toBe(1);
    expect(nextFocusIndex(1, "End", single)).toBe(1);
  });

  it("clamps rather than escaping, for a stale index or an empty board", () => {
    expect(nextFocusIndex(99, "ArrowUp", grid)).toBe(15 - 4);
    expect(nextFocusIndex(-5, "ArrowRight", grid)).toBe(1);
    expect(nextFocusIndex(3, "ArrowRight", { columns: 4, cardCount: 0 })).toBe(0);
  });

  it("is deterministic: the same question always gives the same answer", () => {
    for (const key of GRID_KEYS) {
      for (let index = 0; index < grid.cardCount; index += 1) {
        expect(nextFocusIndex(index, key, grid)).toBe(nextFocusIndex(index, key, grid));
      }
    }
  });
});

describe("roving tabindex", () => {
  it("puts exactly one card in the tab order, on the engine's anchor", () => {
    const state = freshState();
    const indexes = rovingTabIndexes(state, { columns: 4, cardCount: 8 });

    expect(indexes).toHaveLength(8);
    expect(indexes.filter((value) => value === 0)).toHaveLength(1);
    expect(indexes.indexOf(0)).toBe(focusAnchorIndex(state, 8));
    expect(indexes.filter((value) => value === -1)).toHaveLength(7);
  });

  it("moves the anchor when a pair leaves play", () => {
    const matched = onePairMatchedState(freshState());
    const indexes = rovingTabIndexes(matched, { columns: 4, cardCount: 8 });
    expect(indexes.indexOf(0)).toBeGreaterThan(0);
  });

  it("is empty for an empty grid", () => {
    expect(rovingTabIndexes(freshState(), { columns: 4, cardCount: 0 })).toEqual([]);
  });
});
