import { describe, expect, it } from "vitest";

import {
  PRODUCTION_PAIR_COUNT,
  createDeck,
  createFractionFormFromInput,
  rationalEquals,
  type Rational,
} from "../src/engine";
import { HISTORICAL_EIGHT_PAIR_FAMILIES } from "./fixtures";

/**
 * Historical parity regression.
 *
 * The legacy LevelBest component decided a match by comparing a `pairId` shared by two hardcoded
 * label strings. This suite proves the modern engine reaches exactly the same mathematical grouping
 * using canonical rational equality alone — no identifiers, no label text — so the historical board
 * cannot silently regress and no correctness was lost during the reimplementation.
 *
 * See docs/provenance/LEGACY_BASELINE.md for the inspected provenance.
 */

const historicalPairs = HISTORICAL_EIGHT_PAIR_FAMILIES.map((family) =>
  family.forms.map((form) => createFractionFormFromInput(form)),
);

describe("historical eight-pair board", () => {
  it("still contains eight pairs of two forms each", () => {
    expect(HISTORICAL_EIGHT_PAIR_FAMILIES).toHaveLength(PRODUCTION_PAIR_COUNT);
    for (const pair of historicalPairs) {
      expect(pair).toHaveLength(2);
    }
  });

  it("groups each pair the way the historical pairId grouping did", () => {
    for (const pair of historicalPairs) {
      const [left, right] = pair;
      expect(
        rationalEquals(left!.canonical, right!.canonical),
        `${left!.numerator}/${left!.denominator} and ${right!.numerator}/${right!.denominator}`,
      ).toBe(true);
      // The authored notation is different, which is the whole point of the game.
      expect(`${left!.numerator}/${left!.denominator}`).not.toBe(`${right!.numerator}/${right!.denominator}`);
    }
  });

  it("keeps every historical pair mutually non-equivalent", () => {
    const canonicals: Rational[] = historicalPairs.map((pair) => pair[0]!.canonical);
    for (let left = 0; left < canonicals.length; left += 1) {
      for (let right = left + 1; right < canonicals.length; right += 1) {
        expect(rationalEquals(canonicals[left]!, canonicals[right]!)).toBe(false);
      }
    }
  });

  it("deals the historical board correctly under the generic generator", () => {
    const deck = createDeck({
      pairCount: PRODUCTION_PAIR_COUNT,
      families: HISTORICAL_EIGHT_PAIR_FAMILIES,
      seed: 49_659,
    });

    expect(deck.cardCount).toBe(16);
    const canonicals = deck.cards.map((card) => card.form.canonical);
    for (const value of historicalPairs.map((pair) => pair[0]!.canonical)) {
      expect(canonicals.filter((candidate) => rationalEquals(candidate, value))).toHaveLength(2);
    }
  });
});
