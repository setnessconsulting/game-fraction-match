/**
 * Compact number-line geometry (GAME-186).
 *
 * Two number lines may only be compared on one shared axis: the same axis id, the same domain and the
 * same scale (ticks per unit). The scale must be an exact multiple of the denominator, so the point
 * lands on a real tick instead of a rounding artefact — that is what makes `1/2` and `2/4` land on the
 * same place rather than merely looking like they do.
 *
 * Labels are thinned deterministically from the left so they never collide, and the point's own tick is
 * always labelled: the value the line is showing is always readable, even at the smallest card size.
 */

import {
  RepresentationContractError,
  assertFractionValue,
  assertRepresentationBox,
  type FractionValue,
  type RepresentationBox,
} from "../contract";
import {
  DIVISION_LINE_THICKNESS_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  usableBox,
  type Rect,
} from "../layout";
import { axisPosition, type NumberLineAxis, type NumberLineWhole } from "../whole";
import { GLYPH_ADVANCE_RATIO } from "./symbolic";
import type { GeometryMetrics } from "./metrics";

/** Vertical position of the axis baseline inside the box, as a fraction of its height. */
export const BASELINE_HEIGHT_RATIO = 0.58;

/** Tick mark length for a labelled tick, in CSS px. */
export const LABELLED_TICK_LENGTH_CSS_PX = 8;

/** Tick mark length for an unlabelled tick, in CSS px. */
export const UNLABELLED_TICK_LENGTH_CSS_PX = 5;

/** Number-line label font size, in CSS px. Fixed so label spacing is predictable. */
export const LABEL_FONT_SIZE_CSS_PX = 10;

/** Extra clearance required on both sides of a label, in CSS px. */
export const LABEL_CLEARANCE_CSS_PX = 2;

/**
 * Estimated advance width of a label, in CSS px.
 *
 * Used to thin labels so they cannot overlap: the estimate is validated against real rendered text by
 * the phone/desktop browser fixture, which measures bounding boxes in a browser instead of trusting
 * the arithmetic.
 */
export function labelTextWidth(text: string, fontSizePx: number = LABEL_FONT_SIZE_CSS_PX): number {
  return text.length * GLYPH_ADVANCE_RATIO * fontSizePx;
}

/** The gap labels must keep: the absolute floor, or enough room for the widest label. */
export function labelSpacingFloorFor(texts: readonly string[]): number {
  const widest = texts.reduce((widestSoFar, text) => Math.max(widestSoFar, labelTextWidth(text)), 0);
  return Math.max(MIN_TICK_LABEL_SPACING_CSS_PX, widest + LABEL_CLEARANCE_CSS_PX);
}

export type NumberLineTick = {
  readonly tickIndex: number;
  readonly x: number;
  readonly labelled: boolean;
  readonly isPoint: boolean;
  /** Tick mark rectangle, drawn below the baseline. */
  readonly mark: Rect;
};

export type NumberLineLabel = {
  readonly tickIndex: number;
  readonly x: number;
  readonly text: string;
  /** Estimated advance width of the label at {@link LABEL_FONT_SIZE_CSS_PX}. */
  readonly estimatedWidthPx: number;
};

export type NumberLineGeometry = {
  readonly kind: "number-line";
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly whole: NumberLineWhole;
  readonly axis: NumberLineAxis;
  readonly baseline: Rect;
  readonly ticks: readonly NumberLineTick[];
  readonly labels: readonly NumberLineLabel[];
  readonly point: {
    readonly tickIndex: number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  };
  readonly tickSpacingPx: number;
  readonly tickLabelSpacingPx: number;
  /** Font size a consumer must render labels at, so the spacing arithmetic stays true. */
  readonly labelFontSizePx: number;
  readonly metrics: GeometryMetrics;
};

export type NumberLineGeometryInput = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly whole: NumberLineWhole;
  /** Minimum gap between two labelled ticks. Defaults to the legibility floor. */
  readonly labelSpacingFloorPx?: number;
};

/**
 * Deterministic label thinning.
 *
 * Walks left to right including a tick whenever the minimum gap allows, then guarantees the point's
 * own tick is labelled by dropping any label that would sit inside the gap around it. Dropping labels
 * can only widen the remaining gaps, so the floor holds by construction.
 */
export function labelledTickIndexes(input: {
  readonly totalTicks: number;
  readonly tickSpacingPx: number;
  readonly pointTickIndex: number;
  readonly labelSpacingFloorPx?: number;
}): readonly number[] {
  const floor = input.labelSpacingFloorPx ?? MIN_TICK_LABEL_SPACING_CSS_PX;
  const indexes: number[] = [];
  let lastX = Number.NEGATIVE_INFINITY;

  for (let tick = 0; tick <= input.totalTicks; tick += 1) {
    const x = tick * input.tickSpacingPx;
    if (x - lastX >= floor) {
      indexes.push(tick);
      lastX = x;
    }
  }

  if (indexes.includes(input.pointTickIndex)) return Object.freeze(indexes);

  const pointX = input.pointTickIndex * input.tickSpacingPx;
  const kept = indexes.filter((tick) => Math.abs(tick * input.tickSpacingPx - pointX) >= floor);
  kept.push(input.pointTickIndex);
  kept.sort((left, right) => left - right);
  return Object.freeze(kept);
}

/** Absolute tick text: integers stay integers, everything else stays an exact authored pair. */
export function tickLabelText(axis: NumberLineAxis, tickIndex: number): string {
  const absoluteNumerator = axis.domainStart * axis.ticksPerUnit + tickIndex;
  if (absoluteNumerator % axis.ticksPerUnit === 0) return String(absoluteNumerator / axis.ticksPerUnit);
  return `${absoluteNumerator}/${axis.ticksPerUnit}`;
}

/** Build deterministic number-line geometry for a fraction, box and shared axis. */
export function numberLineGeometry(input: NumberLineGeometryInput): NumberLineGeometry {
  assertFractionValue(input.fraction, "numberLineGeometry");
  assertRepresentationBox(input.box, "numberLineGeometry");

  const usable = usableBox(input.box);
  const axis = input.whole.axis;
  const position = axisPosition(input.fraction, axis);
  const totalTicks = position.totalTicks;

  if (totalTicks <= 0) {
    throw new RepresentationContractError("numberLineGeometry requires an axis with at least one tick");
  }

  const tickSpacingPx = usable.width / totalTicks;
  const baselineY = input.box.height * BASELINE_HEIGHT_RATIO;
  const baseline: Rect = Object.freeze({
    x: usable.x,
    y: baselineY - DIVISION_LINE_THICKNESS_CSS_PX / 2,
    width: usable.width,
    height: DIVISION_LINE_THICKNESS_CSS_PX,
  });

  const tickTexts: string[] = [];
  for (let tickIndex = 0; tickIndex <= totalTicks; tickIndex += 1) {
    tickTexts.push(tickLabelText(axis, tickIndex));
  }
  // Every tick text is known before thinning, so the gap floor accounts for the widest label.
  const spacingFloor = input.labelSpacingFloorPx ?? labelSpacingFloorFor(tickTexts);

  const labelled = labelledTickIndexes({
    totalTicks,
    tickSpacingPx,
    pointTickIndex: position.tickIndex,
    labelSpacingFloorPx: spacingFloor,
  });
  const labelledSet = new Set(labelled);

  const ticks: NumberLineTick[] = [];
  const labels: NumberLineLabel[] = [];
  for (let tickIndex = 0; tickIndex <= totalTicks; tickIndex += 1) {
    const x = usable.x + tickIndex * tickSpacingPx;
    const isLabelled = labelledSet.has(tickIndex);
    const length = isLabelled ? LABELLED_TICK_LENGTH_CSS_PX : UNLABELLED_TICK_LENGTH_CSS_PX;
    ticks.push(
      Object.freeze({
        tickIndex,
        x,
        labelled: isLabelled,
        isPoint: tickIndex === position.tickIndex,
        mark: Object.freeze({
          x: x - DIVISION_LINE_THICKNESS_CSS_PX / 2,
          y: baselineY,
          width: DIVISION_LINE_THICKNESS_CSS_PX,
          height: length,
        }),
      }),
    );
    if (isLabelled) {
      // The text is derived from the tick, not looked up in the array, so no index can be missing.
      const text = tickLabelText(axis, tickIndex);
      labels.push(Object.freeze({ tickIndex, x, text, estimatedWidthPx: labelTextWidth(text) }));
    }
  }

  let smallestLabelGap = Number.POSITIVE_INFINITY;
  for (const [index, tickIndex] of labelled.entries()) {
    const previous = labelled[index - 1];
    if (previous !== undefined) {
      smallestLabelGap = Math.min(smallestLabelGap, (tickIndex - previous) * tickSpacingPx);
    }
  }
  const tickLabelSpacingPx = Number.isFinite(smallestLabelGap) ? smallestLabelGap : 0;

  const metrics: GeometryMetrics = Object.freeze({
    family: "number-line" as const,
    partitionCountPerWhole: input.fraction.denominator,
    partitionRegion: null,
    divisionLineThicknessPx: DIVISION_LINE_THICKNESS_CSS_PX,
    tickSpacingPx,
    tickLabelSpacingPx,
    tickLabelCount: labels.length,
    glyphPx: null,
    objectPx: null,
  });

  return Object.freeze({
    kind: "number-line" as const,
    fraction: input.fraction,
    box: input.box,
    whole: input.whole,
    axis,
    baseline,
    ticks: Object.freeze(ticks),
    labels: Object.freeze(labels),
    point: Object.freeze({
      tickIndex: position.tickIndex,
      x: usable.x + position.tickIndex * tickSpacingPx,
      y: baselineY,
      radius: Math.max(2.5, usable.min * 0.045),
    }),
    tickSpacingPx,
    tickLabelSpacingPx,
    labelFontSizePx: LABEL_FONT_SIZE_CSS_PX,
    metrics,
  });
}
