/**
 * Motion specification (GAME-188).
 *
 * Motion in this game is **presentation only**. That is not a stylistic claim, it is a structural one, and
 * it is enforced in two places rather than promised in one:
 *
 * - `motionPlanFor("reduced")` returns the *same outcomes* with zero duration and no movement, so a reduced
 *   motion preference cannot change what a learner sees or learns.
 * - GAME-186's primitives are prohibited from carrying any motion at all — `transition: none` and
 *   `animation: none` are the only permitted values in the representation stylesheet — so the geometry a
 *   legibility floor measured can never be moving while it is measured.
 *
 * BOUNDED MEANS BOUNDED
 * Celebration is capped at `CELEBRATION_MAX_DURATION_MS` and must be skippable within
 * `CELEBRATION_SKIP_WITHIN_MS`. Both numbers are asserted, not documented, and a celebration that could not
 * be skipped would be a finding rather than a taste disagreement.
 *
 * NO MOTION CARRIES UNIQUE INFORMATION
 * Every entry declares the `nonMotionFallback` that carries the same information when motion is absent. If a
 * state's only signal were its animation, the reduced-motion variant would be a different *product* rather
 * than a different *rendering*, which is what this field exists to prevent.
 */

/** The motion vocabulary. */
export const MOTION_KINDS = Object.freeze([
  "reveal",
  "selection",
  "comparison",
  "match-confirmation",
  "mismatch-recovery",
  "celebration",
] as const);
export type MotionKind = (typeof MOTION_KINDS)[number];

/** The two motion preferences the game responds to. There is no third setting. */
export const MOTION_PREFERENCES = Object.freeze(["full", "reduced"] as const);
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** Celebration bounds. `skippable` is a product guarantee, not a nicety. */
export const CELEBRATION_MAX_DURATION_MS = 2500;
export const CELEBRATION_SKIP_WITHIN_MS = 1000;

/** The longest any non-celebration transition may run. */
export const MAX_TRANSITION_DURATION_MS = 400;

/** Movements that reduced motion must never perform, because they are vestibular triggers. */
export const VESTIBULAR_TRIGGERS = Object.freeze(["rotation", "parallax", "translation", "scale", "flip3d"] as const);
export type VestibularTrigger = (typeof VESTIBULAR_TRIGGERS)[number];

export type MotionSpec = {
  readonly kind: MotionKind;
  readonly durationMs: number;
  readonly easing: string;
  /** Movement performed at full motion. Empty means the transition is a cross-fade or an instant change. */
  readonly movement: readonly VestibularTrigger[];
  /** What carries the same information when motion is unavailable or unwanted. */
  readonly nonMotionFallback: string;
  /** Whether the learner may skip it. Only the celebration is skippable; the rest are too short to need it. */
  readonly skippable: boolean;
  readonly notes: string;
};

/** The full-motion specification. */
export const MOTION_SPECS: readonly MotionSpec[] = Object.freeze([
  Object.freeze({
    kind: "reveal",
    durationMs: 220,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["flip3d"] as const),
    nonMotionFallback: "the card face changes in place with no rotation",
    skippable: false,
    notes: "A revealed card is decided by the engine before the flip starts; the flip never gates the value.",
  }),
  Object.freeze({
    kind: "selection",
    durationMs: 120,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["scale"] as const),
    nonMotionFallback: "the selection marker and boundary weight appear immediately",
    skippable: false,
    notes: "Selection emphasis is the shortest transition: it acknowledges input, it does not perform.",
  }),
  Object.freeze({
    kind: "comparison",
    durationMs: 200,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["translation"] as const),
    nonMotionFallback: "both cards sit on the shared comparison strip at once",
    skippable: false,
    notes: "The comparison strip is a layout, not an animation, so removing the motion keeps the meaning.",
  }),
  Object.freeze({
    kind: "match-confirmation",
    durationMs: 260,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["scale"] as const),
    nonMotionFallback: "the matched marker glyph and the shared-value statement appear at once",
    skippable: false,
    notes: "The engine result is already true when this starts; the animation is a rendering of a settled fact.",
  }),
  Object.freeze({
    kind: "mismatch-recovery",
    durationMs: 320,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["translation"] as const),
    nonMotionFallback: "both cards remain visible for the inspection window and then clear together",
    skippable: false,
    notes:
      "Recovery motion must never rush the inspection window: the 1.2s minimum inspection is a GAME-190 contract and motion cannot shorten it.",
  }),
  Object.freeze({
    kind: "celebration",
    durationMs: 2400,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    movement: Object.freeze(["scale", "translation"] as const),
    nonMotionFallback: "a static completion state with the session facts already on screen",
    skippable: true,
    notes:
      "Bounded and skippable: the completion state is already on screen before it starts, so skipping costs nothing.",
  }),
]);

/** One motion's plan under one preference. */
export type MotionPlan = {
  readonly kind: MotionKind;
  readonly preference: MotionPreference;
  readonly durationMs: number;
  readonly easing: string;
  readonly movement: readonly VestibularTrigger[];
  readonly skippable: boolean;
  /** Identical across preferences for the same kind — that is the parity guarantee, expressed as data. */
  readonly outcome: string;
};

function specFor(kind: MotionKind): MotionSpec {
  const spec = MOTION_SPECS.find((candidate) => candidate.kind === kind);
  if (spec === undefined) throw new Error(`no motion spec is declared for "${kind}"`);
  return spec;
}

/**
 * The plan for one motion under one preference.
 *
 * Under `reduced`, duration is zero and movement is empty — but `outcome` is byte-identical to the full
 * variant, because reduced motion is a different rendering of the same result, never a different result.
 */
export function motionPlanFor(kind: MotionKind, preference: MotionPreference): MotionPlan {
  const spec = specFor(kind);
  const reduced = preference === "reduced";

  return Object.freeze({
    kind,
    preference,
    durationMs: reduced ? 0 : spec.durationMs,
    easing: reduced ? "linear" : spec.easing,
    movement: reduced ? Object.freeze([]) : spec.movement,
    skippable: spec.skippable,
    outcome: spec.nonMotionFallback,
  });
}

/** Every motion plan under one preference, so a test can iterate the whole contract rather than a sample. */
export function motionPlan(preference: MotionPreference): readonly MotionPlan[] {
  return Object.freeze(MOTION_KINDS.map((kind) => motionPlanFor(kind, preference)));
}

/** The celebration's plan under one preference. */
export function celebrationPlan(preference: MotionPreference): MotionPlan {
  return motionPlanFor("celebration", preference);
}

/** Whether a celebration must expose a skip affordance from its first frame. */
export function celebrationMustBeSkippable(): boolean {
  return specFor("celebration").skippable && specFor("celebration").durationMs > CELEBRATION_SKIP_WITHIN_MS;
}
