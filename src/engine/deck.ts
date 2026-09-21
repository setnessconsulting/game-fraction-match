/**
 * Generic deterministic deck generator.
 *
 * GAME-185 owns the *mechanism*, not the curriculum. Grade 3/4/5 lanes, denominator catalogues,
 * representation mixes and distractor policy belong to GAME-187 and arrive here purely as
 * configuration data.
 *
 * The generator deterministically:
 *  1. chooses the required number of distinct mathematical equivalence classes;
 *  2. chooses two valid authored forms from each chosen class;
 *  3. creates exactly two cards per chosen mathematical value;
 *  4. guarantees that no two chosen pair families collapse to the same canonical value;
 *  5. shuffles the complete deck from the supplied seed.
 *
 * There is one implementation for every board size: the 4-pair warm-up and the 8-pair production
 * board differ only by `pairCount`.
 *
 * Unsatisfiable configuration fails loudly ({@link DeckConfigError}) instead of quietly weakening
 * a requirement.
 */

import { createFractionFormFromInput, type FractionForm, type FractionFormInput } from "./fractionForm";
import {
  countRationalOccurrences,
  distinctRationals,
  rationalEquals,
  type Rational,
} from "./rational";
import { createSeededRandom, seedProblem, shuffled, type SeededRandom } from "./rng";

/** Warm-up board size owned by GAME-97's product loop (all faces visible, same interaction). */
export const WARM_UP_PAIR_COUNT = 4;

/** Production board size owned by GAME-97's product loop. */
export const PRODUCTION_PAIR_COUNT = 8;

/** Smallest board this generic generator will produce. */
export const MIN_PAIR_COUNT = 2;

/**
 * Defensive upper bound. This is not a product decision: it exists so that an accidental
 * configuration mistake fails loudly instead of allocating an unusable board.
 */
export const MAX_PAIR_COUNT = 32;

/** One mathematical equivalence class, expressed as authored forms that share one canonical value. */
export type EquivalenceFamily = {
  /**
   * Authoring label used for generation diagnostics. It is never consulted when deciding whether
   * two cards are equivalent.
   */
  readonly familyId: string;
  /** At least two authored forms denoting the same canonical value. */
  readonly forms: readonly FractionFormInput[];
};

/** Generic generator constraints supplied by the caller (a future lane definition). */
export type DeckConstraints = {
  /**
   * Require the two cards of a pair to use visually distinct authored forms, so `1/2` and `2/4`
   * can never be the same written expression. Defaults to `true`.
   */
  readonly requireDistinctAuthoredForms?: boolean;
};

/** Everything the generator needs. All of it is data, supplied from outside the engine. */
export type DeckConfig = {
  readonly pairCount: number;
  readonly families: readonly EquivalenceFamily[];
  readonly seed: number;
  readonly constraints?: DeckConstraints;
};

/**
 * A dealt card.
 *
 * `cardId` is stable identity for rendering and animation.
 * `pairId` exists for generation/debugging only. It must never determine a match: correctness is
 * decided exclusively by comparing canonical rational values in the state machine.
 */
export type DeckCard = {
  readonly cardId: string;
  readonly pairId: string;
  readonly form: FractionForm;
};

/** A fully dealt, shuffled deck. */
export type Deck = {
  readonly seed: number;
  readonly pairCount: number;
  readonly cardCount: number;
  readonly cards: readonly DeckCard[];
  /** Authoring labels of the selected families, in selection order. Diagnostics only. */
  readonly usedFamilyIds: readonly string[];
};

/** Thrown when a deck configuration cannot be satisfied as written. */
export class DeckConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`deck configuration is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "DeckConfigError";
    this.problems = [...problems];
  }
}

/** Thrown when a generated deck violates a required mathematical invariant. */
export class DeckInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckInvariantError";
  }
}

type PreparedFamily = {
  readonly familyId: string;
  readonly forms: readonly FractionForm[];
  readonly canonical: Rational;
  /** Authored-distinct forms, in first-seen order. */
  readonly distinctForms: readonly FractionForm[];
};

function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `array(length ${value.length})`;
  if (value === null) return "null";
  return typeof value;
}

/** Read a message out of anything that was thrown, without assuming an error type. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameAuthoredForm(left: FractionForm, right: FractionForm): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/** Validate a configuration and return the problems found. An empty list means "usable". */
export function validateDeckConfig(config: DeckConfig): readonly string[] {
  return prepareFamilies(config).problems;
}

/** Non-throwing configuration check. */
export function isSatisfiableDeckConfig(config: DeckConfig): boolean {
  return validateDeckConfig(config).length === 0;
}

function prepareFamilies(config: DeckConfig): { families: PreparedFamily[]; problems: string[] } {
  const problems: string[] = [];

  if (typeof config !== "object" || config === null) {
    return { families: [], problems: [`deck config must be an object; received ${describe(config)}`] };
  }

  const { pairCount, families, seed } = config;
  const constraints: DeckConstraints = config.constraints ?? {};
  const requireDistinct = constraints.requireDistinctAuthoredForms !== false;

  if (!Number.isSafeInteger(pairCount)) {
    problems.push(`pairCount must be a safe integer; received ${describe(pairCount)}`);
  } else if (pairCount < MIN_PAIR_COUNT) {
    problems.push(`pairCount must be at least ${MIN_PAIR_COUNT}; received ${pairCount}`);
  } else if (pairCount > MAX_PAIR_COUNT) {
    problems.push(`pairCount must be at most ${MAX_PAIR_COUNT}; received ${pairCount}`);
  }

  const seedIssue = seedProblem(seed);
  if (seedIssue !== null) problems.push(seedIssue);

  if (!Array.isArray(families)) {
    problems.push(`families must be an array; received ${describe(families)}`);
    return { families: [], problems };
  }

  // Re-established explicitly: `Array.isArray` narrows to `any[]`, which would erase the element
  // type for every check below.
  const familyList: readonly EquivalenceFamily[] = families;

  if (familyList.length === 0) {
    problems.push("families must contain at least one equivalence family");
  }

  if (Number.isSafeInteger(pairCount) && familyList.length > 0 && familyList.length < pairCount) {
    problems.push(
      `pairCount ${pairCount} needs at least ${pairCount} distinct equivalence families; received ${familyList.length}`,
    );
  }

  const prepared: PreparedFamily[] = [];
  const seenFamilyIds = new Set<string>();
  const seenCanonicals: Rational[] = [];

  familyList.forEach((family, familyIndex) => {
    const label = `families[${familyIndex}]`;

    if (typeof family !== "object" || family === null) {
      problems.push(`${label} must be an object; received ${describe(family)}`);
      return;
    }

    const familyId = family.familyId;
    if (typeof familyId !== "string" || familyId.trim() === "") {
      problems.push(`${label}.familyId must be a non-empty string; received ${describe(familyId)}`);
    } else if (seenFamilyIds.has(familyId)) {
      problems.push(`${label}.familyId "${familyId}" is duplicated`);
    } else {
      seenFamilyIds.add(familyId);
    }

    if (!Array.isArray(family.forms)) {
      problems.push(`${label}.forms must be an array; received ${describe(family.forms)}`);
      return;
    }
    if (family.forms.length < 2) {
      problems.push(`${label} ("${String(familyId)}") needs at least two authored forms; received ${family.forms.length}`);
      return;
    }

    const forms: FractionForm[] = [];
    let formsValid = true;
    family.forms.forEach((input, formIndex) => {
      try {
        forms.push(createFractionFormFromInput(input));
      } catch (error) {
        formsValid = false;
        problems.push(`${label}.forms[${formIndex}] is not a valid fraction form: ${messageOf(error)}`);
      }
    });
    if (!formsValid || forms.length === 0) return;

    const canonical = forms[0]!.canonical;
    for (const form of forms) {
      if (!rationalEquals(form.canonical, canonical)) {
        problems.push(
          `${label} ("${String(familyId)}") is not an equivalence family: all forms must share one canonical value`,
        );
        return;
      }
    }

    const collapseTarget = seenCanonicals.find((existing) => rationalEquals(existing, canonical));
    if (collapseTarget !== undefined) {
      problems.push(
        `${label} ("${String(familyId)}") duplicates the canonical value of an earlier family ` +
          `(${collapseTarget.numerator}/${collapseTarget.denominator}); different pairs may not be mathematically equivalent`,
      );
      return;
    }
    seenCanonicals.push(canonical);

    const distinctForms: FractionForm[] = [];
    for (const form of forms) {
      if (!distinctForms.some((existing) => sameAuthoredForm(existing, form))) distinctForms.push(form);
    }
    if (requireDistinct && distinctForms.length < 2) {
      problems.push(
        `${label} ("${String(familyId)}") needs two visually distinct authored forms but supplies ` +
          `${distinctForms.length} (${distinctForms.map((form) => `${form.numerator}/${form.denominator}`).join(", ")}); ` +
          "set constraints.requireDistinctAuthoredForms to false to allow repeated notation",
      );
      return;
    }

    prepared.push({ familyId: String(familyId), forms, canonical, distinctForms });
  });

  return { families: prepared, problems };
}

function stageTwoForms(
  random: SeededRandom,
  forms: readonly FractionForm[],
): { readonly first: FractionForm; readonly second: FractionForm } {
  const order = shuffled(
    random,
    forms.map((_, index) => index),
  );
  return { first: forms[order[0]!]!, second: forms[order[1]!]! };
}

/**
 * Deal a deterministic deck.
 *
 * @throws {DeckConfigError} when the configuration is unsatisfiable as written.
 * @throws {DeckInvariantError} if the dealt deck violates a required mathematical invariant. This
 * can only fire if generation itself is broken, and it fails loudly rather than shipping a board
 * with the wrong number of equivalent values.
 */
export function createDeck(config: DeckConfig): Deck {
  const { families: prepared, problems } = prepareFamilies(config);
  if (problems.length > 0) throw new DeckConfigError(problems);

  const requireDistinct = config.constraints?.requireDistinctAuthoredForms !== false;
  const random = createSeededRandom(config.seed);

  const familyOrder = shuffled(
    random,
    prepared.map((_, index) => index),
  );
  const chosenFamilies = familyOrder.slice(0, config.pairCount).map((index) => prepared[index]!);

  const staged: { readonly pairId: string; readonly form: FractionForm }[] = [];
  for (const family of chosenFamilies) {
    const candidates = requireDistinct ? family.distinctForms : family.forms;
    const { first, second } = stageTwoForms(random, candidates);
    staged.push({ pairId: family.familyId, form: first });
    staged.push({ pairId: family.familyId, form: second });
  }

  const dealt = shuffled(random, staged);
  const cards: DeckCard[] = dealt.map((card, index) =>
    Object.freeze({ cardId: `fm-card-${index}`, pairId: card.pairId, form: card.form }),
  );

  assertDeckEquivalenceInvariants(cards, config.pairCount);

  return Object.freeze({
    seed: config.seed,
    pairCount: config.pairCount,
    cardCount: cards.length,
    cards: Object.freeze(cards),
    usedFamilyIds: Object.freeze(chosenFamilies.map((family) => family.familyId)),
  });
}

/**
 * Prove the dealt board's mathematical shape without consulting any identifier.
 *
 * Every distinct canonical value must appear exactly twice, and there must be exactly
 * `pairCount` of them. This deliberately never looks at `pairId`, so a generation bug cannot be
 * hidden by identifier bookkeeping. Exported so the invariant is directly unit-testable against
 * hand-built card lists.
 *
 * @throws {DeckInvariantError} when the card list cannot be a valid board.
 */
export function assertDeckEquivalenceInvariants(cards: readonly DeckCard[], pairCount: number): void {
  const canonicals = cards.map((card) => card.form.canonical);
  const distinctValues = distinctRationals(canonicals);
  if (distinctValues.length !== pairCount) {
    throw new DeckInvariantError(
      `expected ${pairCount} distinct mathematical values, generated ${distinctValues.length}`,
    );
  }
  for (const value of distinctValues) {
    const occurrences = countRationalOccurrences(canonicals, value);
    if (occurrences !== 2) {
      throw new DeckInvariantError(
        `every generated value must appear exactly twice; ${value.numerator}/${value.denominator} appears ${occurrences} time(s)`,
      );
    }
  }
}
