/**
 * Lane coverage (GAME-187).
 *
 * Coverage is measured per **authored form**, not per value, because that is what a card actually draws:
 * `1/8` and `2/16` are the same quantity but not the same picture, and a 96 px bar model can shade eighths
 * while sixteenths fall below the legibility floor. Measuring the value alone would let a lane validate
 * and then deal a card nobody can read.
 *
 * Two rules come out of it, and both are lane-validity rules rather than runtime surprises:
 *
 * - every authored form a lane could deal must have at least one legible family in its mix at its card box;
 * - if the lane requires a pair's two cards to use different families, every authored form needs at least
 *   two. With two families available per form, a pair can always be assigned two different ones, which is
 *   why the planner never has to guess.
 */

import {
  RepresentationContractError,
  evaluateLegibility,
  type RepresentationFamily,
  type RepresentationRejection,
} from "../representations";
import { laneFamilies, type LaneFamily } from "./families";
import type { LaneConfig } from "./schema";
import { laneWholes, type LaneWholes } from "./wholes";

/** What one authored form of one pool value can be drawn as. */
export type LaneFormCoverage = {
  /** `lane-value-1/2` — diagnostics only. */
  readonly familyId: string;
  /** The authored form, e.g. `2/4`. This is the shape that will be drawn. */
  readonly label: string;
  /** The value it denotes, e.g. `1/2`. */
  readonly canonicalLabel: string;
  readonly legibleFamilies: readonly RepresentationFamily[];
  /** One entry per family that was rejected, carrying the measured reason. */
  readonly rejections: readonly RepresentationRejection[];
};

/** The lane's whole coverage picture. */
export type LaneCoverageReport = {
  readonly forms: readonly LaneFormCoverage[];
  /** Empty when the lane can draw every form it could deal. */
  readonly problems: readonly string[];
  /** How many pool forms each family could draw on its own at the lane's card box. */
  readonly familyFormCounts: Readonly<Record<RepresentationFamily, number>>;
};

function coverageOfForm(lane: LaneConfig, family: LaneFamily, wholes: LaneWholes, numerator: number, denominator: number): LaneFormCoverage {
  const fraction = {
    numerator,
    denominator,
    canonical: { numerator: family.canonicalNumerator, denominator: family.canonicalDenominator },
  };
  const legibleFamilies: RepresentationFamily[] = [];
  const rejections: RepresentationRejection[] = [];

  for (const candidate of lane.representationMix) {
    try {
      const verdict = evaluateLegibility({
        family: candidate.family,
        fraction,
        box: lane.cardBox,
        whole: wholes.resolver(candidate.family),
        ...(candidate.maxPartitionCount === undefined ? {} : { maxPartitionCount: candidate.maxPartitionCount }),
      });
      if (verdict.legible) legibleFamilies.push(candidate.family);
      else rejections.push(Object.freeze({ family: candidate.family, problems: verdict.problems }));
    } catch (error) {
      // A family that cannot express the value at all is a rejection with the contract's own wording.
      if (!(error instanceof RepresentationContractError)) throw error;
      rejections.push(Object.freeze({ family: candidate.family, problems: Object.freeze(error.problems) }));
    }
  }

  return Object.freeze({
    familyId: family.familyId,
    label: `${numerator}/${denominator}`,
    canonicalLabel: `${family.canonicalNumerator}/${family.canonicalDenominator}`,
    legibleFamilies: Object.freeze(legibleFamilies),
    rejections: Object.freeze(rejections),
  });
}

/**
 * Measure every authored form in the lane's pool against every family in its mix.
 *
 * A family that cannot express a value *at all* — a set model of a value at or above one whole — is
 * recorded as a rejection rather than being allowed to abort the report: coverage exists to explain.
 */
export function laneCoverageReport(lane: LaneConfig): LaneCoverageReport {
  const families = laneFamilies(lane);
  const wholes = laneWholes(lane);
  const distinctRequired = lane.requireDistinctRepresentationPerPair !== false;
  const forms: LaneFormCoverage[] = [];
  const problems: string[] = [];
  const familyFormCounts: Record<RepresentationFamily, number> = {
    symbolic: 0,
    bar: 0,
    circle: 0,
    set: 0,
    "number-line": 0,
  };

  for (const family of families) {
    for (const authored of family.forms) {
      const coverage = coverageOfForm(lane, family, wholes, authored.numerator, authored.denominator);
      for (const legible of coverage.legibleFamilies) familyFormCounts[legible] += 1;
      forms.push(coverage);

      const requiredCount = distinctRequired ? 2 : 1;
      if (coverage.legibleFamilies.length >= requiredCount) continue;

      const reasons = coverage.rejections
        .map((rejection) => `${rejection.family}: ${rejection.problems[0] ?? "rejected without a reason"}`)
        .join("; ");
      const label = `${coverage.label} (${coverage.canonicalLabel}) at ${lane.cardBox.width}x${lane.cardBox.height} px`;

      problems.push(
        coverage.legibleFamilies.length === 0
          ? `the form ${label} has no legible representation in this mix: ${reasons}`
          : `the form ${label} has only one legible family (${coverage.legibleFamilies.join(", ")}), but this lane requires a pair's two cards to use ` +
            `different families; add a family that can draw it or set requireDistinctRepresentationPerPair to false. Rejections: ${reasons}`,
      );
    }
  }

  return Object.freeze({
    forms: Object.freeze(forms),
    problems: Object.freeze(problems),
    familyFormCounts: Object.freeze(familyFormCounts),
  });
}
