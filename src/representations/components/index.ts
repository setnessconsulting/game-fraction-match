/**
 * Representation components (GAME-186).
 *
 * React/SVG primitives, one per supported family, plus the shared two-value comparison view. They are
 * pure projections: props in, markup out, no state, no timers, no randomness and no engine imports.
 */

export { FractionBar } from "./FractionBar";
export type { FractionBarProps } from "./FractionBar";

export { FractionCircle } from "./FractionCircle";
export type { FractionCircleProps } from "./FractionCircle";

export { FractionComparison } from "./FractionComparison";
export type { ComparisonSideProps, FractionComparisonProps } from "./FractionComparison";

export { FractionNumberLine } from "./FractionNumberLine";
export type { FractionNumberLineProps } from "./FractionNumberLine";

export { FractionSet } from "./FractionSet";
export type { FractionSetProps } from "./FractionSet";

export { FractionSymbol } from "./FractionSymbol";
export type { FractionSymbolProps } from "./FractionSymbol";

export { RepresentationByFamily } from "./RepresentationByFamily";
export type { RepresentationByFamilyProps } from "./RepresentationByFamily";

export { RepresentationFrame } from "./RepresentationFrame";
export type { RepresentationFrameProps } from "./RepresentationFrame";

export { resolveBox } from "./types";
export type { BaseRepresentationProps } from "./types";
