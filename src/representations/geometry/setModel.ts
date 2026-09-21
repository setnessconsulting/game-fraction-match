/**
 * Countable set / collection geometry (GAME-186).
 *
 * A set model shows one declared collection: `totalObjectCount` objects, of which
 * `numerator * (total / denominator)` are selected. Both numbers are integers derived by
 * {@link setSelection}, so the model can only ever show an exact fraction of the declared
 * collection — it cannot claim equivalence by quietly changing how many objects the whole contains.
 *
 * Objects are laid out on a deterministic grid (row-major, partial rows centred) so the same
 * fraction and box always produce the same picture.
 */

import {
  assertFractionValue,
  assertRepresentationBox,
  type FractionValue,
  type RepresentationBox,
} from "../contract";
import { DIVISION_LINE_THICKNESS_CSS_PX, usableBox } from "../layout";
import { setSelection, type DiscreteSetWhole } from "../whole";
import type { GeometryMetrics, PartitionRegion } from "./metrics";

export type SetObject = {
  readonly objectIndex: number;
  readonly row: number;
  readonly column: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly selected: boolean;
};

export type SetGeometry = {
  readonly kind: "set";
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly whole: DiscreteSetWhole;
  readonly selection: {
    readonly selectedCount: number;
    readonly totalObjectCount: number;
  };
  readonly grid: {
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
  readonly objects: readonly SetObject[];
  readonly metrics: GeometryMetrics;
};

export type SetGeometryInput = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly whole: DiscreteSetWhole;
};

/** Deterministic grid shape: as close to square as an exact row-major layout allows. */
export function setGridShape(totalObjectCount: number): { readonly columns: number; readonly rows: number } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(totalObjectCount)));
  const rows = Math.max(1, Math.ceil(totalObjectCount / columns));
  return Object.freeze({ columns, rows });
}

/** Build deterministic set geometry for a fraction, box and declared collection. */
export function setGeometry(input: SetGeometryInput): SetGeometry {
  assertFractionValue(input.fraction, "setGeometry");
  assertRepresentationBox(input.box, "setGeometry");

  const usable = usableBox(input.box);
  const selection = setSelection(input.fraction, input.whole);
  const { columns, rows } = setGridShape(selection.totalObjectCount);

  const cellWidth = usable.width / columns;
  const cellHeight = usable.height / rows;
  const radius = Math.max(0, Math.min(cellWidth, cellHeight) / 2 - DIVISION_LINE_THICKNESS_CSS_PX / 2);
  const clearDiameter = radius * 2;

  const objects: SetObject[] = [];
  for (let row = 0; row < rows; row += 1) {
    // The grid shape is `ceil`-derived from the total, so every row up to `rows` owns at least one
    // object and no empty-row guard is needed here.
    const objectsInRow = Math.min(columns, selection.totalObjectCount - row * columns);
    const rowWidth = objectsInRow * cellWidth;
    const rowStartX = usable.x + (usable.width - rowWidth) / 2;
    for (let column = 0; column < objectsInRow; column += 1) {
      const objectIndex = row * columns + column;
      objects.push(
        Object.freeze({
          objectIndex,
          row,
          column,
          centerX: rowStartX + column * cellWidth + cellWidth / 2,
          centerY: usable.y + row * cellHeight + cellHeight / 2,
          radius,
          selected: objectIndex < selection.selectedCount,
        }),
      );
    }
  }

  const partitionRegion: PartitionRegion = Object.freeze({
    width: clearDiameter,
    height: clearDiameter,
  });

  const metrics: GeometryMetrics = Object.freeze({
    family: "set" as const,
    partitionCountPerWhole: input.fraction.denominator,
    partitionRegion,
    divisionLineThicknessPx: DIVISION_LINE_THICKNESS_CSS_PX,
    tickSpacingPx: null,
    tickLabelSpacingPx: null,
    tickLabelCount: null,
    glyphPx: null,
    objectPx: clearDiameter,
  });

  return Object.freeze({
    kind: "set" as const,
    fraction: input.fraction,
    box: input.box,
    whole: input.whole,
    selection,
    grid: Object.freeze({ columns, rows, cellWidth, cellHeight }),
    objects: Object.freeze(objects),
    metrics,
  });
}
