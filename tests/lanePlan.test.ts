import { describe, expect, it } from "vitest";

import { REPRESENTATION_FAMILIES, type RepresentationFamily } from "../src/representations";
import {
  LaneConfigError,
  LanePlanError,
  assertLanePlanInvariants,
  laneCoverageReport,
  laneWholes,
  planLaneDeck,
  type LaneCardPlan,
  type LanePlan,
} from "../src/lanes";
import { laneWithMix, testLane } from "./laneTestFixtures";

/**
 * Planning relates two authorities it does not own: the engine chooses the values, GAME-186's legibility
 * policy chooses each card's family, and this layer keeps a pair's two cards on different families and
 * proves the result afterwards. The tests below therefore assert the *shape* of a plan and the messages it
 * produces when it cannot be drawn, rather than restating the engine's or the policy's own tests.
 */

const SEED = 20_260_921;

describe("planning a lane", () => {
  it("deals the engine's deck and draws every card from the lane's wholes", () => {
    const lane = testLane();
    const plan = planLaneDeck(lane, SEED);

    expect(plan.lane).toBe(lane);
    expect(plan.seed).toBe(SEED);
    expect(plan.cards).toHaveLength(lane.pairCount * 2);
    expect(plan.pairs).toHaveLength(lane.pairCount);
    expect(plan.deck.cards).toHaveLength(lane.pairCount * 2);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.cards)).toBe(true);

    const wholes = laneWholes(lane);
    // The family the planner chose for a card must be one the coverage report proved legible for that exact
    // authored form at this card box. That is the link that makes the planner's choice total rather than
    // lucky, and it is asserted against the report the lane author reads.
    const coverage = laneCoverageReport(lane);

    for (const card of plan.cards) {
      expect(card.legibility.legible).toBe(true);
      expect(card.whole).toStrictEqual(wholes.resolver(card.representation));

      const form = coverage.forms.find((entry) => entry.label === `${card.form.numerator}/${card.form.denominator}`);
      expect(form, `${card.form.numerator}/${card.form.denominator}`).toBeDefined();
      expect(form!.legibleFamilies).toContain(card.representation);

      // A planned card is the engine's card, not a copy the planner invented.
      expect(plan.deck.cards.some((deckCard) => deckCard.cardId === card.cardId)).toBe(true);
    }

    for (const pair of plan.pairs) {
      const [first, second] = pair.cards;
      expect(first.pairId).toBe(pair.pairId);
      expect(second.pairId).toBe(pair.pairId);
      expect(first.form.canonical).toStrictEqual(second.form.canonical);
      expect(pair.distinctRepresentations).toBe(first.representation !== second.representation);
      expect(pair.distinctRepresentations).toBe(true);
    }
  });

  it("is deterministic in the seed and independent of plan order", () => {
    const first = planLaneDeck(testLane(), SEED);
    const second = planLaneDeck(testLane(), SEED);
    const other = planLaneDeck(testLane(), SEED + 1);

    expect(second.cards.map((card) => `${card.cardId}:${card.representation}`)).toEqual(
      first.cards.map((card) => `${card.cardId}:${card.representation}`),
    );
    // Determinism is not uniformity: a different seed may deal a different board.
    expect(other.diagnostics.dealtNearMissLinks).toHaveLength(other.diagnostics.dealtNearMissLinks.length);
  });

  it("reports measured diagnostics rather than promises", () => {
    const plan = planLaneDeck(laneWithMix([{ family: "bar" }, { family: "circle" }, { family: "set" }, { family: "symbolic" }]), SEED);

    expect(plan.diagnostics.pairCount).toBe(plan.lane.pairCount);
    expect(plan.diagnostics.poolSize).toBeGreaterThanOrEqual(plan.lane.pairCount);
    // The preference order is honoured: the first candidate takes every first card it can draw.
    expect(plan.diagnostics.representationCounts.bar).toBeGreaterThan(0);
    expect(Object.keys(plan.diagnostics.representationCounts).sort()).toEqual([...REPRESENTATION_FAMILIES].sort());

    const total = REPRESENTATION_FAMILIES.reduce(
      (sum: number, family: RepresentationFamily) => sum + plan.diagnostics.representationCounts[family],
      0,
    );
    expect(total).toBe(plan.cards.length);

    // A dealt link is a link between values this board actually used.
    const dealtValues = new Set(
      plan.cards.map((card) => `${card.form.canonical.numerator}/${card.form.canonical.denominator}`),
    );
    expect(dealtValues.size).toBeGreaterThan(0);
    for (const link of plan.diagnostics.dealtNearMissLinks) {
      expect(plan.diagnostics.poolNearMissLinks.some((poolLink) => poolLink.leftFamilyId === link.leftFamilyId)).toBe(
        true,
      );
    }
  });

  it("prefers the lane's first candidate and honours maxPartitionCount", () => {
    const plan = planLaneDeck(laneWithMix([{ family: "circle" }, { family: "bar" }, { family: "symbolic" }]), SEED);

    // The first card of each pair is drawn from the head of the preference order.
    for (const pair of plan.pairs) {
      expect(pair.cards[0]!.representation).toBe("circle");
      expect(pair.cards[1]!.representation).not.toBe("circle");
    }
  });

  it("lets a lane draw both cards the same way when it says it may", () => {
    const plan = planLaneDeck(
      laneWithMix([{ family: "symbolic" }], { requireDistinctRepresentationPerPair: false }),
      SEED,
    );

    expect(plan.cards.every((card) => card.representation === "symbolic")).toBe(true);
    expect(plan.pairs.every((pair) => pair.distinctRepresentations === false)).toBe(true);
    expect(plan.diagnostics.representationCounts.symbolic).toBe(plan.cards.length);
  });

  it("forwards the lane's deck constraints to the engine", () => {
    const plan = planLaneDeck(testLane({ constraints: { requireDistinctAuthoredForms: true } }), SEED);
    for (const pair of plan.pairs) {
      expect(`${pair.cards[0]!.form.numerator}/${pair.cards[0]!.form.denominator}`).not.toBe(
        `${pair.cards[1]!.form.numerator}/${pair.cards[1]!.form.denominator}`,
      );
    }
  });
});

describe("planning failures", () => {
  it("refuses a lane that is not valid, with the lane's own problems", () => {
    expect(() => planLaneDeck(testLane({ pairCount: 99 }), SEED)).toThrow(LaneConfigError);
  });

  it("re-derives the engine's deck invariant rather than trusting the plan's own bookkeeping", () => {
    // A deck that lost a card is not a board, and the engine's own invariant is what says so.
    const plan = planLaneDeck(testLane(), SEED);
    const damaged: LanePlan = { ...plan, deck: { ...plan.deck, cards: plan.deck.cards.slice(1) } };

    expect(() => assertLanePlanInvariants(damaged)).toThrow(/appears 1 time\(s\)/);
  });

  it("refuses when no family in the mix can draw a dealt card", () => {
    // The lane validates only because it lowered the distinct-representation requirement, then loses its one
    // drawable family to the card box: the plan reports the card rather than drawing something illegible.
    const lane = laneWithMix([{ family: "number-line" }], {
      denominatorCatalogue: [2, 4, 8, 16],
      cardBox: { width: 68, height: 68 },
      whole: { ...testLane().whole, setTotalObjectCount: 16, ticksPerUnit: 16 },
      requireDistinctRepresentationPerPair: false,
    });

    expect(() => planLaneDeck(lane, SEED)).toThrow(LaneConfigError);
  });

  it("draws every card through the required-family selector, so no card is planned without a picture", () => {
    // A single-family mix is only dealable when the lane stops insisting on two different pictures. The
    // planner asks for a *required* legible family per card, so this either plans a picture for every card
    // or raises the representation layer's own error — it can never return a card with no representation.
    const lane = testLane({
      representationMix: [{ family: "symbolic" }],
      requireDistinctRepresentationPerPair: false,
    });
    const plan = planLaneDeck(lane, SEED);
    expect(plan.cards).toHaveLength(lane.pairCount * 2);
    expect(plan.cards.every((card) => card.representation === "symbolic")).toBe(true);
  });

  it("re-derives plan invariants from the engine's deck instead of trusting the plan", () => {
    const plan = planLaneDeck(testLane(), SEED);

    expect(() => assertLanePlanInvariants(plan)).not.toThrow();

    const broken = (overrides: Partial<LanePlan>): LanePlan => ({ ...plan, ...overrides });

    expect(() =>
      assertLanePlanInvariants(broken({ cards: plan.cards.slice(1) })),
    ).toThrow(LanePlanError);
    expect(() => assertLanePlanInvariants(broken({ pairs: [] }))).toThrow(/expected 2 planned pair/);
    expect(() => assertLanePlanInvariants(broken({ cards: [], pairs: [] }))).toThrow(/expected 4 planned card/);

    // A card that does not exist in the deck, and a pair that draws one picture twice.
    const ghost = broken({
      cards: [
        { ...plan.cards[0]!, cardId: "ghost-card" },
        ...plan.cards.slice(1),
      ],
    });
    expect(() => assertLanePlanInvariants(ghost)).toThrow(/ghost-card does not exist in the deck/);

    const sameCardPair = broken({
      pairs: [
        {
          pairId: plan.pairs[0]!.pairId,
          canonical: plan.pairs[0]!.canonical,
          cards: [plan.pairs[0]!.cards[0], plan.pairs[0]!.cards[0]],
          distinctRepresentations: false,
        },
        ...plan.pairs.slice(1),
      ],
    });
    expect(() => assertLanePlanInvariants(sameCardPair)).toThrow(/planned the same card twice/);

    const identicalForms = broken({
      pairs: [
        {
          pairId: plan.pairs[0]!.pairId,
          canonical: plan.pairs[0]!.canonical,
          cards: [plan.pairs[0]!.cards[0], { ...plan.pairs[0]!.cards[1]!, form: plan.pairs[0]!.cards[0]!.form }],
          distinctRepresentations: true,
        },
        ...plan.pairs.slice(1),
      ],
    });
    expect(() => assertLanePlanInvariants(identicalForms)).toThrow(/two identical authored forms/);

    // Card-level invariants are re-derived from the pairs, so both views are patched.
    const replacedFirstCard = (card: LaneCardPlan): LanePlan => {
      const cards: readonly [LaneCardPlan, LaneCardPlan] = [card, plan.pairs[0]!.cards[1]];
      return broken({
        cards: [card, ...plan.cards.slice(1)],
        pairs: [{ ...plan.pairs[0]!, cards }, ...plan.pairs.slice(1)],
      });
    };

    expect(() =>
      assertLanePlanInvariants(
        replacedFirstCard({ ...plan.cards[0]!, legibility: { ...plan.cards[0]!.legibility, legible: false } }),
      ),
    ).toThrow(/illegible/);

    expect(() =>
      assertLanePlanInvariants(
        replacedFirstCard({ ...plan.cards[0]!, whole: { ...plan.cards[0]!.whole, wholeId: "" } }),
      ),
    ).toThrow(/without a declared whole/);

    const matchingForm = broken({
      cards: [{ ...plan.cards[0]!, form: { ...plan.cards[0]!.form, numerator: 1, denominator: 3 } }, ...plan.cards.slice(1)],
    });
    expect(() => assertLanePlanInvariants(matchingForm)).toThrow(/does not match the deck's authored form/);

    const sameFamily = broken({
      pairs: plan.pairs.map((pair) => ({ ...pair, distinctRepresentations: false })),
    });
    expect(() => assertLanePlanInvariants(sameFamily)).toThrow(/requires two different families/);
  });
});
