/**
 * Geometry metrics (GAME-186).
 *
 * Each family's geometry returns a small, explicit measurements block next to the shapes it drew.
 * The legibility policy reads those measurements instead of recomputing them, so the floors can only
 * ever describe the geometry that is really rendered.
 */

import type { FractionValue, RepresentationFamily } from "../contract";

/**
 * How many whole units a value needs.
 *
 * `0/4` still draws one (empty) whole, `5/4` draws two. Bars, circles and any future area model
 * share this rule so no family can quietly invent a second convention for values at or above one.
 */
export function wholeUnitCount(fraction: FractionValue): number {
  if (fraction.numerator <= 0) return 1;
  return Math.ceil(fraction.numerator / fraction.denominator);
}

/** A clear region in CSS px. */
export type PartitionRegion = {
  readonly width: number;
  readonly height: number;
};

export type GeometryMetrics = {
  readonly family: RepresentationFamily;
  /** Equal parts per whole the family drew (the authored denominator). */
  readonly partitionCountPerWhole: number;
  /** Clear region owned by one discrete partition, or `null` when the family has no partitions. */
  readonly partitionRegion: PartitionRegion | null;
  /** Thickness of each division line, in CSS px. */
  readonly divisionLineThicknessPx: number;
  /** Distance between adjacent number-line ticks, or `null` for other families. */
  readonly tickSpacingPx: number | null;
  /** Smallest distance between two labelled number-line ticks, or `null` for other families. */
  readonly tickLabelSpacingPx: number | null;
  /** How many ticks carry a label, or `null` for other families. */
  readonly tickLabelCount: number | null;
  /** Glyph height of a stacked symbolic fraction, or `null` for other families. */
  readonly glyphPx: number | null;
  /** Clear diameter of one countable object, or `null` for other families. */
  readonly objectPx: number | null;
};
