/**
 * Deterministic focus model (GAME-189).
 *
 * A board of cards is a grid a learner walks with the keyboard, so "where does focus go" has to be an answer
 * rather than an accident of DOM order. This module is that answer, and it is pure: given the engine's state,
 * the grid shape and a key, it returns an index.
 *
 * ROVING TABINDEX
 * Exactly one card is in the tab order at a time — the *anchor*. Arrow keys move the anchor within the grid,
 * Home and End jump to the ends of a row, and Tab leaves the board entirely instead of walking sixteen cards.
 * That is the standard grid pattern, and it is why this is a model rather than a `ref` chain: the anchor has to
 * be derivable from state after every engine change, not remembered by the component that happened to be
 * mounted.
 *
 * THE ANCHOR FOLLOWS THE ENGINE
 * `focusAnchorIndex` prefers the first card the engine still lets you pick, so when the card that held focus
 * becomes matched, focus lands somewhere predictable and useful instead of on a card that can no longer be
 * played. It never returns a matched card while an unmatched one exists, and it is total for an empty board.
 */

import { cardStateOf, isCardSelectable, type GameState } from "../engine";

/** The arrow/Home/End keys the grid handles. */
export const GRID_KEYS = Object.freeze(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const);
export type GridKey = (typeof GRID_KEYS)[number];

export type FocusGrid = {
  readonly columns: number;
  readonly cardCount: number;
};

/** Whether a key is one the grid handles. */
export function isGridKey(key: string): key is GridKey {
  return (GRID_KEYS as readonly string[]).includes(key);
}

/**
 * The index focus should sit on.
 *
 * Order of preference: the first card the engine still allows selecting, then the first card that is not
 * matched, then the first card at all. Every step is derived from the engine, so the anchor cannot disagree
 * with what is playable.
 */
export function focusAnchorIndex(state: GameState, cardCount: number): number {
  for (let index = 0; index < cardCount; index += 1) {
    if (isCardSelectable(state, index)) return index;
  }
  for (let index = 0; index < cardCount; index += 1) {
    if (cardStateOf(state, index) !== "matched") return index;
  }
  return 0;
}

function clamp(index: number, cardCount: number): number {
  if (cardCount <= 0) return 0;
  return Math.min(Math.max(index, 0), cardCount - 1);
}

/** How many rows a grid of this shape has. */
export function rowCountOf(grid: FocusGrid): number {
  if (grid.columns <= 0) return 0;
  return Math.ceil(grid.cardCount / grid.columns);
}

/**
 * Where a key moves focus from `current`.
 *
 * Movement is geometric: left and right stay on the row, up and down keep the column, and at an edge the index
 * simply stays put rather than wrapping. Wrapping is what makes a grid disorienting to walk, and "stay put at
 * the edge" is a deterministic answer that leaves the boundary discoverable.
 *
 * `columns` is the *rendered* column count, which comes from GAME-188's layout plan, so a reflowed board moves
 * focus in the shape the learner can actually see.
 */
export function nextFocusIndex(current: number, key: GridKey, grid: FocusGrid): number {
  const { cardCount } = grid;
  if (cardCount <= 0) return 0;

  const columns = Math.max(1, grid.columns);
  const index = clamp(current, cardCount);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rows = rowCountOf({ columns, cardCount });
  const lastRow = rows - 1;

  switch (key) {
    case "ArrowLeft":
      return column === 0 ? index : index - 1;
    case "ArrowRight":
      return column === columns - 1 || index + 1 >= cardCount ? index : index + 1;
    case "ArrowUp":
      return row === 0 ? index : index - columns;
    case "ArrowDown": {
      if (row === lastRow) return index;
      const candidate = index + columns;
      return candidate >= cardCount ? index : candidate;
    }
    case "Home":
      return row * columns;
    case "End":
      return Math.min(row * columns + columns - 1, cardCount - 1);
  }
}

/**
 * The tab order for the whole grid.
 *
 * Returned as data so a browser test can assert it rather than infer it: exactly one `0`, everything else `-1`,
 * and it lands on the engine's anchor.
 */
export function rovingTabIndexes(state: GameState, grid: FocusGrid): readonly number[] {
  const anchor = focusAnchorIndex(state, grid.cardCount);
  return Object.freeze(
    Array.from({ length: grid.cardCount }, (_, index) => (index === anchor ? 0 : -1)),
  );
}
