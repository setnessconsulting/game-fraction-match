/**
 * Fraction bar / strip geometry (GAME-186).
 *
 * A bar shows one whole as a row of `denominator` equal parts, with `numerator` of them shaded. The
 * geometry is deterministic and integer-driven: every partition in a strip has an identical
 * rectangle, so the shaded area of `2/4` and `1/2` in the same box is provably the same quantity.
 *
 * Values at or above one whole are drawn honestly as whole strips plus a partially shaded strip
 * (`5/4` = one full strip and one quarter of a second strip) rather than being squeezed into one
 * strip, which would misstate the quantity.
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
  MAX_STRIP_HEIGHT_CSS_PX,
  STRIP_GAP_CSS_PX,
  clearRegion,
  divisionLine,
  usableBox,
  type DivisionLine,
  type Rect,
} from "../layout";
import { wholeUnitCount, type GeometryMetrics, type PartitionRegion } from "./metrics";

export type BarOrientation = "horizontal" | "vertical";

/** One equal part of a strip. */
export type BarPartition = {
  readonly stripIndex: number;
  readonly partitionIndex: number;
  /** Global index inside the whole drawing, `stripIndex * denominator + partitionIndex`. */
  readonly ordinal: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly filled: boolean;
};

export type BarStrip = {
  readonly stripIndex: number;
  readonly frame: Rect;
  readonly partitions: readonly BarPartition[];
};

export type BarTotals = {
  readonly strips: number;
  readonly partitionsPerWhole: number;
  readonly filledPartitions: number;
  readonly totalPartitions: number;
  readonly partitionAreaCssPx: number;
  readonly filledAreaCssPx: number;
  readonly stripAreaCssPx: number;
};

export type BarGeometry = {
  readonly kind: "bar";
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly orientation: BarOrientation;
  readonly strips: readonly BarStrip[];
  readonly frames: readonly Rect[];
  readonly divisionLines: readonly DivisionLine[];
  readonly totals: BarTotals;
  readonly metrics: GeometryMetrics;
};

export type BarGeometryInput = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly orientation?: BarOrientation;
};

/** Build deterministic bar geometry for a fraction and box. */
export function barGeometry(input: BarGeometryInput): BarGeometry {
  assertFractionValue(input.fraction, "barGeometry");
  assertRepresentationBox(input.box, "barGeometry");

  const orientation: BarOrientation = input.orientation ?? "horizontal";
  const strips = wholeUnitCount(input.fraction);
  const partitionsPerWhole = input.fraction.denominator;
  const usable = usableBox(input.box);

  const dividerTotal = STRIP_GAP_CSS_PX * (strips - 1);
  const stripRectangles: Rect[] = [];

  if (orientation === "horizontal") {
    const bandHeight = Math.min(
      MAX_STRIP_HEIGHT_CSS_PX,
      Math.max(0, usable.height - dividerTotal) / strips,
    );
    const totalHeight = bandHeight * strips + dividerTotal;
    const startY = usable.y + Math.max(0, (usable.height - totalHeight) / 2);
    for (let stripIndex = 0; stripIndex < strips; stripIndex += 1) {
      stripRectangles.push({
        x: usable.x,
        y: startY + stripIndex * (bandHeight + STRIP_GAP_CSS_PX),
        width: usable.width,
        height: bandHeight,
      });
    }
  } else {
    // Vertical bars use the same cap on their band width, so both orientations stay proportional.
    const bandWidth = Math.min(MAX_STRIP_HEIGHT_CSS_PX, Math.max(0, usable.width - dividerTotal) / strips);
    const totalWidth = bandWidth * strips + dividerTotal;
    const startX = usable.x + Math.max(0, (usable.width - totalWidth) / 2);
    for (let stripIndex = 0; stripIndex < strips; stripIndex += 1) {
      stripRectangles.push({
        x: startX + stripIndex * (bandWidth + STRIP_GAP_CSS_PX),
        y: usable.y,
        width: bandWidth,
        height: usable.height,
      });
    }
  }

  const builtStrips: BarStrip[] = [];
  const divisionLines: DivisionLine[] = [];

  for (let stripIndex = 0; stripIndex < strips; stripIndex += 1) {
    const frame = stripRectangles[stripIndex];
    if (frame === undefined) {
      throw new RepresentationContractError(`bar strip ${stripIndex} was not laid out`);
    }

    const cellWidth = orientation === "horizontal" ? frame.width / partitionsPerWhole : frame.width;
    const cellHeight = orientation === "horizontal" ? frame.height : frame.height / partitionsPerWhole;

    const partitions: BarPartition[] = [];
    for (let partitionIndex = 0; partitionIndex < partitionsPerWhole; partitionIndex += 1) {
      const ordinal = stripIndex * partitionsPerWhole + partitionIndex;
      const filled = ordinal < input.fraction.numerator;
      // Vertical bars fill from the bottom, which is the conventional orientation for a strip.
      const x = orientation === "horizontal" ? frame.x + partitionIndex * cellWidth : frame.x;
      const y =
        orientation === "horizontal"
          ? frame.y
          : frame.y + frame.height - (partitionIndex + 1) * cellHeight;

      partitions.push(
        Object.freeze({
          stripIndex,
          partitionIndex,
          ordinal,
          x,
          y,
          width: cellWidth,
          height: cellHeight,
          filled,
        }),
      );
    }

    for (let boundary = 1; boundary < partitionsPerWhole; boundary += 1) {
      if (orientation === "horizontal") {
        divisionLines.push(
          divisionLine(frame.x + boundary * cellWidth, frame.y, "vertical", frame.height),
        );
      } else {
        divisionLines.push(
          divisionLine(
            frame.x,
            frame.y + frame.height - boundary * cellHeight,
            "horizontal",
            frame.width,
          ),
        );
      }
    }

    builtStrips.push(Object.freeze({ stripIndex, frame, partitions: Object.freeze(partitions) }));
  }

  const firstFrame = builtStrips[0]?.frame ?? { x: 0, y: 0, width: 0, height: 0 };
  const partitionCellWidth = orientation === "horizontal" ? firstFrame.width / partitionsPerWhole : firstFrame.width;
  const partitionCellHeight = orientation === "horizontal" ? firstFrame.height : firstFrame.height / partitionsPerWhole;
  const partitionRegion: PartitionRegion = clearRegion(partitionCellWidth, partitionCellHeight);

  const totalPartitions = strips * partitionsPerWhole;
  const filledPartitions = Math.min(Math.max(input.fraction.numerator, 0), totalPartitions);
  const partitionAreaCssPx = partitionCellWidth * partitionCellHeight;
  const stripAreaCssPx = firstFrame.width * firstFrame.height;

  const metrics: GeometryMetrics = Object.freeze({
    family: "bar" as const,
    partitionCountPerWhole: partitionsPerWhole,
    partitionRegion,
    divisionLineThicknessPx: DIVISION_LINE_THICKNESS_CSS_PX,
    tickSpacingPx: null,
    tickLabelSpacingPx: null,
    tickLabelCount: null,
    glyphPx: null,
    objectPx: null,
  });

  return Object.freeze({
    kind: "bar" as const,
    fraction: input.fraction,
    box: input.box,
    orientation,
    strips: Object.freeze(builtStrips),
    frames: Object.freeze(stripRectangles),
    divisionLines: Object.freeze(divisionLines),
    totals: Object.freeze({
      strips,
      partitionsPerWhole,
      filledPartitions,
      totalPartitions,
      partitionAreaCssPx,
      filledAreaCssPx: partitionAreaCssPx * filledPartitions,
      stripAreaCssPx,
    }),
    metrics,
  });
}
