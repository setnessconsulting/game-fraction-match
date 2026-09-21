/**
 * Deterministic seeded randomness for the Fraction Match engine.
 *
 * The engine never reads ambient entropy. A seed is supplied as data (by the shell in production,
 * by tests explicitly), and the identical seed plus the identical configuration plus the identical
 * action sequence must reproduce identical state.
 *
 * The algorithm is `mulberry32`, the same small 32-bit generator used by the existing standalone
 * game baseline (`src/lib/games/shared/rng.ts` in `game-number-line-jumper`). It is intentionally
 * not cryptographic: it exists to make deck generation reproducible, never to protect anything.
 */

/** The generator's seed space: unsigned 32-bit. */
export const MAX_SEED = 4_294_967_295;

/** Thrown when a seed is outside the deterministic 32-bit seed space. */
export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

/**
 * Describe why a seed is unusable, or `null` when it is fine.
 *
 * The seed rule lives here exactly once: callers that need a diagnostic (the deck configuration
 * validator) and callers that need to throw ({@link assertSeed}) both use this function.
 */
export function seedProblem(seed: unknown): string | null {
  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) {
    return `seed must be a safe integer; received ${typeof seed === "number" ? String(seed) : typeof seed}`;
  }
  if (seed < 0 || seed > MAX_SEED) {
    return `seed must be within 0..${MAX_SEED}; received ${seed}`;
  }
  return null;
}

/** Validate a seed, returning it unchanged.
 *
 * @throws {SeedError} when the seed is not an integer inside the deterministic 32-bit seed space.
 */
export function assertSeed(seed: number): number {
  const problem = seedProblem(seed);
  if (problem !== null) throw new SeedError(problem);
  return seed;
}

/** A deterministic pseudo-random source returning values in `[0, 1)`. */
export type SeededRandom = () => number;

/** Create a deterministic generator for `seed`. */
export function createSeededRandom(seed: number): SeededRandom {
  let state = assertSeed(seed) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A uniform integer in `[0, exclusiveUpperBound)`.
 *
 * @throws {SeedError} when the bound is not a positive safe integer; unsupported draws fail
 * loudly instead of silently returning a wrong index.
 */
export function randomIntBelow(random: SeededRandom, exclusiveUpperBound: number): number {
  if (!Number.isSafeInteger(exclusiveUpperBound) || exclusiveUpperBound <= 0) {
    throw new SeedError(`exclusive upper bound must be a positive safe integer; received ${exclusiveUpperBound}`);
  }
  return Math.floor(random() * exclusiveUpperBound);
}

/** Deterministically pick one element from a non-empty list. */
export function pickFrom<T>(random: SeededRandom, list: readonly T[]): T {
  const index = randomIntBelow(random, list.length);
  return list[index]!;
}

/**
 * Fisher-Yates shuffle. Returns a new array; the input is never mutated, so a caller can reuse a
 * configuration across seeds safely.
 */
export function shuffled<T>(random: SeededRandom, list: readonly T[]): T[] {
  const output = [...list];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIntBelow(random, index + 1);
    const held = output[index]!;
    output[index] = output[swapIndex]!;
    output[swapIndex] = held;
  }
  return output;
}
