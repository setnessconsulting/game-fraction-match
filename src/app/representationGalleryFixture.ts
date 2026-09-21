/**
 * REPRESENTATION GALLERY FIXTURE — DEBUG SURFACE, NOT CURRICULUM.
 *
 * GAME-186 ships representation primitives, not a game board, and not a grade lane. Something still
 * has to prove the primitives draw real engine values at the smallest shipped card size, so this
 * fixture builds a small, honest gallery out of four things:
 *
 * 1. authored engine values (`createFractionForm`) covering whole, thirds, quarters, sixths, eighths
 *    and hundredths — chosen because they expose the *legibility* boundaries, not because they are
 *    curriculum;
 * 2. declared wholes per family (a continuous whole, a countable collection, a shared axis), because
 *    no picture here is allowed to invent its whole;
 * 3. the legibility selection result for the smallest shipped card, including every rejection and its
 *    measured reason;
 * 4. the two ways this layer refuses to draw something: a value no visual family can show at 68 px
 *    without shrinking below a floor, and a comparison pair with no shared-whole definition.
 *
 * GAME-187 replaces the value list with reviewed lane configurations; GAME-188 replaces the card
 * chrome; GAME-189 renders the board. Nothing here carries a standards claim, and no denominator set
 * or representation mix should be inferred from it.
 */

import { createFractionForm, type FractionForm } from "../engine";
import {
  MIN_CARD_SIZE_CSS_PX,
  REPRESENTATION_FAMILIES,
  RepresentationContractError,
  continuousWhole,
  discreteSetWhole,
  numberLineAxis,
  numberLineWhole,
  planRepresentationComparison,
  representationWholes,
  selectLegibleRepresentation,
  type ContinuousWhole,
  type DiscreteSetWhole,
  type NumberLineWhole,
  type RepresentationBox,
  type RepresentationCandidate,
  type RepresentationFamily,
  type RepresentationRejection,
  type RepresentationSelection,
  type RepresentationWhole,
  type RepresentationWholeResolver,
} from "../representations";

/** The smallest card this repository declares (see `MIN_CARD_SIZE_CSS_PX` for its derivation). */
export const GALLERY_MIN_CARD_BOX: RepresentationBox = Object.freeze({
  width: MIN_CARD_SIZE_CSS_PX,
  height: MIN_CARD_SIZE_CSS_PX,
});

/** The default card size the gallery renders every family at. Kept in step with `globals.css`. */
export const GALLERY_DEFAULT_CARD_SIZE_CSS_PX = 96;

export const GALLERY_DEFAULT_CARD_BOX: RepresentationBox = Object.freeze({
  width: GALLERY_DEFAULT_CARD_SIZE_CSS_PX,
  height: GALLERY_DEFAULT_CARD_SIZE_CSS_PX,
});

/**
 * The lane order the gallery declares: try a picture first, fall back to the symbol last.
 *
 * A lane owns this order (GAME-187), so this is fixture policy rather than a layer rule — but it is
 * declared as data so the selection result is reproducible and testable.
 */
export const GALLERY_CANDIDATES: readonly RepresentationCandidate[] = Object.freeze(
  (["bar", "circle", "set", "number-line", "symbolic"] as const).map((family) => Object.freeze({ family })),
);

/** A lane with no symbolic fallback — the shape that must refuse rather than shrink. */
export const GALLERY_VISUAL_ONLY_CANDIDATES: readonly RepresentationCandidate[] = Object.freeze(
  GALLERY_CANDIDATES.filter((candidate) => candidate.family !== "symbolic"),
);

/** One shared continuous whole. `2/4` and `1/2` drawn in the same box share this identity. */
export const GALLERY_CONTINUOUS_WHOLE: ContinuousWhole = continuousWhole({
  wholeId: "gallery-unit-whole",
  description: "one whole unit",
});

/** A gallery value: an engine-authored form plus the whole each family would draw for it. */
export type GalleryValue = {
  readonly label: string;
  readonly form: FractionForm;
  readonly continuous: ContinuousWhole;
  readonly set: DiscreteSetWhole;
  readonly numberLine: NumberLineWhole;
  readonly wholes: RepresentationWholeResolver;
};

/** How many objects a value's countable collection contains, and how many parts per unit its axis has. */
export type GalleryValueOptions = {
  /** Total objects in the declared collection. Defaults to the denominator, which is always exact. */
  readonly setTotalObjectCount?: number;
  /** Axis scale. Defaults to the denominator, so the point lands on a real tick. */
  readonly ticksPerUnit?: number;
};

/**
 * Build a gallery value from an authored pair.
 *
 * The collection total and the axis scale are parameters because a *shared* whole is not a per-card
 * choice: two compared cards must declare the same collection total and the same axis scale, which is
 * exactly the constraint this fixture has to exercise.
 */
export function galleryValue(
  numerator: number,
  denominator: number,
  options: GalleryValueOptions = {},
): GalleryValue {
  const form = createFractionForm(numerator, denominator);
  const totalObjectCount = options.setTotalObjectCount ?? denominator;
  const ticksPerUnit = options.ticksPerUnit ?? denominator;

  const set = discreteSetWhole({
    totalObjectCount,
    wholeId: `gallery-collection-of-${totalObjectCount}`,
    description: `one collection of ${totalObjectCount} objects`,
  });
  const numberLine = numberLineWhole({
    axis: numberLineAxis({
      axisId: `gallery-axis-0-1-in-${ticksPerUnit}`,
      ticksPerUnit,
    }),
    description: `one number-line axis marked in ${ticksPerUnit} equal parts`,
  });

  return Object.freeze({
    label: `${numerator}/${denominator}`,
    form,
    continuous: GALLERY_CONTINUOUS_WHOLE,
    set,
    numberLine,
    wholes: representationWholes({ continuous: GALLERY_CONTINUOUS_WHOLE, set, numberLine }),
  });
}

/** One row of the smallest-card section. */
export type GalleryMinRow = {
  readonly value: GalleryValue;
  readonly selection: RepresentationSelection;
  /** The family that will be drawn, or `null` when nothing was legible. */
  readonly family: RepresentationFamily | null;
  /** The whole that family declared, or `null` when nothing was legible. */
  readonly whole: RepresentationWhole | null;
  /** Families rejected before the chosen one, each with its measured problem. */
  readonly rejections: readonly RepresentationRejection[];
};

/**
 * Values for the smallest-card section.
 *
 * Chosen to walk the boundaries: halves and quarters fit a picture at 68 px, sixths sit exactly on the
 * partition floor, eighths push the bar model below it, and hundredths push every visual family below
 * it and force the symbolic fallback.
 */
const GALLERY_MIN_ROW_SPECS: readonly { readonly numerator: number; readonly denominator: number }[] = Object.freeze(
  [
    { numerator: 1, denominator: 2 },
    { numerator: 2, denominator: 4 },
    { numerator: 2, denominator: 3 },
    { numerator: 3, denominator: 4 },
    { numerator: 5, denominator: 6 },
    { numerator: 7, denominator: 8 },
    { numerator: 1, denominator: 100 },
  ],
);

function buildMinRow(numerator: number, denominator: number): GalleryMinRow {
  const value = galleryValue(numerator, denominator);
  const selection = selectLegibleRepresentation(GALLERY_CANDIDATES, {
    fraction: value.form,
    box: GALLERY_MIN_CARD_BOX,
    wholeFor: value.wholes,
  });

  if (!selection.ok) {
    return Object.freeze({ value, selection, family: null, whole: null, rejections: selection.rejections });
  }

  return Object.freeze({
    value,
    selection,
    family: selection.family,
    whole: value.wholes(selection.family),
    rejections: selection.rejections,
  });
}

/** The smallest-card section: one row per value, with the rejections that preceded the choice. */
export const GALLERY_MIN_ROWS: readonly GalleryMinRow[] = Object.freeze(
  GALLERY_MIN_ROW_SPECS.map((spec) => buildMinRow(spec.numerator, spec.denominator)),
);

/** The whole a family declares for a gallery value, or `null` when the fixture declares none. */
export function galleryValueWhole(value: GalleryValue, family: RepresentationFamily): RepresentationWhole | null {
  return value.wholes(family);
}

/** The default-card section: every family, one authored value, one box. */
export const GALLERY_DEFAULT_VALUE: GalleryValue = galleryValue(2, 4);

export type GalleryDefaultRow = {
  readonly family: RepresentationFamily;
  readonly value: GalleryValue;
  readonly whole: RepresentationWhole;
};

export const GALLERY_DEFAULT_ROWS: readonly GalleryDefaultRow[] = Object.freeze(
  REPRESENTATION_FAMILIES.map((family) => {
    const whole = galleryValueWhole(GALLERY_DEFAULT_VALUE, family);
    if (whole === null) {
      throw new RepresentationContractError(`the gallery fixture must declare a whole for ${family}`);
    }
    return Object.freeze({ family, value: GALLERY_DEFAULT_VALUE, whole });
  }),
);

/** One shared-whole comparison the layer supports, drawn as data rather than prose. */
export type GalleryComparison = {
  readonly key: string;
  readonly caption: string;
  readonly left: {
    readonly family: RepresentationFamily;
    readonly value: GalleryValue;
    readonly whole: RepresentationWhole;
  };
  readonly right: {
    readonly family: RepresentationFamily;
    readonly value: GalleryValue;
    readonly whole: RepresentationWhole;
  };
};

/**
 * One side of a gallery comparison.
 *
 * `whole` may be supplied explicitly, which is required whenever a side does not draw the whole it
 * declares: a symbolic card states the whole in words and must therefore state the *same* whole as the
 * picture beside it, and a shared pair uses one declared whole object for both sides.
 */
function comparisonSide(
  family: RepresentationFamily,
  value: GalleryValue,
  declaredWhole?: RepresentationWhole,
): GalleryComparison["left"] {
  const whole = declaredWhole ?? galleryValueWhole(value, family);
  if (whole === null) {
    throw new RepresentationContractError(`the gallery fixture must declare a whole for ${family}`);
  }
  return Object.freeze({ family, value, whole });
}

const SHARED_SET_VALUE = galleryValue(2, 4, { setTotalObjectCount: 8 });
const SHARED_SET_EQUIVALENT = galleryValue(4, 8, { setTotalObjectCount: 8 });
const SHARED_AXIS_VALUE = galleryValue(2, 4, { ticksPerUnit: 8 });
const SHARED_AXIS_EQUIVALENT = galleryValue(6, 8, { ticksPerUnit: 8 });
const HALF = galleryValue(1, 2);

/** The one collection both set sides count into, and the one axis both number lines are drawn on. */
const SHARED_SET_WHOLE = SHARED_SET_VALUE.set;
const SHARED_AXIS_WHOLE = SHARED_AXIS_VALUE.numberLine;

/**
 * The supported comparison pairs from GAME-97's matrix, one row each.
 *
 * Every pair declares its shared whole explicitly, and the set pair and the number-line pair share a
 * collection total and an axis scale respectively, so the pictures are countable against one another.
 */
export const GALLERY_COMPARISONS: readonly GalleryComparison[] = Object.freeze([
  Object.freeze({
    key: "symbolic-vs-bar",
    caption: "A written symbol beside the bar model it names — both shaded amounts count 2 of 4.",
    left: comparisonSide("symbolic", HALF),
    right: comparisonSide("bar", GALLERY_DEFAULT_VALUE),
  }),
  Object.freeze({
    key: "symbolic-vs-circle",
    caption: "A written symbol beside the circle model it names — same value, different picture.",
    left: comparisonSide("symbolic", HALF),
    right: comparisonSide("circle", GALLERY_DEFAULT_VALUE),
  }),
  Object.freeze({
    key: "symbolic-vs-set",
    caption: "A written symbol beside a countable collection: one shared collection of 8 objects.",
    left: comparisonSide("symbolic", SHARED_SET_VALUE, SHARED_SET_WHOLE),
    right: comparisonSide("set", SHARED_SET_EQUIVALENT, SHARED_SET_WHOLE),
  }),
  Object.freeze({
    key: "symbolic-vs-number-line",
    caption: "A written symbol beside a position on one shared axis; both land on the same tick.",
    left: comparisonSide("symbolic", SHARED_AXIS_VALUE, SHARED_AXIS_WHOLE),
    right: comparisonSide("number-line", HALF, SHARED_AXIS_WHOLE),
  }),
  Object.freeze({
    key: "bar-vs-circle",
    caption: "Two area models of different shapes on one declared whole: the shaded regions match.",
    left: comparisonSide("bar", GALLERY_DEFAULT_VALUE),
    right: comparisonSide("circle", HALF),
  }),
  Object.freeze({
    key: "set-vs-set",
    caption: "Two collections with the same total: 4 of 8 objects selected on both sides.",
    left: comparisonSide("set", SHARED_SET_VALUE, SHARED_SET_WHOLE),
    right: comparisonSide("set", SHARED_SET_EQUIVALENT, SHARED_SET_WHOLE),
  }),
  Object.freeze({
    key: "number-line-vs-number-line",
    caption: "Two positions on one shared axis: 2/4 and 6/8 sit on different ticks of the same scale.",
    left: comparisonSide("number-line", SHARED_AXIS_VALUE, SHARED_AXIS_WHOLE),
    right: comparisonSide("number-line", SHARED_AXIS_EQUIVALENT, SHARED_AXIS_WHOLE),
  }),
]);

/**
 * A refusal: something this layer declined to draw, with the exact problems it reported.
 *
 * Refusals are shown, not hidden. A lane that cannot draw a value legibly must fall back or ask for a
 * bigger card, and a comparison with no shared whole has no honest rendering at all.
 */
export type GalleryRefusal = {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly problems: readonly string[];
};

function legibilityRefusal(): GalleryRefusal {
  const value = galleryValue(1, 1000);
  const selection = selectLegibleRepresentation(GALLERY_VISUAL_ONLY_CANDIDATES, {
    fraction: value.form,
    box: GALLERY_MIN_CARD_BOX,
    wholeFor: value.wholes,
  });

  // The selection itself is the assertion: if a visual family ever became legible here, the gallery
  // row would be a lie, so the fixture throws instead of rendering a quietly different story.
  if (selection.ok) {
    throw new RepresentationContractError(
      `the gallery fixture expected 1/1000 to be illegible in a 68 × 68 px box, but ${selection.family} was accepted`,
    );
  }

  return Object.freeze({
    key: "legibility",
    title: "A visual-only lane at the smallest card",
    detail:
      "1/1000 has no legible visual representation at 68 × 68 px, so the lane must fall back to another family or a larger card.",
    problems: selection.problems,
  });
}

function comparisonRefusal(): GalleryRefusal {
  const left = comparisonSide("bar", GALLERY_DEFAULT_VALUE);
  const right = comparisonSide("set", SHARED_SET_VALUE, SHARED_SET_WHOLE);
  const plan = planRepresentationComparison(
    { family: left.family, fraction: left.value.form, whole: left.whole },
    { family: right.family, fraction: right.value.form, whole: right.whole },
  );

  if (plan.problems.length === 0) {
    throw new RepresentationContractError(
      "the gallery fixture expected the bar/set comparison to be refused, but it was accepted",
    );
  }

  return Object.freeze({
    key: "comparison",
    title: "A bar model beside a countable collection",
    detail:
      "Two values with no shared whole definition cannot be compared: the pair is outside the supported matrix.",
    problems: plan.problems,
  });
}

/** Every refusal the gallery surfaces, computed from the layer rather than written by hand. */
export const GALLERY_REFUSALS: readonly GalleryRefusal[] = Object.freeze([legibilityRefusal(), comparisonRefusal()]);
