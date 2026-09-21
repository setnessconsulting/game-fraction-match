/**
 * Circle / area model geometry (GAME-186).
 *
 * One circle is one whole, cut into `denominator` equal wedges, with `numerator` of them shaded.
 * Equal wedges are guaranteed by construction (every wedge spans `360 / denominator` degrees), so two
 * circles in the same box show the same quantity exactly when their wedge counts agree — the ratio is
 * countable, not eyeballed.
 *
 * Values at or above one whole are drawn as whole circles plus a partial one, matching the bar model.
 */

import {
  assertFractionValue,
  assertRepresentationBox,
  type FractionValue,
  type RepresentationBox,
} from "../contract";
import { DIVISION_LINE_THICKNESS_CSS_PX, STRIP_GAP_CSS_PX, usableBox } from "../layout";
import { wholeUnitCount, type GeometryMetrics, type PartitionRegion } from "./metrics";

/** A radial divider between two wedges, drawn as a stroked line of the shared thickness. */
export type CircleDivision = {
  readonly circleIndex: number;
  readonly boundaryIndex: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

export type CircleWedge = {
  readonly circleIndex: number;
  readonly wedgeIndex: number;
  /** Global index inside the whole drawing, `circleIndex * denominator + wedgeIndex`. */
  readonly ordinal: number;
  readonly startAngleDeg: number;
  readonly sweepDeg: number;
  readonly path: string;
  readonly filled: boolean;
};

export type CircleShape = {
  readonly circleIndex: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly wedgeCount: number;
  readonly filledWedgeCount: number;
};

export type CircleGeometry = {
  readonly kind: "circle";
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly circles: readonly CircleShape[];
  readonly wedges: readonly CircleWedge[];
  readonly divisions: readonly CircleDivision[];
  readonly totals: {
    readonly wedgesPerWhole: number;
    readonly filledWedges: number;
    readonly totalWedges: number;
    readonly wedgeSweepDeg: number;
  };
  readonly metrics: GeometryMetrics;
};

export type CircleGeometryInput = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
};

function polarPoint(centerX: number, centerY: number, radius: number, angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
}

/** Start at the top of the circle and sweep clockwise, which is the conventional reading order. */
export const FIRST_WEDGE_START_ANGLE_DEG = -90;

function wedgePath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleDeg: number,
  sweepDeg: number,
): string {
  const start = polarPoint(centerX, centerY, radius, startAngleDeg);
  const end = polarPoint(centerX, centerY, radius, startAngleDeg + sweepDeg);
  const format = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(3));

  // A wedge is never more than a half turn: a sweep is `360 / denominator`, and a one-part whole takes
  // the full-turn path below. The large-arc flag is therefore always 0 for the single-arc form.
  const largeArc = 0;

  // A full turn cannot be drawn as one arc (start and end coincide), so it uses two half arcs.
  if (sweepDeg >= 360) {
    const halfway = polarPoint(centerX, centerY, radius, startAngleDeg + 180);
    return [
      `M ${format(start.x)} ${format(start.y)}`,
      `A ${format(radius)} ${format(radius)} 0 1 1 ${format(halfway.x)} ${format(halfway.y)}`,
      `A ${format(radius)} ${format(radius)} 0 1 1 ${format(start.x)} ${format(start.y)}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${format(centerX)} ${format(centerY)}`,
    `L ${format(start.x)} ${format(start.y)}`,
    `A ${format(radius)} ${format(radius)} 0 ${largeArc} 1 ${format(end.x)} ${format(end.y)}`,
    "Z",
  ].join(" ");
}

/** Build deterministic circle geometry for a fraction and box. */
export function circleGeometry(input: CircleGeometryInput): CircleGeometry {
  assertFractionValue(input.fraction, "circleGeometry");
  assertRepresentationBox(input.box, "circleGeometry");

  const usable = usableBox(input.box);
  // `assertFractionValue` has already refused a non-positive denominator, so the wedge count is
  // guaranteed to be at least one and no defensive re-check is kept here.
  const wedgeCount = input.fraction.denominator;
  const circleCount = wholeUnitCount(input.fraction);
  const gapTotal = STRIP_GAP_CSS_PX * (circleCount - 1);

  const radius = Math.max(
    0,
    Math.min(usable.height / 2, (usable.width - gapTotal) / (2 * circleCount)),
  );
  const cellWidth = radius * 2 + STRIP_GAP_CSS_PX;
  const totalWidth = cellWidth * circleCount - STRIP_GAP_CSS_PX;
  const startX = usable.x + Math.max(0, (usable.width - totalWidth) / 2);
  const sweepDeg = 360 / wedgeCount;

  const circles: CircleShape[] = [];
  const wedges: CircleWedge[] = [];
  const divisions: CircleDivision[] = [];

  for (let circleIndex = 0; circleIndex < circleCount; circleIndex += 1) {
    const centerX = startX + radius + circleIndex * cellWidth;
    const centerY = usable.y + usable.height / 2;
    let filledWedgeCount = 0;

    for (let wedgeIndex = 0; wedgeIndex < wedgeCount; wedgeIndex += 1) {
      const ordinal = circleIndex * wedgeCount + wedgeIndex;
      const filled = ordinal < input.fraction.numerator;
      if (filled) filledWedgeCount += 1;
      const startAngleDeg = FIRST_WEDGE_START_ANGLE_DEG + wedgeIndex * sweepDeg;
      wedges.push(
        Object.freeze({
          circleIndex,
          wedgeIndex,
          ordinal,
          startAngleDeg,
          sweepDeg,
          path: wedgePath(centerX, centerY, radius, startAngleDeg, sweepDeg),
          filled,
        }),
      );
    }

    if (wedgeCount > 1) {
      for (let boundaryIndex = 0; boundaryIndex < wedgeCount; boundaryIndex += 1) {
        const angle = FIRST_WEDGE_START_ANGLE_DEG + boundaryIndex * sweepDeg;
        const rim = polarPoint(centerX, centerY, radius, angle);
        divisions.push(
          Object.freeze({ circleIndex, boundaryIndex, x1: centerX, y1: centerY, x2: rim.x, y2: rim.y }),
        );
      }
    }

    circles.push(
      Object.freeze({ circleIndex, centerX, centerY, radius, wedgeCount, filledWedgeCount }),
    );
  }

  // A wedge is readable when its outer arc segment is wide enough and its radial depth is tall
  // enough. Both are measured after the radial divider takes its share.
  const arcLength = (2 * Math.PI * radius * sweepDeg) / 360;
  const partitionRegion: PartitionRegion = Object.freeze({
    width: Math.max(0, arcLength - DIVISION_LINE_THICKNESS_CSS_PX),
    height: Math.max(0, radius - DIVISION_LINE_THICKNESS_CSS_PX),
  });

  const totalWedges = circleCount * wedgeCount;
  const filledWedges = Math.min(Math.max(input.fraction.numerator, 0), totalWedges);

  const metrics: GeometryMetrics = Object.freeze({
    family: "circle" as const,
    partitionCountPerWhole: wedgeCount,
    partitionRegion,
    divisionLineThicknessPx: DIVISION_LINE_THICKNESS_CSS_PX,
    tickSpacingPx: null,
    tickLabelSpacingPx: null,
    tickLabelCount: null,
    glyphPx: null,
    objectPx: null,
  });

  return Object.freeze({
    kind: "circle" as const,
    fraction: input.fraction,
    box: input.box,
    circles: Object.freeze(circles),
    wedges: Object.freeze(wedges),
    divisions: Object.freeze(divisions),
    totals: Object.freeze({ wedgesPerWhole: wedgeCount, filledWedges, totalWedges, wedgeSweepDeg: sweepDeg }),
    metrics,
  });
}
