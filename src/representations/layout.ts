/**
 * Shared geometry layout model (GAME-186).
 *
 * Every number a representation draws comes from here, and so does every floor the legibility
 * policy measures against. Keeping the model and the floors in one module means the floors are
 * evaluated against the geometry that is actually rendered — not against a second, drifting copy of
 * the same arithmetic.
 *
 * The floors are GAME-97's legibility contract:
 * - a discrete partition region is at least 8x8 CSS px;
 * - division lines are at least 2 CSS px thick (contrast is checked separately, against the
 *   declared token pair);
 * - number-line ticks stay readable and labels never collapse into each other.
 *
 * All units are CSS pixels. Geometry is authored at the *intended rendered size* of the box, so a
 * measurement taken from the DOM matches these numbers one-to-one.
 */

import type { RepresentationBox, RepresentationFamily } from "./contract";

/** Inset between the box edge and drawn geometry, in CSS px. */
export const REPRESENTATION_PADDING_CSS_PX = 4;

/** Smallest clear region a discrete partition may occupy, in CSS px (both axes). */
export const MIN_PARTITION_REGION_CSS_PX = 8;

/** Smallest thickess of a partition division line, in CSS px. */
export const MIN_DIVISION_LINE_CSS_PX = 2;

/** Minimum contrast ratio between a division line and the surface it crosses (WCAG 1.4.11 style). */
export const MIN_DIVISION_CONTRAST_RATIO = 3;

/** Smallest distance between adjacent number-line ticks, in CSS px. */
export const MIN_TICK_SPACING_CSS_PX = 6;

/** Smallest distance between two labelled number-line ticks, in CSS px. */
export const MIN_TICK_LABEL_SPACING_CSS_PX = 14;

/** Smallest glyph height a stacked symbolic fraction may be drawn at, in CSS px. */
export const MIN_SYMBOL_GLYPH_CSS_PX = 10;

/** Gap between adjacent fraction strips, in CSS px. */
export const STRIP_GAP_CSS_PX = 4;

/** Tallest a single horizontal strip band may be drawn, in CSS px. */
export const MAX_STRIP_HEIGHT_CSS_PX = 48;

/** Thickness of every partition division line, in CSS px. Matches `--fm-division-line-width`. */
export const DIVISION_LINE_THICKNESS_CSS_PX = 2;

/**
 * The smallest shipped card size this repository declares.
 *
 * Derivation (documented so GAME-188 can supersede it explicitly rather than silently): the epic's
 * smallest base viewport is 320x568, the production board is 16 cards, and a 4-column board with
 * 8 px gutters inside 16 px page padding leaves `(320 - 32 - 24) / 4 = 66` px. Rounded up to 68 px so
 * the floor is not derived from a single unlucky rounding.
 */
export const MIN_CARD_SIZE_CSS_PX = 68;

/** Recommended drawing box per family. Consumers may pass any box; these are the design defaults. */
export const NOMINAL_BOXES: Readonly<Record<RepresentationFamily, RepresentationBox>> = Object.freeze({
  symbolic: Object.freeze({ width: 96, height: 96 }),
  bar: Object.freeze({ width: 160, height: 96 }),
  circle: Object.freeze({ width: 120, height: 120 }),
  set: Object.freeze({ width: 140, height: 120 }),
  "number-line": Object.freeze({ width: 200, height: 96 }),
});

/** The drawing box recommended for a family. */
export function nominalBox(family: RepresentationFamily): RepresentationBox {
  return NOMINAL_BOXES[family];
}

/** A rectangle in box coordinates. */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** The inset drawing area of a box. */
export type UsableBox = Rect & { readonly min: number };

/** The inset drawing area, where all geometry lives. */
export function usableBox(box: RepresentationBox): UsableBox {
  const width = Math.max(0, box.width - REPRESENTATION_PADDING_CSS_PX * 2);
  const height = Math.max(0, box.height - REPRESENTATION_PADDING_CSS_PX * 2);
  return Object.freeze({
    x: REPRESENTATION_PADDING_CSS_PX,
    y: REPRESENTATION_PADDING_CSS_PX,
    width,
    height,
    min: Math.min(width, height),
  });
}

/** One division line, drawn as a rectangle so its rendered thickness is measurable in the DOM. */
export type DivisionLine = Rect & {
  readonly orientation: "vertical" | "horizontal";
};

/**
 * A measured rectangle centred on a boundary, clamped into the drawing area.
 * Lines are centred on partition edges, so each neighbouring partition gives up half the line.
 */
export function divisionLine(
  centerX: number,
  centerY: number,
  orientation: "vertical" | "horizontal",
  span: number,
  thickness: number = DIVISION_LINE_THICKNESS_CSS_PX,
): DivisionLine {
  if (orientation === "vertical") {
    return Object.freeze({
      orientation,
      x: centerX - thickness / 2,
      y: centerY,
      width: thickness,
      height: span,
    });
  }
  return Object.freeze({
    orientation,
    x: centerX,
    y: centerY - thickness / 2,
    width: span,
    height: thickness,
  });
}

/** The clear region a discrete partition owns after its division lines are drawn. */
export function clearRegion(cellWidth: number, cellHeight: number, thickness: number = DIVISION_LINE_THICKNESS_CSS_PX): {
  readonly width: number;
  readonly height: number;
} {
  return Object.freeze({
    width: Math.max(0, cellWidth - thickness),
    height: Math.max(0, cellHeight - thickness),
  });
}
