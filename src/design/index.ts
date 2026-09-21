/**
 * Public design boundary (GAME-188).
 *
 * CONSUMER RULES
 * - This layer is an *authority about appearance*, not about mathematics or content. It never decides
 *   whether two values are equal (the engine owns that), which picture a value gets (GAME-187's lanes ask
 *   GAME-186's legibility policy), or what a lane may deal. It decides sizes, surfaces, states, motion and
 *   the responsive contract.
 * - A consumer asks for a *plan*, not a measurement: `planBoardLayout` answers whether a board fits, so no
 *   component ever has to guess a card size or probe the DOM to find one.
 * - Geometry sizes are inherited, not chosen. `MIN_LEGIBLE_CARD_CSS_PX` is the box GAME-186's legibility
 *   floors were measured at, and the inherited palette is the pair its 3:1 contrast floor was measured
 *   against. This layer restates them and holds itself to them; it does not get to move them.
 * - Motion is presentation only. Every motion declares the non-motion fallback that carries the same
 *   information, so a reduced-motion session is the same product with different rendering.
 *
 * THE FALLBACK DESIGN AUTHORITY
 * The story prefers a persistent Figma `fileKey`. No Figma file exists for this project and no credential
 * to create one is available in this environment, so the checked-in authority is
 * `docs/design/DESIGN_SYSTEM.md`, labelled `FALLBACK / FIGMA NOT QUALIFIED`. That label is not a
 * formality: it records that the design has no figma provenance, and it stays until a real fileKey exists.
 *
 * DOWNSTREAM OWNERS
 * - GAME-189 renders the board and the setup flow, using the states and layout plans declared here.
 * - GAME-190 owns explanatory feedback for a match and a mismatch; this layer only reserves the slot.
 * - GAME-191 owns session bounds, the factual summary and the replay arc.
 * - GAME-192 qualifies the finished interaction and inherits the forced-colors, focus and motion surfaces.
 */

export {
  DESIGN_PALETTE,
  DESIGN_THEMES,
  ELEVATION_TOKENS,
  INHERITED_QUALIFICATION_TOKENS,
  MIN_BODY_TEXT_CONTRAST_RATIO,
  MIN_NON_TEXT_CONTRAST_RATIO,
  MIN_TOUCH_TARGET_CSS_PX,
  RADIUS_TOKENS,
  REQUIRED_CONTRAST_PAIRS,
  SPACING_SCALE_CSS_PX,
  STATE_BORDER_WIDTH_CSS_PX,
  TYPE_TOKENS,
  cssTokenName,
  designTokenNames,
} from "./tokens";
export type { DesignTheme, SpacingStep } from "./tokens";

export {
  CARD_STATES_WITHOUT_COLOUR,
  COLOUR_INDEPENDENT_STATE_IDS,
  DESIGN_STATES,
  colourIndependentCardChannels,
  colourIndependentStates,
  designStateIds,
} from "./states";
export type { CardStateWithoutColour, DesignState, StateSelector } from "./states";

export {
  BASE_VIEWPORTS,
  BOARD_CHROME_CSS_PX,
  BOARD_GAP_CSS_PX,
  HUD_RESERVE_CSS_PX,
  LAYOUT_CLASSES,
  MAX_CARD_CSS_PX,
  MIN_LEGIBLE_CARD_CSS_PX,
  PAGE_PADDING_CSS_PX,
  PANEL_BORDER_CSS_PX,
  PANEL_PADDING_CSS_PX,
  SUPPORTED_ZOOM_LEVELS,
  fitsHorizontally,
  layoutClassFor,
  planBoardLayout,
  planBoardLayouts,
  preferredColumnsFor,
} from "./responsive";
export type { BoardLayout, BoardLayoutRequest, LayoutClass, Viewport, ZoomLevel } from "./responsive";

export {
  CELEBRATION_MAX_DURATION_MS,
  CELEBRATION_SKIP_WITHIN_MS,
  MAX_TRANSITION_DURATION_MS,
  MOTION_KINDS,
  MOTION_PREFERENCES,
  MOTION_SPECS,
  VESTIBULAR_TRIGGERS,
  celebrationMustBeSkippable,
  celebrationPlan,
  motionPlan,
  motionPlanFor,
} from "./motion";
export type { MotionKind, MotionPlan, MotionPreference, MotionSpec, VestibularTrigger } from "./motion";
