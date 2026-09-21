import { describe, expect, it } from "vitest";

import { PRODUCTION_PAIR_COUNT, WARM_UP_PAIR_COUNT } from "../src/engine";
import {
  REPRESENTATION_FAMILIES,
  type RepresentationFamily,
} from "../src/representations";
import {
  assertLanePlanInvariants,
  isSatisfiableLane,
  laneCoverageReport,
  laneIndexAfter,
  laneIndexBefore,
  laneProgress,
  laneSequenceProblems,
  laneWholeProblems,
  laneWholes,
  validateLaneConfig,
} from "../src/lanes";
import {
  FIXTURE_LANES,
  FIXTURE_LANE_PLANS,
  FIXTURE_LANE_SEQUENCE,
  LANE_FIXTURE_CARD_BOX,
  LANE_FIXTURE_SEED,
} from "../src/app/laneFixtures";

/**
 * The fixtures are what the gallery and the browser tests actually render, so they are asserted here as
 * *content*: valid lanes, boards of the declared shape, and — the interesting part — the trade-offs their
 * catalogues force. Those trade-offs are pinned as assertions so a later catalogue edit has to face them
 * rather than quietly change what the gallery demonstrates.
 */

/** Canonical values as comparable keys. `canonical` is an object, so identity comparison would not dedupe. */
function valueKey(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

describe("lane fixtures", () => {
  it("are valid lanes with coherent wholes and the declared board shapes", () => {
    for (const lane of FIXTURE_LANES) {
      expect(validateLaneConfig(lane), lane.laneId).toEqual([]);
      expect(isSatisfiableLane(lane)).toBe(true);
      expect(laneWholeProblems(lane)).toEqual([]);
      expect(lane.cardBox).toEqual(LANE_FIXTURE_CARD_BOX);

      // Every catalogue denominator must divide both declared wholes, or a card could not be drawn honestly.
      for (const denominator of lane.denominatorCatalogue) {
        expect(lane.whole.setTotalObjectCount % denominator, `${lane.laneId} collection / ${denominator}`).toBe(0);
        expect(lane.whole.ticksPerUnit % denominator, `${lane.laneId} axis / ${denominator}`).toBe(0);
      }
    }

    expect(FIXTURE_LANES.map((lane) => lane.pairCount)).toEqual([
      WARM_UP_PAIR_COUNT,
      3,
      PRODUCTION_PAIR_COUNT,
    ]);
    expect(new Set(FIXTURE_LANES.map((lane) => lane.laneId)).size).toBe(FIXTURE_LANES.length);
    expect(Number.isSafeInteger(LANE_FIXTURE_SEED)).toBe(true);
  });

  it("are the only thing that decides a family, a whole and a card box", () => {
    // The lanes are frozen content: a lane the gallery renders must not change under it.
    for (const lane of FIXTURE_LANES) {
      expect(Object.isFrozen(lane)).toBe(true);
      expect(Object.isFrozen(lane.representationMix)).toBe(true);
      expect(lane.laneId).toMatch(/^fixture-/);
      expect(lane.title).toMatch(/\(fixture\)/);
    }
    expect(Object.isFrozen(FIXTURE_LANE_SEQUENCE.lanes)).toBe(true);
    expect(Object.isFrozen(FIXTURE_LANE_PLANS)).toBe(true);
  });

  it("run as an ordered grade-3 sequence", () => {
    expect(laneSequenceProblems(FIXTURE_LANE_SEQUENCE)).toEqual([]);
    expect(FIXTURE_LANE_SEQUENCE.lanes.map((lane) => lane.laneId)).toEqual([
      "fixture-warm-up",
      "fixture-eighths",
    ]);
    expect(FIXTURE_LANE_SEQUENCE.lanes.every((lane) => lane.gradeBand === FIXTURE_LANE_SEQUENCE.gradeBand)).toBe(true);

    expect(laneProgress(FIXTURE_LANE_SEQUENCE, 0)).toEqual({ index: 0, total: 2, isFirst: true, isLast: false });
    expect(laneProgress(FIXTURE_LANE_SEQUENCE, 1)).toEqual({ index: 1, total: 2, isFirst: false, isLast: true });
    // Ordering clamps rather than wrapping, so a board can never skip a lane or loop.
    expect(laneIndexAfter(FIXTURE_LANE_SEQUENCE, 0)).toBe(1);
    expect(laneIndexAfter(FIXTURE_LANE_SEQUENCE, 1)).toBe(1);
    expect(laneIndexBefore(FIXTURE_LANE_SEQUENCE, 1)).toBe(0);
    expect(laneIndexBefore(FIXTURE_LANE_SEQUENCE, 0)).toBe(0);
  });

  it("deal one honest plan per lane at the fixture seed", () => {
    expect(FIXTURE_LANE_PLANS).toHaveLength(FIXTURE_LANES.length);

    FIXTURE_LANE_PLANS.forEach((plan, index) => {
      const lane = FIXTURE_LANES[index]!;
      const wholes = laneWholes(lane);

      expect(plan.lane).toBe(lane);
      expect(plan.seed).toBe(LANE_FIXTURE_SEED);
      expect(plan.cards).toHaveLength(lane.pairCount * 2);
      expect(plan.pairs).toHaveLength(lane.pairCount);
      expect(plan.diagnostics.poolSize).toBeGreaterThanOrEqual(lane.pairCount);
      expect(() => assertLanePlanInvariants(plan)).not.toThrow();

      for (const card of plan.cards) {
        expect(card.legibility.legible).toBe(true);
        // The whole is the lane's declaration, never the card's own choice.
        expect(card.whole).toStrictEqual(wholes.resolver(card.representation));
        expect(card.whole.wholeId).not.toBe("");
        expect(card.rejections.every((rejection) => rejection.family !== card.representation)).toBe(true);
      }

      // One declared whole per lane: no card may quietly carry a different collection or axis.
      for (const card of plan.cards) {
        if (card.representation === "set") {
          if (card.whole.kind !== "discrete-set") throw new Error("a set card must declare a discrete whole");
          expect(card.whole.totalObjectCount).toBe(lane.whole.setTotalObjectCount);
          continue;
        }
        if (card.representation === "number-line") {
          if (card.whole.kind !== "number-line-axis") throw new Error("a number-line card must declare an axis");
          expect(card.whole.axis.axisId).toBe(lane.whole.axisId);
          expect(card.whole.axis.ticksPerUnit).toBe(lane.whole.ticksPerUnit);
          continue;
        }
        expect(card.whole.kind).toBe("continuous-whole");
        expect(card.whole.wholeId).toBe(lane.whole.continuousWholeId);
      }

      // Every card is a card the engine actually dealt, in the engine's own spelling.
      expect(new Set(plan.cards.map((card) => card.cardId))).toEqual(new Set(plan.deck.cards.map((card) => card.cardId)));
    });
  });

  it("spend the wide catalogue on representations rather than on an axis", () => {
    // The warm-up lane's collection of 48 is what makes twelfths and sixteenths drawable, and it is exactly
    // what makes an axis fine enough for them unreadable on a 96 px card. So the lane drops the number line.
    const warmUp = FIXTURE_LANES[0]!;
    expect(warmUp.denominatorCatalogue).toContain(12);
    expect(warmUp.denominatorCatalogue).toContain(16);
    expect(warmUp.representationMix.map((candidate) => candidate.family)).not.toContain("number-line");

    const coverage = laneCoverageReport(warmUp);
    expect(coverage.problems).toEqual([]);
    expect(coverage.familyFormCounts["number-line"]).toBe(0);
    expect(coverage.familyFormCounts.symbolic).toBeGreaterThan(0);
    expect(coverage.familyFormCounts.bar).toBeGreaterThan(0);

    // The axis really is too fine, so this is a forced choice and not a preference.
    const ticksPerUnit = warmUp.whole.ticksPerUnit;
    expect(LANE_FIXTURE_CARD_BOX.width / ticksPerUnit).toBeLessThan(6);
  });

  it("offer the number line exactly where the axis is coarse enough", () => {
    const eighths = FIXTURE_LANES[1]!;
    expect(eighths.representationMix[0]!.family).toBe("number-line");
    expect(eighths.whole.ticksPerUnit).toBe(8);

    const coverage = laneCoverageReport(eighths);
    expect(coverage.problems).toEqual([]);
    // Every form this lane can deal is drawable on the axis, which is what the coarse scale buys.
    expect(coverage.familyFormCounts["number-line"]).toBe(coverage.forms.length);

    const plan = FIXTURE_LANE_PLANS[1]!;
    expect(plan.cards.map((card) => card.representation)).toContain("number-line");
    expect(plan.pairs.every((pair) => pair.distinctRepresentations)).toBe(true);
  });

  it("deal two genuinely different pictures of one value per pair", () => {
    for (const plan of FIXTURE_LANE_PLANS) {
      for (const pair of plan.pairs) {
        const [first, second] = pair.cards;
        expect(valueKey(first.form.numerator, first.form.denominator)).not.toBe(
          valueKey(second.form.numerator, second.form.denominator),
        );
        expect(valueKey(first.form.canonical.numerator, first.form.canonical.denominator)).toBe(
          valueKey(second.form.canonical.numerator, second.form.canonical.denominator),
        );
        expect(first.representation).not.toBe(second.representation);
        expect(pair.distinctRepresentations).toBe(true);
      }
    }
  });

  it("report measured near-miss links rather than a promise about them", () => {
    for (const plan of FIXTURE_LANE_PLANS) {
      const dealt = new Set(
        plan.cards.map((card) => valueKey(card.form.canonical.numerator, card.form.canonical.denominator)),
      );
      expect(plan.diagnostics.poolSize).toBeGreaterThanOrEqual(dealt.size);

      // A dealt link is a subset of the pool's links by construction; this re-derives the subset relation.
      const dealtLinkKeys = new Set(
        plan.diagnostics.dealtNearMissLinks.map((link) => `${link.leftFamilyId}|${link.rightFamilyId}|${link.kind}`),
      );
      const poolLinkKeys = new Set(
        plan.diagnostics.poolNearMissLinks.map((link) => `${link.leftFamilyId}|${link.rightFamilyId}|${link.kind}`),
      );
      expect(dealtLinkKeys.size).toBe(plan.diagnostics.dealtNearMissLinks.length);
      for (const key of dealtLinkKeys) {
        expect(poolLinkKeys.has(key), key).toBe(true);
      }

      // Every link carries the shared signal that justifies it, so a reviewer can see why it exists.
      for (const link of plan.diagnostics.poolNearMissLinks) {
        expect(link.sharedSignals.length).toBeGreaterThan(0);
        expect(link.leftFamilyId).not.toBe(link.rightFamilyId);
      }
    }
  });

  it("count exactly the families the plan drew", () => {
    for (const plan of FIXTURE_LANE_PLANS) {
      const counts = plan.diagnostics.representationCounts;
      expect(Object.keys(counts).sort()).toEqual([...REPRESENTATION_FAMILIES].sort());

      const total = REPRESENTATION_FAMILIES.reduce(
        (sum: number, family: RepresentationFamily) => sum + counts[family],
        0,
      );
      expect(total).toBe(plan.cards.length);

      const drawn = new Set(plan.cards.map((card) => card.representation));
      for (const family of REPRESENTATION_FAMILIES) {
        expect(counts[family] > 0, `${plan.lane.laneId} ${family}`).toBe(drawn.has(family));
      }
      for (const family of drawn) {
        expect(counts[family]).toBe(plan.cards.filter((card) => card.representation === family).length);
      }
    }
  });

  it("keep the number line out of lanes whose values it cannot even place", () => {
    // The warm-up lane's axis scale is the one thing it cannot fix by adding a family: 1/12 lands on a real
    // tick, and the lane says so explicitly rather than relying on the mix to hide the failure.
    const warmUp = FIXTURE_LANES[0]!;
    expect(warmUp.whole.ticksPerUnit % 12).toBe(0);

    const declared = FIXTURE_LANES.filter((lane) =>
      lane.representationMix.some((candidate) => candidate.family === "number-line"),
    );
    for (const lane of declared) {
      for (const denominator of lane.denominatorCatalogue) {
        expect(lane.whole.ticksPerUnit % denominator, `${lane.laneId} / ${denominator}`).toBe(0);
      }
    }
  });
});
