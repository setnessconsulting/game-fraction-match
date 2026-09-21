/**
 * Public representation boundary (GAME-186).
 *
 * CONSUMER RULES
 * - Pass engine values (a `FractionForm`) straight in: the contract is structural, so no conversion
 *   layer is needed. This module imports **no** engine module — not even a type — which is what keeps
 *   the dependency one-way (engine -> representations) and lets the layer be extracted later without
 *   moving any mathematical authority.
 * - Always declare the whole. Nothing here infers, reduces or repairs a value: `numerator`,
 *   `denominator` and `canonical` are treated as data supplied by the engine.
 * - Geometry is a one-way projection. Nothing in the DOM, the SVG or the CSS can feed correctness
 *   back into the engine, and no comparison in this layer decides equivalence.
 * - Choosing a family is a *legibility* decision: use `selectLegibleRepresentation` (or
 *   `requireLegibleRepresentation`) with the lane's declared `maxPartitionCount` and wholes rather
 *   than shrinking a fraction below the floors.
 *
 * DOWNSTREAM OWNERS
 * - GAME-187 supplies lane configurations and consumes the legibility selection API.
 * - GAME-188 owns card layout, colour, motion and states; primitives stay ink-only and static.
 * - GAME-189 owns the board; it renders these components and never compares fractions itself.
 * - GAME-192 owns final accessibility qualification; the accessible names here are the shared input.
 */

import "./fractionRepresentation.css";

export { REPRESENTATION_FAMILIES, REPRESENTATION_FAMILY_LABELS, RepresentationContractError } from "./contract";
export { assertFractionValue, assertRepresentationBox, canonicalValuesEqual } from "./contract";
export type {
  CanonicalValue,
  FractionValue,
  RepresentationBox,
  RepresentationFamily,
} from "./contract";

export {
  DEFAULT_CONTINUOUS_WHOLE_ID,
  assertComparisonAllowed,
  axisOfWhole,
  axisPosition,
  axisText,
  comparisonRuleFor,
  continuousWhole,
  discreteSetWhole,
  discreteSetWholeOf,
  numberLineAxis,
  numberLineWhole,
  numberLineWholeOf,
  planRepresentationComparison,
  requireComparisonPlan,
  setSelection,
  wholeText,
} from "./whole";
export type {
  ComparisonPlan,
  ComparisonRuleKind,
  ComparisonSide,
  ContinuousWhole,
  DiscreteSetWhole,
  NumberLineAxis,
  NumberLineWhole,
  RepresentationWhole,
} from "./whole";

export {
  VULGAR_FRACTION_GLYPHS,
  accessibilityLabelFor,
  canonicalNotation,
  canonicalSpokenNotation,
  compactNotation,
  containsVulgarFractionGlyph,
  denominatorWord,
  equivalenceClause,
  isCanonicalForm,
  numberToWords,
  ordinalWord,
  partStatement,
  shortLabelFor,
  spokenNotation,
  stackedNotation,
  textAlternativeFor,
} from "./notation";
export type { AccessibilityLabelInput } from "./notation";

export {
  DIVISION_LINE_TOKENS,
  MIN_CARD_SIZE_CSS_PX,
  MIN_DIVISION_CONTRAST_RATIO,
  MIN_DIVISION_LINE_CSS_PX,
  MIN_PARTITION_REGION_CSS_PX,
  MIN_SYMBOL_GLYPH_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  MIN_TICK_SPACING_CSS_PX,
  RepresentationLegibilityError,
  allRepresentationCandidates,
  contrastRatio,
  divisionLineContrastRatio,
  evaluateLegibility,
  legibilityReport,
  measureGeometry,
  relativeLuminance,
  representationWholes,
  requireLegibleRepresentation,
  selectLegibleRepresentation,
} from "./legibility";
export type {
  LegibilityRequest,
  LegibilityVerdict,
  RepresentationCandidate,
  RepresentationRejection,
  RepresentationSelection,
  RepresentationSelectionRequest,
  RepresentationWholeResolver,
} from "./legibility";

export {
  DIVISION_LINE_THICKNESS_CSS_PX,
  MAX_STRIP_HEIGHT_CSS_PX,
  NOMINAL_BOXES,
  REPRESENTATION_PADDING_CSS_PX,
  STRIP_GAP_CSS_PX,
  clearRegion,
  nominalBox,
  usableBox,
} from "./layout";
export type { DivisionLine, Rect, UsableBox } from "./layout";

export {
  BASELINE_HEIGHT_RATIO,
  FIRST_WEDGE_START_ANGLE_DEG,
  GLYPH_ADVANCE_RATIO,
  GLYPH_LINE_HEIGHT_RATIO,
  LABELLED_TICK_LENGTH_CSS_PX,
  LABEL_CLEARANCE_CSS_PX,
  LABEL_FONT_SIZE_CSS_PX,
  UNLABELLED_TICK_LENGTH_CSS_PX,
  barGeometry,
  circleGeometry,
  labelSpacingFloorFor,
  labelTextWidth,
  labelledTickIndexes,
  numberLineGeometry,
  setGeometry,
  setGridShape,
  symbolicGeometry,
  tickLabelText,
  wholeUnitCount,
} from "./geometry";
export type {
  BarGeometry,
  BarGeometryInput,
  BarOrientation,
  BarPartition,
  BarStrip,
  BarTotals,
  CircleDivision,
  CircleGeometry,
  CircleGeometryInput,
  CircleShape,
  CircleWedge,
  GeometryMetrics,
  NumberLineGeometry,
  NumberLineGeometryInput,
  NumberLineLabel,
  NumberLineTick,
  PartitionRegion,
  SetGeometry,
  SetGeometryInput,
  SetObject,
  SymbolicGeometry,
  SymbolicGeometryInput,
} from "./geometry";

export {
  FractionBar,
  FractionCircle,
  FractionComparison,
  FractionNumberLine,
  FractionSet,
  FractionSymbol,
  RepresentationByFamily,
  RepresentationFrame,
  resolveBox,
} from "./components";
export type {
  BaseRepresentationProps,
  ComparisonSideProps,
  FractionBarProps,
  FractionCircleProps,
  FractionComparisonProps,
  FractionNumberLineProps,
  FractionSetProps,
  FractionSymbolProps,
  RepresentationByFamilyProps,
  RepresentationFrameProps,
} from "./components";
