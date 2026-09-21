/**
 * Lane planning (GAME-187).
 *
 * Planning turns a validated lane into the thing a board renders: a dealt engine deck plus, for every card,
 * the representation family and the declared whole that will draw it.
 *
 * Division of authority is deliberate and complete:
 *
 * - the **engine** chooses which pool values are dealt, how they are paired and how they are shuffled, from
 *   the seed. The planner never shuffles and never reorders, so there is exactly one generator;
 * - **GAME-186's legibility policy** chooses the representation family for each card by measuring the
 *   geometry that card would draw at the lane's box;
 * - **the planner** only relates the two: it keeps a pair's two cards on different families, derives each
 *   card's whole from the lane, and proves the result afterwards ({@link assertLanePlanInvariants}).
 *
 * Coverage validation is what makes the family choice total: every authored form a lane can deal has at
 * least two legible families when the lane asks for two different representations per pair, so the second
 * card of a pair always has somewhere to go. Because that is proved before a deck is ever dealt, the planner
 * asks the representation layer for a *required* legible family rather than a maybe: there is no
 * "no family left" result for it to handle, and a lane that could not be drawn fails loudly in the
 * representation layer's own terms instead of being planned with a hole in it. The per-form evidence a lane
 * author needs lives in `laneCoverageReport`, which measures the whole pool rather than one board.
 */

import { assertDeckEquivalenceInvariants, createDeck, type Deck, type DeckCard, type FractionForm } from "../engine";
import {
  requireLegibleRepresentation,
  type LegibilityVerdict,
  type RepresentationCandidate,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../representations";
import { dealtNearMissLinks, laneEquivalenceFamilies, laneFamilies, nearMissLinks, type NearMissLink } from "./families";
import type { LaneConfig } from "./schema";
import { assertValidLane } from "./validate";
import { laneWholes } from "./wholes";

/** One card as the board will draw it. */
export type LaneCardPlan = {
  readonly cardId: string;
  readonly pairId: string;
  readonly form: FractionForm;
  /** The family the lane's preference order and the legibility floors agreed on. */
  readonly representation: RepresentationFamily;
  readonly whole: RepresentationWhole;
  readonly legibility: LegibilityVerdict;
};

/** One matched pair as the board will draw it. */
export type LanePairPlan = {
  readonly pairId: string;
  readonly canonical: FractionForm["canonical"];
  readonly cards: readonly [LaneCardPlan, LaneCardPlan];
  /** Whether the two cards ended up on different families. The lane asks for this; the plan reports it. */
  readonly distinctRepresentations: boolean;
};

/** A planned lane: the engine's deck, the representation decisions, and measured diagnostics. */
export type LanePlan = {
  readonly lane: LaneConfig;
  readonly seed: number;
  readonly deck: Deck;
  readonly pairs: readonly LanePairPlan[];
  readonly cards: readonly LaneCardPlan[];
  readonly diagnostics: {
    readonly poolSize: number;
    readonly pairCount: number;
    /** Near-miss links available across the whole pool. */
    readonly poolNearMissLinks: readonly NearMissLink[];
    /** Near-miss links between the values actually dealt. Measured, not promised. */
    readonly dealtNearMissLinks: readonly NearMissLink[];
    readonly representationCounts: Readonly<Record<RepresentationFamily, number>>;
  };
};

/** Thrown when a validated lane still cannot be drawn, or when a plan breaks an invariant. */
export class LanePlanError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`lane cannot be planned:\n- ${problems.join("\n- ")}`);
    this.name = "LanePlanError";
    this.problems = [...problems];
  }
}

function emptyRepresentationCounts(): Record<RepresentationFamily, number> {
  return { symbolic: 0, bar: 0, circle: 0, set: 0, "number-line": 0 };
}

/**
 * Plan a lane's board for a seed.
 *
 * @throws {LaneConfigError} when the lane is not valid, with every problem it found.
 * @throws {RepresentationLegibilityError} when a dealt card has no legible family at the lane's box. A
 *   validated lane's coverage already rules this out; it is the representation layer's error so that the
 *   failure names the measurement rather than a lane plan.
 * @throws {LanePlanError} when the finished plan breaks one of its own invariants.
 */
export function planLaneDeck(lane: LaneConfig, seed: number): LanePlan {
  assertValidLane(lane);

  const wholes = laneWholes(lane);
  const distinctRequired = lane.requireDistinctRepresentationPerPair !== false;
  const deck = createDeck({
    pairCount: lane.pairCount,
    families: laneEquivalenceFamilies(lane),
    seed,
    ...(lane.constraints === undefined ? {} : { constraints: lane.constraints }),
  });

  const cards: LaneCardPlan[] = [];
  const pairs: LanePairPlan[] = [];
  const representationCounts = emptyRepresentationCounts();

  /**
   * Choose this card's family, preferring one the partner card is not using.
   *
   * Total for a validated lane: coverage has already proved that every authored form the lane can deal has a
   * legible family at this box, and two of them when the lane insists on a different picture per pair. The
   * deliberate absence of a fallback here is what makes that proof load-bearing — if it were ever false, the
   * representation layer raises its own error instead of this function inventing a picture nobody can read.
   */
  const planCard = (card: DeckCard, avoid: RepresentationFamily | null): LaneCardPlan => {
    const candidates: readonly RepresentationCandidate[] =
      distinctRequired && avoid !== null
        ? lane.representationMix.filter((candidate) => candidate.family !== avoid)
        : lane.representationMix;

    const selection = requireLegibleRepresentation(candidates, {
      fraction: card.form,
      box: lane.cardBox,
      wholeFor: wholes.resolver,
    });

    const whole = wholes.resolver(selection.family);
    representationCounts[selection.family] += 1;
    return Object.freeze({
      cardId: card.cardId,
      pairId: card.pairId,
      form: card.form,
      representation: selection.family,
      whole,
      legibility: selection.verdict,
    });
  };

  const indexesByPair = new Map<string, number[]>();
  deck.cards.forEach((card, index) => {
    const bucket = indexesByPair.get(card.pairId) ?? [];
    bucket.push(index);
    indexesByPair.set(card.pairId, bucket);
  });

  for (const [pairId, indexes] of indexesByPair) {
    // The engine deals exactly two cards per equivalence family — `createDeck` proves it with
    // `assertDeckEquivalenceInvariants` before returning, and `assertLanePlanInvariants` re-derives the shape
    // of the finished plan from the deck afterwards — so there is no "a pair with the wrong number of cards"
    // case to handle here.
    const pairCards: readonly [DeckCard, DeckCard] = [deck.cards[indexes[0]!]!, deck.cards[indexes[1]!]!];

    const first = planCard(pairCards[0], null);
    const second = planCard(pairCards[1], first.representation);

    pairs.push(
      Object.freeze({
        pairId,
        canonical: first.form.canonical,
        cards: Object.freeze([first, second]) as readonly [LaneCardPlan, LaneCardPlan],
        distinctRepresentations: first.representation !== second.representation,
      }),
    );
    cards.push(first, second);
  }

  const pool = laneFamilies(lane);
  const plan: LanePlan = Object.freeze({
    lane,
    seed,
    deck,
    pairs: Object.freeze(pairs),
    cards: Object.freeze(cards),
    diagnostics: Object.freeze({
      poolSize: pool.length,
      pairCount: lane.pairCount,
      poolNearMissLinks: nearMissLinks(pool),
      dealtNearMissLinks: dealtNearMissLinks(deck.usedFamilyIds, pool),
      representationCounts: Object.freeze(representationCounts),
    }),
  });

  assertLanePlanInvariants(plan);
  return plan;
}

/**
 * Prove a plan's shape without trusting the planner.
 *
 * Card-level facts are re-derived from the engine's deck rather than read back from the plan's own
 * bookkeeping, so a planning bug cannot hide behind its own identifiers. Exported so a fixture, a browser
 * test or a future story can assert a plan it did not build.
 *
 * @throws {LanePlanError} when the plan could not be rendered honestly.
 */
export function assertLanePlanInvariants(plan: LanePlan): void {
  const problems: string[] = [];

  if (plan.cards.length !== plan.lane.pairCount * 2) {
    problems.push(`expected ${plan.lane.pairCount * 2} planned card(s), found ${plan.cards.length}`);
  }
  if (plan.pairs.length !== plan.lane.pairCount) {
    problems.push(`expected ${plan.lane.pairCount} planned pair(s), found ${plan.pairs.length}`);
  }

  // The engine's own invariant: every value appears exactly twice. Reused rather than re-implemented.
  try {
    assertDeckEquivalenceInvariants(plan.deck.cards, plan.lane.pairCount);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  for (const pair of plan.pairs) {
    const [first, second] = pair.cards;
    if (first.cardId === second.cardId) {
      problems.push(`pair "${pair.pairId}" planned the same card twice`);
      continue;
    }
    if (first.form.numerator === second.form.numerator && first.form.denominator === second.form.denominator) {
      problems.push(`pair "${pair.pairId}" planned two identical authored forms (${first.form.numerator}/${first.form.denominator})`);
    }

    for (const card of pair.cards) {
      if (!card.legibility.legible) {
        problems.push(`card ${card.cardId} was planned with an illegible ${card.representation} representation`);
      }
      if (card.whole.wholeId === "") {
        problems.push(`card ${card.cardId} was planned without a declared whole`);
      }
    }

    if (plan.lane.requireDistinctRepresentationPerPair !== false && !pair.distinctRepresentations) {
      problems.push(
        `pair "${pair.pairId}" drew both cards as ${first.representation}; the lane requires two different families`,
      );
    }
  }

  for (const card of plan.cards) {
    const deckCard = plan.deck.cards.find((candidate) => candidate.cardId === card.cardId);
    if (deckCard === undefined) {
      problems.push(`planned card ${card.cardId} does not exist in the deck`);
      continue;
    }
    if (deckCard.form.numerator !== card.form.numerator || deckCard.form.denominator !== card.form.denominator) {
      problems.push(`planned card ${card.cardId} does not match the deck's authored form`);
    }
  }

  if (problems.length > 0) throw new LanePlanError(problems);
}
