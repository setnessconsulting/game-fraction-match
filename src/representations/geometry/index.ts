/**
 * Deterministic SVG geometry (GAME-186).
 *
 * These modules are pure functions over `(fraction, box, declared whole)` and return plain numbers,
 * rectangles and path strings. They never touch the DOM, never read a clock and never compare values,
 * so they can be unit tested exactly and rendered by any consumer.
 */

export { barGeometry } from "./bar";
export type { BarGeometry, BarGeometryInput, BarOrientation, BarPartition, BarStrip, BarTotals } from "./bar";

export { circleGeometry, FIRST_WEDGE_START_ANGLE_DEG } from "./circle";
export type { CircleDivision, CircleGeometry, CircleGeometryInput, CircleShape, CircleWedge } from "./circle";

export { setGeometry, setGridShape } from "./setModel";
export type { SetGeometry, SetGeometryInput, SetObject } from "./setModel";

export {
  BASELINE_HEIGHT_RATIO,
  LABELLED_TICK_LENGTH_CSS_PX,
  LABEL_CLEARANCE_CSS_PX,
  LABEL_FONT_SIZE_CSS_PX,
  UNLABELLED_TICK_LENGTH_CSS_PX,
  labelSpacingFloorFor,
  labelTextWidth,
  labelledTickIndexes,
  numberLineGeometry,
  tickLabelText,
} from "./numberLine";
export type { NumberLineGeometry, NumberLineGeometryInput, NumberLineLabel, NumberLineTick } from "./numberLine";

export { GLYPH_ADVANCE_RATIO, GLYPH_LINE_HEIGHT_RATIO, symbolicGeometry } from "./symbolic";
export type { SymbolicGeometry, SymbolicGeometryInput } from "./symbolic";

export { wholeUnitCount } from "./metrics";
export type { GeometryMetrics, PartitionRegion } from "./metrics";
