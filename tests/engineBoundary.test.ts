import { describe, expect, it } from "vitest";

import * as boundary from "../src/engine";

/**
 * The public boundary is a contract, not an implementation detail: GAME-186/187/189 build on it,
 * and presentation code is forbidden from reaching past it. These assertions lock the surface and,
 * more importantly, prove that entropy and shuffle internals stay private.
 */
const REQUIRED_EXPORTS = [
  "PRODUCTION_PAIR_COUNT",
  "RATIONAL_ZERO",
  "WARM_UP_PAIR_COUNT",
  "applyAction",
  "assertDeckEquivalenceInvariants",
  "cardStateOf",
  "createDeck",
  "createFractionForm",
  "createFractionFormFromInput",
  "createGameState",
  "distinctRationals",
  "fractionFormsShareValue",
  "isCardSelectable",
  "isGameComplete",
  "rational",
  "rationalEquals",
  "rationalSigned",
  "remainingPairCount",
  "validateDeckConfig",
];

const INTERNAL_ONLY = [
  "MAX_SEED",
  "SeedError",
  "assertSeed",
  "createSeededRandom",
  "pickFrom",
  "randomIntBelow",
  "seedProblem",
  "shuffled",
];

describe("public engine boundary", () => {
  it("exposes everything downstream stories need", () => {
    const exported = Object.keys(boundary);
    for (const name of REQUIRED_EXPORTS) {
      expect(exported, `${name} must be exported`).toContain(name);
    }
  });

  it("keeps entropy and shuffle mechanics private to the engine", () => {
    const exported = Object.keys(boundary);
    for (const name of INTERNAL_ONLY) {
      expect(exported, `${name} must not be part of the public boundary`).not.toContain(name);
    }
  });

  it("exposes no presentation or framework surface", () => {
    const exported = Object.keys(boundary);
    expect(exported.length).toBeGreaterThan(20);
    for (const name of exported) {
      expect(name).not.toMatch(/react|jsx|dom|style|svg/i);
    }
  });

  it("returns canonical values from the public constructors", () => {
    expect(boundary.rational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(boundary.createFractionForm(2, 4).canonical).toEqual({ numerator: 1, denominator: 2 });
    expect(boundary.rationalEquals(boundary.rational(1, 2), boundary.rational(3, 6))).toBe(true);
  });
});
