/**
 * Stacked symbolic fraction geometry (GAME-186).
 *
 * The symbolic view renders the *authored* digits — `2/4` stays `2/4` — stacked above and below a
 * fraction rule, which is the mathematically conventional written form. The digits themselves come
 * from the canonical formatter, never from geometry, so the written form and the accessible name
 * cannot disagree.
 *
 * A symbol has no partitions, so its legibility is governed by glyph height: at a very small card
 * the digits would fall below the readable floor and the family becomes ineligible.
 */

import {
  assertFractionValue,
  assertRepresentationBox,
  type FractionValue,
  type RepresentationBox,
} from "../contract";
import { DIVISION_LINE_THICKNESS_CSS_PX, usableBox, type Rect } from "../layout";
import { stackedNotation } from "../notation";
import type { GeometryMetrics } from "./metrics";

/** Ratio of a digit's advance width to its font size for the default UI font stack. */
export const GLYPH_ADVANCE_RATIO = 0.62;

/** Line height multiplier applied to the chosen font size. */
export const GLYPH_LINE_HEIGHT_RATIO = 1.25;

export type SymbolicGeometry = {
  readonly kind: "symbolic";
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly numeratorText: string;
  readonly denominatorText: string;
  readonly centerX: number;
  readonly fontSizePx: number;
  /** The fraction rule: a rectangle so its rendered thickness is measurable. */
  readonly rule: Rect;
  readonly numeratorBaselineY: number;
  readonly denominatorBaselineY: number;
  readonly metrics: GeometryMetrics;
};

export type SymbolicGeometryInput = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
};

/** Build deterministic stacked symbolic geometry for a fraction and box. */
export function symbolicGeometry(input: SymbolicGeometryInput): SymbolicGeometry {
  assertFractionValue(input.fraction, "symbolicGeometry");
  assertRepresentationBox(input.box, "symbolicGeometry");

  const usable = usableBox(input.box);
  const { numeratorText, denominatorText } = stackedNotation(input.fraction);
  const digits = Math.max(numeratorText.length, denominatorText.length, 1);

  // Fit both by height (two stacked lines) and by width (the widest of the two numbers).
  const fontSizeByHeight = (usable.height / 2) * 0.82;
  const fontSizeByWidth = usable.width / (digits * GLYPH_ADVANCE_RATIO);
  const fontSizePx = Math.max(0, Math.min(fontSizeByHeight, fontSizeByWidth));

  const lineHeight = fontSizePx * GLYPH_LINE_HEIGHT_RATIO;
  const ruleThickness = Math.max(DIVISION_LINE_THICKNESS_CSS_PX, fontSizePx * 0.1);
  const ruleWidth = Math.min(usable.width, digits * GLYPH_ADVANCE_RATIO * fontSizePx + fontSizePx * 0.5);
  const blockHeight = lineHeight * 2 + ruleThickness;

  const centerX = input.box.width / 2;
  const top = input.box.height / 2 - blockHeight / 2;

  const metrics: GeometryMetrics = Object.freeze({
    family: "symbolic" as const,
    partitionCountPerWhole: input.fraction.denominator,
    partitionRegion: null,
    divisionLineThicknessPx: ruleThickness,
    tickSpacingPx: null,
    tickLabelSpacingPx: null,
    tickLabelCount: null,
    glyphPx: fontSizePx,
    objectPx: null,
  });

  return Object.freeze({
    kind: "symbolic" as const,
    fraction: input.fraction,
    box: input.box,
    numeratorText,
    denominatorText,
    centerX,
    fontSizePx,
    rule: Object.freeze({
      x: centerX - ruleWidth / 2,
      y: top + lineHeight,
      width: ruleWidth,
      height: ruleThickness,
    }),
    numeratorBaselineY: top + lineHeight * 0.8,
    denominatorBaselineY: top + lineHeight + ruleThickness + lineHeight * 0.8,
    metrics,
  });
}
