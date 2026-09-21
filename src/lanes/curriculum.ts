/**
 * Curriculum map (GAME-187).
 *
 * This is the repository's *standards posture* as data. It is deliberately separate from the lane
 * mechanism: a lane says what can be dealt, and the curriculum map says which lane is shipped for which
 * grade band and which claim that lane is allowed to make.
 *
 * Three rules keep the map honest:
 *
 * - **The claim is explicit.** Every standard connection is labelled `primary`, `supporting` or
 *   `review-only`. Nothing here is inferred from a lane's shape, so a lane cannot silently acquire a
 *   claim it was never reviewed for.
 * - **The denominator sets are the story's, verbatim.** Grade 3 deals `2, 3, 4, 6, 8`; grade 4 deals
 *   `2, 3, 4, 5, 6, 8, 10, 12, 100`. {@link gradeBandDenominatorProblems} fails when a lane escapes its
 *   band, which is what makes "the grade 3 generator never emits a ninth" a checked statement rather than
 *   a convention. Grade 5 is review-only support and adds no denominator of its own: it reuses the union
 *   of the grade 3 and grade 4 catalogues.
 * - **The exclusions are written down.** What the game does *not* teach is as much a part of the map as
 *   what it does, and the validator refuses a line that claims a band without stating its limits.
 *
 * The map is validated by {@link curriculumProblems}, which re-checks every lane with the lane layer's own
 * `validateLaneConfig` rather than trusting this file.
 */

import { PRODUCTION_PAIR_COUNT, WARM_UP_PAIR_COUNT } from "../engine";
import type { RepresentationFamily } from "../representations";
import { HUNDRED_PART_DENOMINATOR, type GradeBand, type LaneConfig } from "./schema";
import { validateLaneConfig } from "./validate";

/** How strong a standards connection the map is allowed to claim. */
export type CurriculumClaim = "primary" | "supporting" | "review-only";

/** Canonical claim order, strongest first. */
export const CURRICULUM_CLAIMS: readonly CurriculumClaim[] = Object.freeze([
  "primary",
  "supporting",
  "review-only",
]);

/** One standard code and the claim made about it. */
export type CurriculumStandard = {
  readonly code: string;
  readonly claim: CurriculumClaim;
};

/** One grade band's curriculum line: what it claims, what it deals, what it refuses. */
export type CurriculumLine = {
  readonly gradeBand: GradeBand;
  readonly title: string;
  readonly standards: readonly CurriculumStandard[];
  /** The story's denominator catalogue for this band. A lane's catalogue must be a subset. */
  readonly allowedDenominators: readonly number[];
  /** Every representation family the line's lanes may offer, in canonical order. */
  readonly representationFamilies: readonly RepresentationFamily[];
  /** What this band deliberately does *not* teach or claim. Never empty. */
  readonly exclusions: readonly string[];
  readonly lanes: readonly LaneConfig[];
  /** Reviewer-facing notes: decisions that are not obvious from the fields above. */
  readonly notes: readonly string[];
};

/** The card box the curriculum lanes were qualified at. GAME-188 owns the real production card size. */
export const CURRICULUM_CARD_BOX = Object.freeze({ width: 96, height: 96 });

/**
 * Grade 3, number-line positions: a narrow catalogue on a coarse axis, which is the only shape in which a
 * number line stays legible on the shipped card. That is what serves 3.NF.A.2.
 */
const GRADE_3_NUMBER_LINE_LANE: LaneConfig = Object.freeze({
  laneId: "g3-number-line-halves-quarters-eighths",
  gradeBand: "grade-3",
  title: "Grade 3 — fractions as numbers on a number line",
  pairCount: 3,
  cardBox: CURRICULUM_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 4, 8]),
  numeratorPolicy: Object.freeze({ allowZero: false, allowWhole: false, allowImproper: false }),
  scaleFactors: Object.freeze([2, 4]),
  representationMix: Object.freeze([
    Object.freeze({ family: "number-line" as const }),
    Object.freeze({ family: "bar" as const, maxPartitionCount: 8 }),
    Object.freeze({ family: "circle" as const, maxPartitionCount: 8 }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  whole: Object.freeze({
    continuousWholeId: "g3-number-line-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 8,
    setWholeId: "g3-number-line-collection-of-8",
    setWholeDescription: "one collection of 8 counters",
    axisId: "g3-number-line-axis-0-1-in-8",
    ticksPerUnit: 8,
  }),
  labelVisibility: "always",
  thresholds: Object.freeze({ progression: 2, fallback: 2, review: 1 }),
  distractorPolicy: Object.freeze({ minimumRationalGap: Object.freeze({ numerator: 1, denominator: 8 }) }),
});

/** Grade 3, equivalent fractions with visual reasoning: the wide catalogue at 4 pairs. */
const GRADE_3_WIDE_LANE: LaneConfig = Object.freeze({
  laneId: "g3-equivalent-fractions-halves-to-eighths",
  gradeBand: "grade-3",
  title: "Grade 3 — equivalent fractions with visual models",
  pairCount: WARM_UP_PAIR_COUNT,
  cardBox: CURRICULUM_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 3, 4, 6, 8]),
  numeratorPolicy: Object.freeze({ allowZero: false, allowWhole: false, allowImproper: false }),
  scaleFactors: Object.freeze([2, 3, 4]),
  representationMix: Object.freeze([
    Object.freeze({ family: "bar" as const, maxPartitionCount: 8 }),
    Object.freeze({ family: "circle" as const, maxPartitionCount: 8 }),
    Object.freeze({ family: "set" as const, maxPartitionCount: 24 }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  whole: Object.freeze({
    continuousWholeId: "g3-wide-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 24,
    setWholeId: "g3-wide-collection-of-24",
    setWholeDescription: "one collection of 24 counters",
    axisId: "g3-wide-axis-0-1-in-24",
    ticksPerUnit: 24,
  }),
  labelVisibility: "always",
  thresholds: Object.freeze({ progression: 2, fallback: 2, review: 1 }),
  distractorPolicy: Object.freeze({
    families: Object.freeze(["same-numerator" as const, "same-denominator" as const]),
  }),
});

/**
 * Grade 4, generate and recognise equivalents: the full published catalogue including 100.
 *
 * `requireDistinctRepresentationPerPair` is false on purpose. A hundredth has exactly one legible family
 * at the shipped card, so insisting on two *different* pictures for every pair would make the catalogue
 * undealable; the story's supported pair families explicitly include `symbolic ↔ symbolic`.
 */
const GRADE_4_LANE: LaneConfig = Object.freeze({
  laneId: "g4-equivalent-fractions-full-catalogue",
  gradeBand: "grade-4",
  title: "Grade 4 — generate and recognise equivalent fractions",
  pairCount: PRODUCTION_PAIR_COUNT,
  cardBox: CURRICULUM_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, 100]),
  numeratorPolicy: Object.freeze({ allowZero: false, allowWhole: false, allowImproper: false }),
  scaleFactors: Object.freeze([2, 3, 4, 5, 6]),
  representationMix: Object.freeze([
    Object.freeze({ family: "circle" as const, maxPartitionCount: 12 }),
    Object.freeze({ family: "bar" as const, maxPartitionCount: 12 }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  requireDistinctRepresentationPerPair: false,
  whole: Object.freeze({
    continuousWholeId: "g4-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 600,
    setWholeId: "g4-collection-of-600",
    setWholeDescription: "one collection of 600 counters",
    axisId: "g4-axis-0-1-in-600",
    ticksPerUnit: 600,
  }),
  labelVisibility: "always",
  thresholds: Object.freeze({ progression: 2, fallback: 2, review: 1 }),
  distractorPolicy: Object.freeze({
    minimumRationalGap: Object.freeze({ numerator: 1, denominator: 600 }),
    families: Object.freeze(["same-numerator" as const, "same-denominator" as const]),
  }),
});

/**
 * Grade 5, review-only: lower scaffolding (labels withheld until a match), a wider family mix, and the
 * same denominator catalogue as grade 4. It adds no standard of its own and claims no operation.
 */
const GRADE_5_LANE: LaneConfig = Object.freeze({
  laneId: "g5-review-lower-scaffolding",
  gradeBand: "grade-5",
  title: "Grade 5 — review-only equivalence with lower scaffolding",
  pairCount: PRODUCTION_PAIR_COUNT,
  cardBox: CURRICULUM_CARD_BOX,
  denominatorCatalogue: Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, 100]),
  numeratorPolicy: Object.freeze({ allowZero: false, allowWhole: false, allowImproper: false }),
  scaleFactors: Object.freeze([2, 3, 4, 5, 6]),
  representationMix: Object.freeze([
    Object.freeze({ family: "number-line" as const }),
    Object.freeze({ family: "circle" as const, maxPartitionCount: 12 }),
    Object.freeze({ family: "bar" as const, maxPartitionCount: 12 }),
    Object.freeze({ family: "symbolic" as const }),
  ]),
  requireDistinctRepresentationPerPair: false,
  whole: Object.freeze({
    continuousWholeId: "g5-unit-whole",
    continuousWholeDescription: "one whole unit",
    setTotalObjectCount: 600,
    setWholeId: "g5-collection-of-600",
    setWholeDescription: "one collection of 600 counters",
    axisId: "g5-axis-0-1-in-600",
    ticksPerUnit: 600,
  }),
  labelVisibility: "on-reveal",
  thresholds: Object.freeze({ progression: 1, fallback: 1, review: 1 }),
  distractorPolicy: Object.freeze({
    minimumRationalGap: Object.freeze({ numerator: 1, denominator: 600 }),
    families: Object.freeze(["same-numerator" as const, "same-denominator" as const]),
  }),
});

/** The denominator catalogues the map ships, per grade band. Grade 5 declares no denominator of its own. */
export const GRADE_BAND_DENOMINATOR_CATALOGUES: Readonly<Record<GradeBand, readonly number[]>> = Object.freeze({
  "grade-3": Object.freeze([2, 3, 4, 6, 8]),
  "grade-4": Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, HUNDRED_PART_DENOMINATOR]),
  "grade-5": Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, HUNDRED_PART_DENOMINATOR]),
});

/** The checked-in curriculum map, in grade order. */
export const CURRICULUM_MAP: readonly CurriculumLine[] = Object.freeze([
  Object.freeze({
    gradeBand: "grade-3" as const,
    title: "Grade 3 — fractions as numbers and simple equivalents",
    standards: Object.freeze([
      Object.freeze({ code: "3.NF.A.2", claim: "primary" as const }),
      Object.freeze({ code: "3.NF.A.3a", claim: "primary" as const }),
      Object.freeze({ code: "3.NF.A.3b", claim: "primary" as const }),
      Object.freeze({ code: "3.NF.A.3c", claim: "primary" as const }),
    ]),
    allowedDenominators: GRADE_BAND_DENOMINATOR_CATALOGUES["grade-3"],
    representationFamilies: Object.freeze([
      "number-line",
      "bar",
      "circle",
      "set",
      "symbolic",
    ] as const),
    exclusions: Object.freeze([
      "no denominator outside 2, 3, 4, 6 and 8 is dealt at grade 3",
      "equivalence is never asserted across two different wholes",
      "the number line is only offered by the narrow-catalogue lane, because an axis fine enough for sixths and eighths collapses tick spacing below the legibility floor at the shipped card size",
      "no fraction addition, subtraction, multiplication or division is taught or assessed",
    ]),
    lanes: Object.freeze([GRADE_3_NUMBER_LINE_LANE, GRADE_3_WIDE_LANE]),
    notes: Object.freeze([
      "the wide lane ships four pairs because the catalogue yields more usable values than the number-line lane",
    ]),
  }),
  Object.freeze({
    gradeBand: "grade-4" as const,
    title: "Grade 4 — generate and recognise equivalent fractions",
    standards: Object.freeze([
      Object.freeze({ code: "4.NF.A.1", claim: "primary" as const }),
      Object.freeze({ code: "4.NF.A.2", claim: "supporting" as const }),
    ]),
    allowedDenominators: GRADE_BAND_DENOMINATOR_CATALOGUES["grade-4"],
    representationFamilies: Object.freeze(["circle", "bar", "symbolic"] as const),
    exclusions: Object.freeze([
      "denominator 100 is never drawn as a 100-part card grid; it resolves symbolically",
      "no unlike-whole comparison is offered, so 4.NF.A.2 is claimed only for same-whole reasoning",
      "no decimal notation and no decimal/fraction conversion",
      "no fraction arithmetic",
    ]),
    lanes: Object.freeze([GRADE_4_LANE]),
    notes: Object.freeze([
      "one lane ships with the full published catalogue; its pair count is the production board",
      "requiring two different representations per pair is switched off, because a hundredth has only one legible family at the shipped card",
    ]),
  }),
  Object.freeze({
    gradeBand: "grade-5" as const,
    title: "Grade 5 — review-only equivalence support",
    standards: Object.freeze([
      Object.freeze({ code: "5.NF.A.1", claim: "review-only" as const }),
      Object.freeze({ code: "5.NF.A.2", claim: "review-only" as const }),
      Object.freeze({ code: "5.NF.B.5b", claim: "review-only" as const }),
    ]),
    allowedDenominators: GRADE_BAND_DENOMINATOR_CATALOGUES["grade-5"],
    representationFamilies: Object.freeze(["number-line", "circle", "bar", "symbolic"] as const),
    exclusions: Object.freeze([
      "the game does not add, subtract, multiply or divide fractions, so no 5.NF.A or 5.NF.B operation is taught or assessed",
      "grade 5 adds no denominator of its own: it reuses the grade 3 and grade 4 catalogues",
      "no scaling or resizing of fraction quantities is claimed",
      "no mastery, placement or proficiency conclusion is produced",
    ]),
    lanes: Object.freeze([GRADE_5_LANE]),
    notes: Object.freeze([
      "lower scaffolding is expressed as labelVisibility on-reveal rather than as new content",
      "the number line is offered but its axis cannot be legible while 100 is in the catalogue, so the floors reject it and the symbolic family carries the value",
    ]),
  }),
]);

/** The line for one grade band, or `null` when the band is not shipped. */
export function curriculumLineFor(gradeBand: GradeBand): CurriculumLine | null {
  return CURRICULUM_MAP.find((line) => line.gradeBand === gradeBand) ?? null;
}

/** Every curriculum lane across every shipped band, in map order. */
export function curriculumLanes(): readonly LaneConfig[] {
  return Object.freeze(CURRICULUM_MAP.flatMap((line) => line.lanes));
}

/**
 * The denominator rule: a lane may only deal denominators its grade band published.
 *
 * Kept out of `validateLaneConfig` on purpose. The neutral fixture lanes in `src/app/laneFixtures.ts`
 * carry no standards claim, and binding them to a grade catalogue would turn a labelling convention into
 * a false curriculum statement. A shipped lane is checked by the map, which is where the claim lives.
 */
export function gradeBandDenominatorProblems(lane: LaneConfig): readonly string[] {
  const problems: string[] = [];
  if (typeof lane !== "object" || lane === null) return Object.freeze(problems);
  if (!Array.isArray(lane.denominatorCatalogue)) return Object.freeze(problems);

  const allowed = GRADE_BAND_DENOMINATOR_CATALOGUES[lane.gradeBand];
  if (allowed === undefined) return Object.freeze(problems);

  for (const [index, denominator] of lane.denominatorCatalogue.entries()) {
    if (!allowed.includes(denominator)) {
      problems.push(
        `denominatorCatalogue[${index}] is ${String(denominator)}, outside the published ${String(lane.gradeBand)} catalogue ${JSON.stringify(allowed)}`,
      );
    }
  }
  return Object.freeze(problems);
}

/** Every problem that would make a curriculum line's claims untrue. An empty list means "honest". */
export function curriculumLineProblems(line: CurriculumLine): readonly string[] {
  const problems: string[] = [];

  if (typeof line !== "object" || line === null) return Object.freeze(["curriculum line must be an object"]);

  if (typeof line.title !== "string" || line.title.trim() === "") {
    problems.push("curriculum line title must be a non-empty string");
  }

  if (!GRADE_BAND_DENOMINATOR_CATALOGUES[line.gradeBand]) {
    problems.push(`curriculum line declares an unknown grade band ${String(line.gradeBand)}`);
  }

  if (!Array.isArray(line.standards) || line.standards.length === 0) {
    problems.push(`curriculum line for ${String(line.gradeBand)} names no standard`);
  } else {
    const codes = new Set<string>();
    const bandNumber = String(line.gradeBand).replace("grade-", "");
    for (const [index, standard] of line.standards.entries()) {
      if (typeof standard.code !== "string" || standard.code.trim() === "") {
        problems.push(`standards[${index}] must name a non-empty standard code`);
      } else if (codes.has(standard.code)) {
        problems.push(`standards[${index}] repeats standard code "${standard.code}"`);
      } else {
        codes.add(standard.code);
      }
      if (!CURRICULUM_CLAIMS.includes(standard.claim)) {
        problems.push(`standards[${index}] must claim one of ${CURRICULUM_CLAIMS.join(", ")}; received ${String(standard.claim)}`);
        continue;
      }
      // Only a review-only claim may reach across grade bands. A primary or supporting claim must be about
      // this band's own standards, which is the rule that keeps the map from inflating what a lane teaches.
      if (standard.claim !== "review-only" && !standard.code.startsWith(`${bandNumber}.`)) {
        problems.push(
          `standards[${index}] claims ${standard.code} as ${standard.claim}, but that is not a ${String(line.gradeBand)} standard; ` +
            "another grade's standard may only be claimed review-only",
        );
      }
    }
  }

  if (!Array.isArray(line.exclusions) || line.exclusions.length === 0) {
    problems.push(`curriculum line for ${String(line.gradeBand)} states no exclusion`);
  }

  if (!Array.isArray(line.lanes) || line.lanes.length === 0) {
    problems.push(`curriculum line for ${String(line.gradeBand)} ships no lane`);
    return Object.freeze(problems);
  }

  const shippedFamilies = new Set<RepresentationFamily>();
  const laneIds = new Set<string>();

  for (const [index, lane] of line.lanes.entries()) {
    if (typeof lane !== "object" || lane === null) {
      problems.push(`lanes[${index}] must be a lane`);
      continue;
    }
    if (laneIds.has(lane.laneId)) problems.push(`lanes[${index}] repeats laneId "${lane.laneId}"`);
    laneIds.add(lane.laneId);

    if (lane.gradeBand !== line.gradeBand) {
      problems.push(`lanes[${index}] ("${lane.laneId}") declares gradeBand ${String(lane.gradeBand)}, but its line is ${String(line.gradeBand)}`);
    }

    for (const problem of gradeBandDenominatorProblems(lane)) {
      problems.push(`lanes[${index}] ("${lane.laneId}"): ${problem}`);
    }
    for (const problem of validateLaneConfig(lane)) {
      problems.push(`lanes[${index}] ("${lane.laneId}"): ${problem}`);
    }

    for (const candidate of lane.representationMix) {
      if (typeof candidate === "object" && candidate !== null) shippedFamilies.add(candidate.family);
    }
  }

  const declared = [...line.representationFamilies].sort();
  const shipped = [...shippedFamilies].sort();
  if (declared.join(",") !== shipped.join(",")) {
    problems.push(
      `curriculum line for ${String(line.gradeBand)} declares representation families [${declared.join(", ")}] ` +
        `but its lanes ship [${shipped.join(", ")}]; a family claim must match what is actually dealt`,
    );
  }

  return Object.freeze(problems);
}

/** Every problem across the whole map. */
export function curriculumProblems(map: readonly CurriculumLine[] = CURRICULUM_MAP): readonly string[] {
  const problems: string[] = [];
  const bands = new Set<string>();

  for (const line of map) {
    if (bands.has(line.gradeBand)) problems.push(`curriculum map repeats grade band ${String(line.gradeBand)}`);
    bands.add(line.gradeBand);

    for (const problem of curriculumLineProblems(line)) {
      problems.push(`${String(line.gradeBand)}: ${problem}`);
    }
  }

  return Object.freeze(problems);
}
