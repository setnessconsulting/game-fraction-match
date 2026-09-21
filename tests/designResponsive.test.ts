import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCssBlocks } from "../scripts/lib/guardRules.mjs";
import {
  BASE_VIEWPORTS,
  BOARD_CHROME_CSS_PX,
  BOARD_GAP_CSS_PX,
  MIN_LEGIBLE_CARD_CSS_PX,
  MIN_TOUCH_TARGET_CSS_PX,
  SUPPORTED_ZOOM_LEVELS,
  fitsHorizontally,
  layoutClassFor,
  planBoardLayout,
  planBoardLayouts,
  preferredColumnsFor,
} from "../src/design";

/**
 * The responsive contract, proved rather than asserted.
 *
 * "The active 16-card production board fits 320x568 at 100% zoom" is arithmetic, so it is checked as
 * arithmetic here and then measured in a real browser by `tests/e2e/designSystem.spec.ts`. The two are
 * deliberately separate: this file proves the plan is right, the browser test proves the implementation
 * agrees with the plan.
 */

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const globalsCssPath = resolve(repositoryRoot, "src/app/globals.css");

const PRODUCTION_CARD_COUNT = 16;
const WARM_UP_CARD_COUNT = 8;

function tokenValue(source: string, selectorIncludes: string, token: string): string {
  for (const block of parseCssBlocks(source)) {
    if (!block.selector.includes(selectorIncludes)) continue;
    const declaration = block.declarations.find((candidate) => candidate.property === token);
    if (declaration !== undefined) return declaration.value;
  }
  throw new Error(`no declaration of ${token} found in a block matching "${selectorIncludes}"`);
}

describe("layout classes", () => {
  it("derives the class from width at the documented boundaries", () => {
    expect(layoutClassFor(320)).toBe("phone");
    expect(layoutClassFor(390)).toBe("phone");
    expect(layoutClassFor(599)).toBe("phone");
    expect(layoutClassFor(600)).toBe("tablet");
    expect(layoutClassFor(768)).toBe("tablet");
    expect(layoutClassFor(1023)).toBe("tablet");
    expect(layoutClassFor(1024)).toBe("desktop");
    expect(layoutClassFor(1280)).toBe("desktop");
  });

  it("tries a square-ish grid and snaps the production board to four columns", () => {
    expect(preferredColumnsFor(4)).toBe(2);
    expect(preferredColumnsFor(8)).toBe(4);
    expect(preferredColumnsFor(16)).toBe(4);
  });
});

describe("the 100% zoom fit contract", () => {
  it("fits the whole 16-card production board at every base viewport with no internal scrolling", () => {
    for (const { viewport, layout } of planBoardLayouts(PRODUCTION_CARD_COUNT)) {
      expect(layout.problems, viewport.label).toEqual([]);
      expect(layout.fitsWithoutScrolling, viewport.label).toBe(true);
      expect(layout.requiresPageScroll, viewport.label).toBe(false);
      expect(layout.columns, viewport.label).toBe(4);
      expect(layout.rows, viewport.label).toBe(4);
    }
  });

  it("keeps every card at or above both floors at every base viewport", () => {
    for (const { viewport, layout } of planBoardLayouts(PRODUCTION_CARD_COUNT)) {
      expect(layout.cardCssPx, viewport.label).toBeGreaterThanOrEqual(MIN_LEGIBLE_CARD_CSS_PX);
      expect(layout.cardCssPx, viewport.label).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX);
      expect(layout.minCardCssPx, viewport.label).toBe(MIN_LEGIBLE_CARD_CSS_PX);
    }
  });

  it("fits the 8-card warm-up too, which is the board shown first", () => {
    for (const { viewport, layout } of planBoardLayouts(WARM_UP_CARD_COUNT)) {
      expect(layout.problems, viewport.label).toEqual([]);
      expect(layout.fitsWithoutScrolling, viewport.label).toBe(true);
      expect(layout.rows, viewport.label).toBe(2);
      expect(layout.cardCssPx, viewport.label).toBeGreaterThanOrEqual(MIN_LEGIBLE_CARD_CSS_PX);
    }
  });

  it("proves the 320x568 case is not luck: the gap budget is what makes a 68px card possible", () => {
    const smallest = planBoardLayout({
      viewport: { width: 320, height: 568 },
      cardCount: PRODUCTION_CARD_COUNT,
    });

    // 4 columns x 68px plus three gaps must fit inside 320px minus the chrome the board really sits in.
    const floorWidth = 4 * MIN_LEGIBLE_CARD_CSS_PX + 3 * BOARD_GAP_CSS_PX;
    expect(floorWidth + BOARD_CHROME_CSS_PX * 2).toBeLessThanOrEqual(320);
    expect(smallest.availableWidthCssPx).toBe(320 - BOARD_CHROME_CSS_PX * 2);
    expect(smallest.boardWidthCssPx).toBeLessThanOrEqual(smallest.availableWidthCssPx);

    // The derived budgets, stated so a future gap or padding "tweak" fails here rather than in a screenshot.
    expect(BOARD_GAP_CSS_PX).toBe(4);
    expect(BOARD_CHROME_CSS_PX).toBe(17);
  });
});

describe("the horizontal-loss invariant holds at every zoom level", () => {
  it("never plans a board wider than the space available, at any viewport, zoom or card count", () => {
    for (const viewport of BASE_VIEWPORTS) {
      for (const zoom of SUPPORTED_ZOOM_LEVELS) {
        for (const cardCount of [4, 8, 16, 32]) {
          const layout = planBoardLayout({ viewport, cardCount, zoom });
          expect(fitsHorizontally(layout), `${viewport.id} @${zoom}x with ${cardCount} cards`).toBe(true);
        }
      }
    }
  });

  it("plans a problem-free board for every board size the game actually deals", () => {
    // 32 cards is the engine's *defensive* upper bound, explicitly not a product decision, and it genuinely
    // cannot fit a 568px-tall phone at 100% zoom — which the planner reports rather than hides. The product
    // deals a 4-pair (8-card) warm-up and an 8-pair (16-card) production board, and those are the sizes the
    // fit contract is about.
    for (const viewport of BASE_VIEWPORTS) {
      for (const zoom of SUPPORTED_ZOOM_LEVELS) {
        for (const cardCount of [WARM_UP_CARD_COUNT, PRODUCTION_CARD_COUNT]) {
          const layout = planBoardLayout({ viewport, cardCount, zoom });
          expect(layout.problems, `${viewport.id} @${zoom}x with ${cardCount} cards`).toEqual([]);
          expect(fitsHorizontally(layout)).toBe(true);
        }
      }
    }
  });

  it("reflows to fewer columns at 200% zoom and allows page scrolling instead of clipping", () => {
    const zoomed = planBoardLayout({
      viewport: { width: 320, height: 568 },
      cardCount: PRODUCTION_CARD_COUNT,
      zoom: 2,
    });

    expect(zoomed.columns).toBeLessThan(4);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.cardCssPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX);
    expect(fitsHorizontally(zoomed)).toBe(true);

    // Vertical scrolling is the documented 200% behaviour, not a failure.
    expect(zoomed.requiresPageScroll).toBe(true);
    expect(zoomed.problems.filter((problem) => problem.includes("horizontal content loss"))).toEqual([]);
  });

  it("reports rather than throws when it is handed an impossible viewport", () => {
    const impossible = planBoardLayout({
      viewport: { width: 80, height: 80 },
      cardCount: PRODUCTION_CARD_COUNT,
      minCardCssPx: MIN_LEGIBLE_CARD_CSS_PX,
    });

    expect(impossible.problems.length).toBeGreaterThan(0);
    const reported = impossible.problems.join(" ");

    // Two distinct failures, reported together rather than one at a time: the card cannot reach the
    // legibility floor, and the board cannot fit at 100% zoom. Horizontal loss is *not* among them, because
    // the planner reduced to a single column until it fit — which is the behaviour the invariant requires.
    expect(reported).toContain("below the 68px floor");
    expect(reported).toContain("does not fit at 100% zoom");
    expect(impossible.problems.filter((problem) => problem.includes("horizontal content loss"))).toEqual([]);
    expect(impossible.cardCssPx).toBeLessThan(MIN_LEGIBLE_CARD_CSS_PX);
    expect(fitsHorizontally(impossible)).toBe(true);
  });
});

describe("the planner is deterministic and the stylesheet consumes its numbers", () => {
  it("returns an identical plan for identical input", () => {
    const request = { viewport: { width: 390, height: 844 }, cardCount: PRODUCTION_CARD_COUNT };
    expect(planBoardLayout(request)).toEqual(planBoardLayout(request));
  });

  it("keeps the stylesheet's default board tokens equal to the smallest base viewport's plan", () => {
    const source = readFileSync(globalsCssPath, "utf8");
    const smallest = BASE_VIEWPORTS[0]!;
    const layout = planBoardLayout({
      viewport: { width: smallest.width, height: smallest.height },
      cardCount: PRODUCTION_CARD_COUNT,
    });

    // This is the drift guard: the CSS default is a fallback used before the panel writes the plan into the
    // custom properties, so it must describe the same board the planner would choose for that viewport.
    expect(tokenValue(source, ":root", "--fm-card-size")).toBe(`${layout.cardCssPx}px`);
    expect(tokenValue(source, ":root", "--fm-board-columns")).toBe(String(layout.columns));
    expect(tokenValue(source, ":root", "--fm-board-gap")).toBe(`${BOARD_GAP_CSS_PX}px`);
  });
});
