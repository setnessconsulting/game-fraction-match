/**
 * Design tokens (GAME-188).
 *
 * This module is the machine-readable half of the design authority. The reviewer-facing half is
 * `docs/design/DESIGN_SYSTEM.md`, and the two are kept in step by `tests/designTokens.test.ts`, which
 * parses both the stylesheet and this module and fails if they drift.
 *
 * WHY THESE ARE MIRRORED RATHER THAN IMPORTED
 * `src/app/globals.css` is the thing the browser actually paints. A token module that the stylesheet
 * imported cannot exist (CSS cannot import TypeScript), so the honest arrangement is: the stylesheet is
 * the painted value, this module is the reasoned value, and a test proves they are the same. That is the
 * same arrangement `DIVISION_LINE_TOKENS` already uses for the GAME-186 contrast floor.
 *
 * THE GAME-186 PALETTE IS INHERITED, NOT REDESIGNED
 * `text` and `surface` are the pair GAME-186's 3:1 division-line contrast floor was measured against, and
 * `MIN_CARD_SIZE_CSS_PX` is the box its legibility floors were measured at. GAME-188 therefore *adds*
 * tokens around that qualified base and re-states the inherited ones verbatim. Changing an inherited
 * value would silently invalidate a floor another story proved, so the guard test pins them exactly.
 *
 * The GAME-188 layer is pure data and pure functions: it imports no package, no engine, no
 * representation, no lane and no React. A design authority that could reach into the thing it is
 * describing would not be an authority, and `npm run check:design` fails the build if it tries.
 */

/** The two themes the game ships. There is no third, and no theme is a mode of the other. */
export const DESIGN_THEMES = Object.freeze(["light", "dark"] as const);
export type DesignTheme = (typeof DESIGN_THEMES)[number];

/**
 * The inherited GAME-186 qualification surface.
 *
 * These four values are *not* GAME-188's to choose: `divisionLineContrastRatio()` in
 * `src/representations/legibility.ts` computes the 3:1 floor from exactly these pairs, so a design pass
 * that "improved" them would be changing a measurement another layer depends on. `tests/designTokens.test.ts`
 * asserts they are unchanged.
 */
export const INHERITED_QUALIFICATION_TOKENS = Object.freeze({
  light: Object.freeze({ text: "#1d2430", surface: "#ffffff" }),
  dark: Object.freeze({ text: "#eef1f5", surface: "#1c222b" }),
});

/**
 * Every colour the design system paints, per theme.
 *
 * `text` and `surface` are inherited (see above). The rest are GAME-188's, and each one exists because a
 * required state needed a surface, a boundary or an ink that the inherited six could not express.
 */
export const DESIGN_PALETTE: Readonly<Record<DesignTheme, Readonly<Record<string, string>>>> = Object.freeze({
  light: Object.freeze({
    // Inherited: the GAME-186 contrast pair.
    text: "#1d2430",
    surface: "#ffffff",
    // GAME-188 additions.
    background: "#f6f4ef",
    muted: "#5a6472",
    border: "#d5d0c6",
    accent: "#2f5d8a",
    /** The board itself, so cards read as objects on a surface rather than as a flat sheet. */
    surfaceSunken: "#eceae4",
    /** A resting card face. Equal to `surface` today; separated so a card can gain depth without moving the floor. */
    surfaceRaised: "#ffffff",
    /** Boundaries that carry meaning (selected, pressed) rather than decoration. */
    borderStrong: "#8b8578",
    /** The focus indicator. Deliberately not `accent`: a focus ring must stay visible on accent-filled surfaces too. */
    focusRing: "#1a4d7a",
    /** Ink for a matched pair. A colour signal only — the state must also read without colour. */
    inkMatched: "#1f5c3a",
    /** Ink for a mismatch. Never used as punishment: it labels an inspectable relationship. */
    inkMismatch: "#8a3a2a",
  }),
  dark: Object.freeze({
    // Inherited: the GAME-186 contrast pair.
    text: "#eef1f5",
    surface: "#1c222b",
    // GAME-188 additions.
    background: "#14181f",
    muted: "#a6b0bd",
    border: "#333c48",
    accent: "#8fb8e0",
    surfaceSunken: "#10141a",
    surfaceRaised: "#232a34",
    borderStrong: "#6b7889",
    focusRing: "#a8ccf0",
    inkMatched: "#7fd4a0",
    inkMismatch: "#f0a892",
  }),
});

/** The CSS custom-property name for a token: `text` -> `--fm-text`. */
export function cssTokenName(token: string): string {
  return `--fm-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** Every token name, in a stable order, so a test can iterate the contract rather than a sample of it. */
export function designTokenNames(): readonly string[] {
  return Object.freeze(Object.keys(DESIGN_PALETTE.light));
}

/**
 * Non-text contrast floors the design system holds itself to.
 *
 * WCAG 2.2 AA sets 3:1 for UI components and graphical objects (1.4.11) and 4.5:1 for body text
 * (1.4.3). They are separate numbers on purpose: a boundary that only has to be *findable* is a
 * different requirement from ink that has to be *read*.
 */
export const MIN_NON_TEXT_CONTRAST_RATIO = 3;
export const MIN_BODY_TEXT_CONTRAST_RATIO = 4.5;

/** Which token pairs the design system requires to hold a contrast floor. Each is asserted in a test. */
export const REQUIRED_CONTRAST_PAIRS: readonly {
  readonly id: string;
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}[] = Object.freeze([
  Object.freeze({ id: "body-text-on-surface", foreground: "text", background: "surface", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "body-text-on-background", foreground: "text", background: "background", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "text-on-raised-surface", foreground: "text", background: "surfaceRaised", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "muted-text-on-surface", foreground: "muted", background: "surface", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "focus-ring-on-surface", foreground: "focusRing", background: "surface", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "focus-ring-on-background", foreground: "focusRing", background: "background", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "focus-ring-on-sunken-surface", foreground: "focusRing", background: "surfaceSunken", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "focus-ring-on-raised-surface", foreground: "focusRing", background: "surfaceRaised", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "strong-border-on-surface", foreground: "borderStrong", background: "surface", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "strong-border-on-raised-surface", foreground: "borderStrong", background: "surfaceRaised", minimum: MIN_NON_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "matched-ink-on-surface", foreground: "inkMatched", background: "surface", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
  Object.freeze({ id: "mismatch-ink-on-surface", foreground: "inkMismatch", background: "surface", minimum: MIN_BODY_TEXT_CONTRAST_RATIO }),
]);

/**
 * Spacing scale, in CSS pixels.
 *
 * A closed scale rather than arbitrary values: `boardGapCssPx` below has to fit a 16-card board on a
 * 320px-wide phone, and that budget is only checkable if the steps are known.
 */
export const SPACING_SCALE_CSS_PX = Object.freeze([0, 2, 4, 8, 12, 16, 24, 32, 48] as const);
export type SpacingStep = (typeof SPACING_SCALE_CSS_PX)[number];

/** Radii, in CSS pixels. `pill` is the only non-pixel value and is declared as such. */
export const RADIUS_TOKENS = Object.freeze({
  card: 12,
  panel: 16,
  control: 10,
  focus: 4,
} as const);

/** Type scale, in CSS pixels, with the line heights each step ships with. */
export const TYPE_TOKENS = Object.freeze({
  display: Object.freeze({ fontSizePx: 32, lineHeightPx: 40, weight: 700 }),
  title: Object.freeze({ fontSizePx: 22, lineHeightPx: 30, weight: 700 }),
  heading: Object.freeze({ fontSizePx: 18, lineHeightPx: 26, weight: 600 }),
  body: Object.freeze({ fontSizePx: 16, lineHeightPx: 24, weight: 400 }),
  label: Object.freeze({ fontSizePx: 14, lineHeightPx: 20, weight: 600 }),
  micro: Object.freeze({ fontSizePx: 13, lineHeightPx: 18, weight: 400 }),
  /** The fraction stamp on a card. Its size is owned by geometry, never by this scale. */
  stamp: Object.freeze({ fontSizePx: 26, lineHeightPx: 30, weight: 700 }),
} as const);

/** Elevation is expressed as a border plus an offset shadow so it survives forced colors. */
export const ELEVATION_TOKENS = Object.freeze({
  resting: Object.freeze({ shadowOffsetYCssPx: 1, shadowBlurCssPx: 0 }),
  raised: Object.freeze({ shadowOffsetYCssPx: 2, shadowBlurCssPx: 6 }),
} as const);

/**
 * The minimum interactive target, in CSS pixels.
 *
 * This is the accessibility floor (WCAG 2.2 AA 2.5.8 Target Size (Minimum) is 24px; the 44px here is the
 * more demanding comfortable-touch figure the story requires). It is deliberately *smaller* than
 * `MIN_LEGIBLE_CARD_CSS_PX`: a control that is not a picture only has to be touchable, whereas a card
 * that carries a representation must also be readable.
 */
export const MIN_TOUCH_TARGET_CSS_PX = 44;

/** The border widths that carry state without colour. */
export const STATE_BORDER_WIDTH_CSS_PX = Object.freeze({
  resting: 1,
  emphasized: 2,
  matched: 3,
} as const);
