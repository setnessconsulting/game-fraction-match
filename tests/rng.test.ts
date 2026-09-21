import { describe, expect, it } from "vitest";

import {
  MAX_SEED,
  SeedError,
  assertSeed,
  createSeededRandom,
  pickFrom,
  randomIntBelow,
  seedProblem,
  shuffled,
} from "../src/engine/rng";

const take = (seed: number, count: number): number[] => {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
};

describe("seeded generator determinism", () => {
  it("reproduces one exact sequence for one seed", () => {
    // Regression lock: changing the algorithm behind the same seed would silently invalidate every
    // recorded board, so the reference vector is pinned here.
    expect(take(20_260_921, 5)).toEqual([
      0.04922196106053889, 0.20362027059309185, 0.6588539234362543, 0.03481203131377697, 0.4282660153694451,
    ]);
    expect(take(0, 3)).toEqual([0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
    expect(take(MAX_SEED, 3)).toEqual([0.8964226141106337, 0.189478256739676, 0.7156526781618595]);
  });

  it("is independent per generator instance", () => {
    const first = createSeededRandom(1234);
    const second = createSeededRandom(1234);
    const firstRun = [first(), first(), first()];
    const secondRun = [second(), second(), second()];
    expect(firstRun).toEqual(secondRun);
  });

  it("produces different sequences for different seeds", () => {
    const sequences = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => take(seed, 4).join(",")));
    expect(sequences.size).toBe(8);
  });

  it("stays inside [0, 1)", () => {
    for (const seed of [0, 1, 7, MAX_SEED]) {
      for (const value of take(seed, 200)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});

describe("seed validation", () => {
  it("accepts the whole 32-bit seed space", () => {
    expect(assertSeed(0)).toBe(0);
    expect(assertSeed(MAX_SEED)).toBe(MAX_SEED);
    expect(seedProblem(0)).toBeNull();
    expect(seedProblem(MAX_SEED)).toBeNull();
    expect(() => createSeededRandom(MAX_SEED)).not.toThrow();
  });

  it("fails loudly outside it", () => {
    expect(() => assertSeed(-1)).toThrow(SeedError);
    expect(() => assertSeed(MAX_SEED + 1)).toThrow(/0\.\.4294967295/);
    expect(() => assertSeed(1.5)).toThrow(/safe integer/);
    expect(() => assertSeed(Number.NaN)).toThrow(/safe integer/);
    expect(() => createSeededRandom(-1)).toThrow(SeedError);
  });

  it("reports seed problems without throwing", () => {
    expect(seedProblem(-1)).toMatch(/0\.\.4294967295/);
    expect(seedProblem(MAX_SEED + 1)).toMatch(/0\.\.4294967295/);
    expect(seedProblem(2.5)).toMatch(/safe integer/);
    expect(seedProblem("1")).toMatch(/safe integer/);
    expect(seedProblem(undefined)).toMatch(/safe integer/);
    expect(seedProblem(null)).toMatch(/safe integer/);
  });
});

describe("deterministic helpers", () => {
  it("draws integers inside the requested bound", () => {
    const random = createSeededRandom(99);
    const draws = Array.from({ length: 500 }, () => randomIntBelow(random, 7));
    expect(new Set(draws).size).toBe(7);
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(7);

    // Same seed, same bound, same draw sequence.
    const repeated = createSeededRandom(99);
    expect(Array.from({ length: 500 }, () => randomIntBelow(repeated, 7))).toEqual(draws);
  });

  it("rejects impossible bounds", () => {
    const random = createSeededRandom(1);
    expect(() => randomIntBelow(random, 0)).toThrow(SeedError);
    expect(() => randomIntBelow(random, -3)).toThrow(/positive safe integer/);
    expect(() => randomIntBelow(random, 2.5)).toThrow(/positive safe integer/);
    expect(randomIntBelow(random, 1)).toBe(0);
  });

  it("picks a deterministic element from a list", () => {
    const random = createSeededRandom(4242);
    const list = ["a", "b", "c", "d"] as const;
    const picks = Array.from({ length: 40 }, () => pickFrom(random, list));
    expect(picks.every((pick) => list.includes(pick))).toBe(true);
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(pickFrom(random, ["only"])).toBe("only");
  });

  it("shuffles without mutating the input and covers the whole permutation deterministically", () => {
    const random = createSeededRandom(7);
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const snapshot = [...input];

    const first = shuffled(random, input);
    expect(input).toEqual(snapshot);
    expect([...first].sort((left, right) => left - right)).toEqual(snapshot);
    expect(first).not.toEqual(snapshot);

    const repeated = shuffled(createSeededRandom(7), input);
    expect(repeated).toEqual(first);

    expect(shuffled(random, [])).toEqual([]);
    expect(shuffled(random, ["solo"])).toEqual(["solo"]);
  });
});
