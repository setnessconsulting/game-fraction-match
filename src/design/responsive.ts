/**
 * Responsive contract (GAME-188).
 *
 * The story's fit rules are arithmetic, so they are implemented as arithmetic and proved in
 * `tests/designResponsive.test.ts` rather than asserted in a document. Three claims matter:
 *
 * 1. **At 100% zoom the active 16-card board fits every base viewport simultaneously**, with no internal
 *    board scrolling, every card at least `MIN_TOUCH_TARGET_CSS_PX` and — because a card carries a picture —
 *    at least `MIN_LEGIBLE_CARD_CSS_PX`, which is the box GAME-186's legibility floors were measured at.
 * 2. **At 200% zoom, vertical scrolling is allowed and horizontal content loss is not.** The board reflows
 *    to fewer columns and the *page* scrolls, instead of the board being clipped or scrolled inside itself.
 * 3. **The legibility floor constrains the design, not the other way round.** At 100% zoom a card that
 *    cannot reach `MIN_LEGIBLE_CARD_CSS_PX` is a layout failure, not a reason to shrink a fraction.
 *
 * The planner is pure: same viewport, same answer, no DOM and no media query. A browser test
 * (`tests/e2e/designSystem.spec.ts`) then measures the *rendered* board and proves the implementation
 * agrees with the plan, which is the only way a layout contract can be kept honest.
 */

/** A viewport in CSS pixels. */
export type Viewport = {
  readonly width: number;
  readonly height: number;
};

/** The four base viewports the story names. */
export const BASE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "phone-small", label: "320 x 568 phone", width: 320, height: 568 }),
  Object.freeze({ id: "phone", label: "390 x 844 phone", width: 390, height: 844 }),
  Object.freeze({ id: "tablet", label: "768 x 1024 tablet", width: 768, height: 1024 }),
  Object.freeze({ id: "desktop", label: "1280 x 800 desktop", width: 1280, height: 800 }),
]);

/** The three layout classes the design ships, derived from width rather than guessed from a media query. */
export const LAYOUT_CLASSES = Object.freeze(["phone", "tablet", "desktop"] as const);
export type LayoutClass = (typeof LAYOUT_CLASSES)[number];

/** Horizontal page padding, per side. */
export const PAGE_PADDING_CSS_PX = 8;

/** Horizontal padding of the surface the board sits on, per side. */
export const PANEL_PADDING_CSS_PX = 8;

/** The surface's own border, per side. Forgetting it cost exactly 1px per side in a real browser. */
export const PANEL_BORDER_CSS_PX = 1;

/**
 * Total horizontal chrome between the viewport edge and the board, per side.
 *
 * This number is load-bearing rather than cosmetic. A 320px viewport with 68px legible cards in four columns
 * and 4px gaps needs 284px for the board, which leaves 36px for chrome — 18px per side. The planner subtracts
 * this figure, so a stylesheet that added padding or border beyond it would push the cards under the GAME-186
 * legibility floor, and the fit would fail in the browser, where the mistake belongs.
 */
export const BOARD_CHROME_CSS_PX = PAGE_PADDING_CSS_PX + PANEL_PADDING_CSS_PX + PANEL_BORDER_CSS_PX;

/**
 * The board gap.
 *
 * Four pixels is not an aesthetic preference: on a 320px-wide phone a 4-column grid of 68px legible cards
 * has 304 - 272 = 32px of budget for three gaps, so anything wider than 8px would force the cards below the
 * GAME-186 legibility floor. The number is derived from that budget.
 */
export const BOARD_GAP_CSS_PX = 4;

/** A card never grows past this, so a desktop board stays a board rather than sixteen posters. */
export const MAX_CARD_CSS_PX = 112;

/**
 * The area reserved for HUD, progress and instruction, per layout class.
 *
 * The fit contract only means something if the board is not allowed to eat the surface it shares with the
 * HUD: "HUD/feedback may be compact but may not obscure cards" is enforced here by subtracting a reserve
 * before the board is allowed to claim height.
 */
export const HUD_RESERVE_CSS_PX: Readonly<Record<LayoutClass, number>> = Object.freeze({
  phone: 88,
  tablet: 96,
  desktop: 112,
});

/** Zoom levels the contract covers. 200% reflow is a first-class case, not an edge case. */
export const SUPPORTED_ZOOM_LEVELS = Object.freeze([1, 2] as const);
export type ZoomLevel = (typeof SUPPORTED_ZOOM_LEVELS)[number];

/** Layout class for a viewport width. Tablets start at 600, desktops at 1024. */
export function layoutClassFor(viewportWidthCssPx: number): LayoutClass {
  if (viewportWidthCssPx >= 1024) return "desktop";
  if (viewportWidthCssPx >= 600) return "tablet";
  return "phone";
}

/** The card size the warm-up and production screens must reach at 100% zoom. */
export const MIN_LEGIBLE_CARD_CSS_PX = 68;

export type BoardLayoutRequest = {
  readonly viewport: Viewport;
  readonly cardCount: number;
  readonly zoom?: ZoomLevel;
  /** Cards may be allowed above the touch floor but below the legibility floor only where zoom compensates. */
  readonly minCardCssPx?: number;
  /**
   * Pin the card to an exact size instead of searching for one.
   *
   * Used when the card size is not the design's to choose. A lane's `cardBox` is the box its representations
   * were qualified at, so dealing that content and then rendering it smaller would invalidate a legibility
   * proof another story made. With a pinned size the planner only reflows columns, and it treats "does not fit
   * at 100% zoom" as a recorded fact rather than a failure — because the caller has explicitly accepted page
   * scrolling in exchange for not shrinking the picture.
   */
  readonly fixedCardCssPx?: number;
};

export type BoardLayout = {
  readonly layoutClass: LayoutClass;
  readonly zoom: ZoomLevel;
  readonly columns: number;
  readonly rows: number;
  readonly cardCssPx: number;
  readonly gapCssPx: number;
  readonly boardWidthCssPx: number;
  readonly boardHeightCssPx: number;
  readonly availableWidthCssPx: number;
  readonly availableHeightCssPx: number;
  /** True when the board fits entirely, so the board never scrolls inside itself. */
  readonly fitsWithoutScrolling: boolean;
  /** True when the page must scroll vertically. Allowed at 200% zoom only. */
  readonly requiresPageScroll: boolean;
  readonly minCardCssPx: number;
  /** True when the caller pinned the card size rather than letting the planner choose it. */
  readonly cardSizePinned: boolean;
  readonly problems: readonly string[];
};

/** The columns a board of this size should try first: a square-ish grid, snapped to the 4-card row. */
export function preferredColumnsFor(cardCount: number): number {
  if (cardCount <= 4) return 2;
  if (cardCount <= 8) return 4;
  return 4;
}

/**
 * Plan the board for a viewport.
 *
 * Deterministic and total: it always returns a layout, and it reports every contract violation it could not
 * avoid instead of throwing, because a layout problem is a design finding rather than an exceptional state.
 * It starts from the preferred column count and reduces columns until the card size clears the floor, which
 * is exactly the reflow a 200% zoom needs.
 */
export function planBoardLayout(request: BoardLayoutRequest): BoardLayout {
  const zoom = request.zoom ?? 1;
  const layoutClass = layoutClassFor(request.viewport.width);
  const minCardCssPx =
    request.minCardCssPx ?? (zoom === 1 ? MIN_LEGIBLE_CARD_CSS_PX : Math.min(MIN_LEGIBLE_CARD_CSS_PX, 44));

  const effectiveWidth = Math.floor(request.viewport.width / zoom);
  const effectiveHeight = Math.floor(request.viewport.height / zoom);
  const availableWidthCssPx = effectiveWidth - BOARD_CHROME_CSS_PX * 2;
  const availableHeightCssPx = effectiveHeight - BOARD_CHROME_CSS_PX * 2 - HUD_RESERVE_CSS_PX[layoutClass];

  const problems: string[] = [];
  const pinnedCardCssPx = request.fixedCardCssPx;
  const cardSizePinned = pinnedCardCssPx !== undefined;

  let columns: number;
  let cardCssPx: number;

  if (pinnedCardCssPx !== undefined) {
    // The card size belongs to the content, so only the columns are ours to choose.
    cardCssPx = pinnedCardCssPx;
    const perRow = Math.floor(
      (availableWidthCssPx + BOARD_GAP_CSS_PX) / (Math.max(1, cardCssPx) + BOARD_GAP_CSS_PX),
    );
    columns = Math.min(Math.max(1, perRow), preferredColumnsFor(request.cardCount));
  } else {
    columns = preferredColumnsFor(request.cardCount);
    cardCssPx = 0;

    // Reduce columns until a card can clear the floor. This is the reflow path, not a fallback.
    while (columns > 1) {
      cardCssPx = Math.min(
        MAX_CARD_CSS_PX,
        Math.floor((availableWidthCssPx - (columns - 1) * BOARD_GAP_CSS_PX) / columns),
      );
      if (cardCssPx >= minCardCssPx) break;
      columns -= 1;
    }
    if (columns === 1) {
      cardCssPx = Math.min(MAX_CARD_CSS_PX, availableWidthCssPx);
    }
  }

  const rows = Math.ceil(request.cardCount / columns);
  const boardWidthCssPx = columns * cardCssPx + (columns - 1) * BOARD_GAP_CSS_PX;
  let boardHeightCssPx = rows * cardCssPx + (rows - 1) * BOARD_GAP_CSS_PX;

  // Shrink the card rather than overflow, but never below the floor, and never when the size is pinned:
  // a pinned size is a legibility proof and shrinking it is what the pin exists to prevent.
  if (!cardSizePinned && boardHeightCssPx > availableHeightCssPx && rows > 0) {
    const fitted = Math.floor((availableHeightCssPx - (rows - 1) * BOARD_GAP_CSS_PX) / rows);
    if (fitted >= minCardCssPx) {
      cardCssPx = Math.min(cardCssPx, fitted);
      boardHeightCssPx = rows * cardCssPx + (rows - 1) * BOARD_GAP_CSS_PX;
    }
  }

  const fitsWithoutScrolling = boardHeightCssPx <= availableHeightCssPx && boardWidthCssPx <= availableWidthCssPx;
  const requiresPageScroll = !fitsWithoutScrolling;

  if (boardWidthCssPx > availableWidthCssPx) {
    problems.push(
      `board is ${boardWidthCssPx}px wide but only ${availableWidthCssPx}px is available at ${zoom * 100}% zoom; ` +
        "horizontal content loss is prohibited at every zoom level",
    );
  }
  if (cardCssPx < minCardCssPx) {
    problems.push(
      `cards would render at ${cardCssPx}px, below the ${minCardCssPx}px floor ` +
        `(${zoom === 1 ? "GAME-186 legibility" : "touch target"})`,
    );
  }
  if (cardCssPx < 44) {
    problems.push(`cards would render at ${cardCssPx}px, below the 44px minimum touch target`);
  }
  if (zoom === 1 && !fitsWithoutScrolling && !cardSizePinned) {
    problems.push(
      "the board does not fit at 100% zoom, so it would scroll inside itself; " +
        "the base viewports must fit the whole active board",
    );
  }

  return Object.freeze({
    layoutClass,
    zoom,
    columns,
    rows,
    cardCssPx,
    gapCssPx: BOARD_GAP_CSS_PX,
    boardWidthCssPx,
    boardHeightCssPx,
    availableWidthCssPx,
    availableHeightCssPx,
    fitsWithoutScrolling,
    requiresPageScroll,
    minCardCssPx,
    cardSizePinned,
    problems: Object.freeze(problems),
  });
}

/** Every base viewport, planned at a given zoom for a given card count. */
export function planBoardLayouts(
  cardCount: number,
  zoom: ZoomLevel = 1,
): readonly { readonly viewport: Viewport & { readonly id: string; readonly label: string }; readonly layout: BoardLayout }[] {
  return Object.freeze(
    BASE_VIEWPORTS.map((viewport) =>
      Object.freeze({ viewport, layout: planBoardLayout({ viewport, cardCount, zoom }) }),
    ),
  );
}

/**
 * Does the board fit the shared horizontal axis without loss?
 *
 * Separated from `planBoardLayout` because it is the one rule that holds at *every* zoom level and every
 * viewport, and a test can therefore assert it as an invariant rather than a case.
 */
export function fitsHorizontally(layout: BoardLayout): boolean {
  return layout.boardWidthCssPx <= layout.availableWidthCssPx;
}
