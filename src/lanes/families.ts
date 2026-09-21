/**
 * Lane value pool (GAME-187).
 *
 * A lane's pool is every value its catalogue can express, together with the authored forms that express
 * it. Both halves matter:
 *
 * - the *value* is mathematics, so it is derived with the engine's `rational` and compared with the
 *   engine's `rationalEquals`, never with local arithmetic or string keys;
 * - the *authored forms* are content, so `1/2` arrives as `1/2`, `2/4` and `3/6` whenever the catalogue
 *   contains those denominators. Equivalent notation is the whole point of the game, so a value with only
 *   one authored form is not a usable pair and is left out of the pool.
 *
 * Distractors are a *pool composition* property. A near-miss link is two pool values whose authored forms
 * share a numerator or a denominator, which is what makes a wrong answer look plausible rather than
 * random. Because the engine owns which pool values actually reach a board, the pool is what a lane can
 * promise; the dealt board's links are measured afterwards and reported as diagnostics.
 */

import { rational, rationalEquals, type FractionFormInput, type EquivalenceFamily } from "../engine";
import { DEFAULT_MAX_FORMS_PER_FAMILY, LANE_MIN_DENOMINATOR, type LaneConfig } from "./schema";

/** One pool value: its canonical pair plus every authored form the catalogue can write for it. */
export type LaneFamily = {
  /** Diagnostics only. Never consulted when deciding equivalence. */
  readonly familyId: string;
  readonly canonicalNumerator: number;
  readonly canonicalDenominator: number;
  readonly forms: readonly FractionFormInput[];
};

/** How two pool values resemble each other, which is what makes one a plausible distractor. */
export type NearMissKind = "same-numerator" | "same-denominator" | "same-numerator-and-denominator";

/** One near-miss link between two pool values. */
export type NearMissLink = {
  readonly leftFamilyId: string;
  readonly rightFamilyId: string;
  readonly kind: NearMissKind;
  /** The shared signals themselves, e.g. `n:2`, `d:6`, so a reviewer can see why the link exists. */
  readonly sharedSignals: readonly string[];
};

/** Authored signals a value shows on its face: every numerator and every denominator it can be written with. */
export function nearMissSignals(family: LaneFamily): readonly string[] {
  const signals = new Set<string>();
  for (const form of family.forms) {
    signals.add(`n:${form.numerator}`);
    signals.add(`d:${form.denominator}`);
  }
  return Object.freeze([...signals].sort());
}

/**
 * The authored numerators a catalogue denominator may carry under a lane's policy.
 *
 * `allowImproper` adds `d+1 .. 2d-1`, which is the largest range that stays inside two wholes.
 */
export function laneNumerators(lane: LaneConfig, denominator: number): readonly number[] {
  const policy = lane.numeratorPolicy ?? {};
  const numerators: number[] = [];

  if (policy.allowZero === true) numerators.push(0);
  for (let numerator = 1; numerator < denominator; numerator += 1) numerators.push(numerator);
  if (policy.allowWhole === true) numerators.push(denominator);
  if (policy.allowImproper === true) {
    for (let numerator = denominator + 1; numerator <= denominator * 2 - 1; numerator += 1) numerators.push(numerator);
  }

  return Object.freeze(numerators);
}

/**
 * Build the lane's pool.
 *
 * Deterministic: catalogue denominators are considered smallest first, numerators in ascending order, and
 * the first authored form set found for a value wins. The order is stable but never used for selection —
 * the engine shuffles the pool to choose a board.
 */
export function laneFamilies(lane: LaneConfig): readonly LaneFamily[] {
  const denominators = [...new Set(lane.denominatorCatalogue)]
    .filter((denominator) => Number.isSafeInteger(denominator) && denominator >= LANE_MIN_DENOMINATOR)
    .sort((left, right) => left - right);
  const maxForms = lane.maxFormsPerFamily ?? DEFAULT_MAX_FORMS_PER_FAMILY;
  const families: LaneFamily[] = [];

  for (const denominator of denominators) {
    for (const numerator of laneNumerators(lane, denominator)) {
      const canonical = rational(numerator, denominator);
      if (families.some((family) => rationalEquals(canonicalPairOf(family), canonical))) continue;

      const forms: FractionFormInput[] = [];
      for (const candidate of denominators) {
        if (candidate % denominator !== 0) continue;
        const scale = candidate / denominator;
        forms.push({ numerator: numerator * scale, denominator: candidate });
        if (forms.length >= maxForms) break;
      }

      // A value with a single authored form cannot be a pair: the two cards would be the same picture.
      if (forms.length < 2) continue;

      families.push(
        Object.freeze({
          familyId: `lane-value-${canonical.numerator}/${canonical.denominator}`,
          canonicalNumerator: canonical.numerator,
          canonicalDenominator: canonical.denominator,
          forms: Object.freeze(forms),
        }),
      );
    }
  }

  return Object.freeze(families);
}

function canonicalPairOf(family: LaneFamily): { readonly numerator: number; readonly denominator: number } {
  return { numerator: family.canonicalNumerator, denominator: family.canonicalDenominator };
}

/** The pool in the engine's own shape, ready to hand to the deck generator. */
export function laneEquivalenceFamilies(lane: LaneConfig): readonly EquivalenceFamily[] {
  return Object.freeze(
    laneFamilies(lane).map((family) =>
      Object.freeze({ familyId: family.familyId, forms: family.forms }),
    ),
  );
}

/** Every near-miss link in a pool, in a stable order. */
export function nearMissLinks(families: readonly LaneFamily[]): readonly NearMissLink[] {
  const signals = families.map((family) => new Set(nearMissSignals(family)));
  const links: NearMissLink[] = [];

  for (let left = 0; left < families.length; left += 1) {
    for (let right = left + 1; right < families.length; right += 1) {
      const sharedSignals = [...(signals[left] ?? new Set<string>())]
        .filter((signal) => signals[right]?.has(signal) === true)
        .sort();
      if (sharedSignals.length === 0) continue;

      const sharesNumerator = sharedSignals.some((signal) => signal.startsWith("n:"));
      const sharesDenominator = sharedSignals.some((signal) => signal.startsWith("d:"));
      links.push(
        Object.freeze({
          leftFamilyId: families[left]!.familyId,
          rightFamilyId: families[right]!.familyId,
          kind: sharesNumerator && sharesDenominator ? "same-numerator-and-denominator" : sharesNumerator ? "same-numerator" : "same-denominator",
          sharedSignals: Object.freeze(sharedSignals),
        }),
      );
    }
  }

  return Object.freeze(links);
}

/** Pool values that have no near-miss neighbour at all. A pool made of these is a random quiz. */
export function familiesWithoutNearMissLinks(families: readonly LaneFamily[]): readonly string[] {
  const linked = new Set<string>();
  for (const link of nearMissLinks(families)) {
    linked.add(link.leftFamilyId);
    linked.add(link.rightFamilyId);
  }
  return Object.freeze(families.filter((family) => !linked.has(family.familyId)).map((family) => family.familyId));
}

/** Near-miss links between the values of one dealt board. Diagnostics, measured after the fact. */
export function dealtNearMissLinks(deckFamilyIds: readonly string[], pool: readonly LaneFamily[]): readonly NearMissLink[] {
  const dealt = new Set(deckFamilyIds);
  return Object.freeze(
    nearMissLinks(pool).filter((link) => dealt.has(link.leftFamilyId) && dealt.has(link.rightFamilyId)),
  );
}
