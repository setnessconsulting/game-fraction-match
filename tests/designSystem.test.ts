import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCssBlocks } from "../scripts/lib/guardRules.mjs";
import {
  applyAction,
  cardStateOf,
  createDeck,
  createGameState,
  type CardState,
} from "../src/engine";
import { DIVISION_LINE_TOKENS, REPRESENTATION_FAMILIES, contrastRatio } from "../src/representations";
import { FOUNDATION_FAMILIES } from "../src/app/foundationFixture";
import {
  CELEBRATION_MAX_DURATION_MS,
  CELEBRATION_SKIP_WITHIN_MS,
  CARD_STATES_WITHOUT_COLOUR,
  DESIGN_PALETTE,
  DESIGN_STATES,
  DESIGN_THEMES,
  INHERITED_QUALIFICATION_TOKENS,
  MAX_TRANSITION_DURATION_MS,
  MOTION_KINDS,
  MOTION_SPECS,
  REQUIRED_CONTRAST_PAIRS,
  VESTIBULAR_TRIGGERS,
  celebrationMustBeSkippable,
  celebrationPlan,
  colourIndependentCardChannels,
  colourIndependentStates,
  cssTokenName,
  designStateIds,
  designTokenNames,
  motionPlan,
  motionPlanFor,
} from "../src/design";
import type { MotionKind } from "../src/design";

/**
 * The design authority's own claims, checked.
 *
 * Three kinds of claim are tested here and they are deliberately different in character:
 *
 * 1. **Drift** — the tokens in TypeScript must equal the tokens the browser paints. A stylesheet and a token
 *    module that can silently disagree make every other guarantee in this story conditional on nobody
 *    editing CSS, so the equality is asserted rather than trusted.
 * 2. **Inheritance** — GAME-186's qualified palette and its card box are another story's measurement. This
 *    layer is allowed to build around them and not to move them, which is checked against the
 *    representation layer's own `DIVISION_LINE_TOKENS`.
 * 3. **Completeness** — the required state inventory must actually cover the story's bullets, and the five
 *    colour-independent states must genuinely be distinguishable without colour.
 */

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const globalsCssPath = resolve(repositoryRoot, "src/app/globals.css");

function tokenValue(source: string, selectorIncludes: string, token: string): string {
  for (const block of parseCssBlocks(source)) {
    if (!block.selector.includes(selectorIncludes)) continue;
    const declaration = block.declarations.find((candidate) => candidate.property === token);
    if (declaration !== undefined) return declaration.value;
  }
  throw new Error(`no declaration of ${token} found in a block matching "${selectorIncludes}"`);
}

describe("tokens and the stylesheet agree", () => {
  const source = readFileSync(globalsCssPath, "utf8");

  it("paints exactly the token values the design layer declares, in both themes", () => {
    for (const theme of DESIGN_THEMES) {
      const selector = theme === "light" ? ":root" : "prefers-color-scheme: dark";
      for (const [token, value] of Object.entries(DESIGN_PALETTE[theme])) {
        expect(tokenValue(source, selector, cssTokenName(token)), `${theme} ${token}`).toBe(value);
      }
    }
  });

  it("declares no token in TypeScript that the stylesheet does not paint", () => {
    const light = Object.keys(DESIGN_PALETTE.light);
    const dark = Object.keys(DESIGN_PALETTE.dark);
    expect([...dark].sort()).toEqual([...light].sort());
    expect([...designTokenNames()].sort()).toEqual([...light].sort());
    for (const token of light) expect(cssTokenName(token)).toMatch(/^--fm-[a-z-]+$/);

    // The declaration order is meaningful rather than incidental: the inherited GAME-186 pair is stated
    // first, so a reader of the token module sees what was inherited before what was added.
    expect(designTokenNames().slice(0, 2)).toEqual(["text", "surface"]);
  });

  it("inherits the GAME-186 qualification surface rather than redesigning it", () => {
    // The two values the 3:1 division-line floor was measured against, re-stated verbatim.
    for (const theme of DESIGN_THEMES) {
      expect(INHERITED_QUALIFICATION_TOKENS[theme].text).toBe(DESIGN_PALETTE[theme].text);
      expect(INHERITED_QUALIFICATION_TOKENS[theme].surface).toBe(DESIGN_PALETTE[theme].surface);
    }

    // And they are still the values the representation layer computes its floor from: a design pass that
    // moved either one would silently invalidate a measurement another story proved.
    expect(DESIGN_PALETTE.light.text).toBe(DIVISION_LINE_TOKENS.light.line);
    expect(DESIGN_PALETTE.light.surface).toBe(DIVISION_LINE_TOKENS.light.surface);
    expect(DESIGN_PALETTE.dark.text).toBe(DIVISION_LINE_TOKENS.dark.line);
    expect(DESIGN_PALETTE.dark.surface).toBe(DIVISION_LINE_TOKENS.dark.surface);
  });

  it("holds every declared contrast floor in every theme", () => {
    for (const theme of DESIGN_THEMES) {
      const palette = DESIGN_PALETTE[theme];
      for (const pair of REQUIRED_CONTRAST_PAIRS) {
        const foreground = palette[pair.foreground];
        const background = palette[pair.background];
        expect(foreground, `${theme} ${pair.id} foreground`).toBeDefined();
        expect(background, `${theme} ${pair.id} background`).toBeDefined();
        const ratio = contrastRatio(foreground!, background!);
        expect(ratio, `${theme} ${pair.id} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.minimum);
      }
    }
  });

  it("keeps the focus ring visible on every surface a focused control can sit on", () => {
    const focusPairs = REQUIRED_CONTRAST_PAIRS.filter((pair) => pair.foreground === "focusRing");
    expect(focusPairs.map((pair) => pair.background)).toEqual([
      "surface",
      "background",
      "surfaceSunken",
      "surfaceRaised",
    ]);
  });
});

describe("the required state inventory is complete", () => {
  it("covers every bullet the story lists, with unique ids", () => {
    const requirements = DESIGN_STATES.map((state) => state.requirement);
    for (const bullet of [
      "grade setup",
      "instruction state",
      "4-pair/8-card all-faces-visible warm-up",
      "8-pair/16-card production board",
      "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
      "every GAME-186 representation family",
      "equivalent-match and mismatch/recovery",
      "shared comparison strip",
      "calm render/error surface",
      "moves/pairs progress",
      "end-session confirmation where needed",
      "completion/session summary",
      "replay and change-grade/setup actions",
      "phone/tablet/desktop layouts",
      "keyboard/focus states",
      "forced-colors/high-contrast treatment",
      "reduced-motion variants",
      "bounded celebration",
    ]) {
      expect(requirements, `story bullet "${bullet}"`).toContain(bullet);
    }

    const ids = designStateIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(DESIGN_STATES.length);
  });

  it("names every representation family, and names exactly the families that exist", () => {
    const state = DESIGN_STATES.find((candidate) => candidate.id === "representation-families")!;
    const declared = state.selector.value.split(" | ");
    expect(declared).toEqual([...REPRESENTATION_FAMILIES]);
  });

  it("uses the engine's own card-state vocabulary rather than inventing a parallel one", () => {
    // Drive a real board until each engine card state has actually been observed, then require that the
    // design layer declares all three. This is a cross-check against behaviour, not against a type name.
    const deck = createDeck({ pairCount: 4, seed: 4242, families: FOUNDATION_FAMILIES });
    let state = createGameState(deck);

    const observed = new Set<CardState>();
    for (let index = 0; index < state.cards.length; index += 1) observed.add(cardStateOf(state, index));

    state = applyAction(state, { type: "select-card", cardIndex: 0 }).state;
    expect(cardStateOf(state, 0)).toBe("revealed");
    observed.add("revealed");

    for (let second = 1; second < state.cards.length; second += 1) {
      const attempt = applyAction(state, { type: "select-card", cardIndex: second }).state;
      const matched = attempt.cards.some((_, index) => cardStateOf(attempt, index) === "matched");
      if (matched) {
        observed.add("matched");
        break;
      }
    }

    expect([...observed].sort()).toEqual(["hidden", "matched", "revealed"]);

    const declared = DESIGN_STATES.filter((candidate) => candidate.selector.attribute === "data-card-state").map(
      (candidate) => candidate.selector.value,
    );
    expect(declared.sort()).toEqual(["hidden", "matched", "revealed"]);
  });

  it("proves the five colour-independent states do not share a channel", () => {
    expect([...CARD_STATES_WITHOUT_COLOUR]).toEqual(["hidden", "selected", "comparing", "matched", "explaining"]);
    expect(colourIndependentStates().map((state) => state.id)).toEqual([
      "card-hidden",
      "card-selected",
      "card-comparing",
      "card-matched",
      "card-explaining",
    ]);

    const channels = colourIndependentCardChannels();
    const seen = new Map<string, string>();
    for (const [state, values] of Object.entries(channels)) {
      expect(values.length, `${state} declares no non-colour channel`).toBeGreaterThan(0);
      const key = [...values].sort().join("|");
      const clash = seen.get(key);
      expect(clash, `${state} shares its whole channel set with ${clash ?? ""}`).toBeUndefined();
      seen.set(key, state);
    }

    // Each state must also own at least one channel no other state claims, which is the stronger reading of
    // "distinguishable": sharing the boundary weight is fine, sharing every affordance is not.
    const owners = new Map<string, string[]>();
    for (const [state, values] of Object.entries(channels)) {
      for (const value of values) owners.set(value, [...(owners.get(value) ?? []), state]);
    }
    for (const [state, values] of Object.entries(channels)) {
      const exclusive = values.filter((value) => (owners.get(value) ?? []).length === 1);
      expect(exclusive.length, `${state} has no exclusive affordance`).toBeGreaterThan(0);
    }
  });
});

describe("the motion contract is bounded and parity-preserving", () => {
  it("keeps every transition inside its ceiling and the celebration inside both of its bounds", () => {
    for (const spec of MOTION_SPECS) {
      if (spec.kind === "celebration") {
        expect(spec.durationMs).toBeLessThanOrEqual(CELEBRATION_MAX_DURATION_MS);
        expect(spec.durationMs).toBeGreaterThan(CELEBRATION_SKIP_WITHIN_MS);
        expect(spec.skippable).toBe(true);
      } else {
        expect(spec.durationMs, spec.kind).toBeLessThanOrEqual(MAX_TRANSITION_DURATION_MS);
        expect(spec.skippable, spec.kind).toBe(false);
      }
      expect(spec.nonMotionFallback.length, `${spec.kind} declares no fallback`).toBeGreaterThan(0);
      for (const trigger of spec.movement) expect(VESTIBULAR_TRIGGERS).toContain(trigger);
    }

    expect(celebrationMustBeSkippable()).toBe(true);
    expect(MOTION_SPECS.map((spec) => spec.kind)).toEqual([...MOTION_KINDS]);
  });

  it("collapses duration and movement under reduced motion while keeping the outcome identical", () => {
    for (const kind of MOTION_KINDS) {
      const full = motionPlanFor(kind, "full");
      const reduced = motionPlanFor(kind, "reduced");

      expect(reduced.durationMs, kind).toBe(0);
      expect(reduced.movement, kind).toEqual([]);
      expect(reduced.outcome, `${kind} outcome must not change with the motion preference`).toBe(full.outcome);
      expect(full.movement.length, `${kind} performs no movement at all`).toBeGreaterThan(0);
    }
  });

  it("never lets a reduced-motion plan carry a vestibular trigger", () => {
    const reduced = motionPlan("reduced");
    expect(reduced).toHaveLength(MOTION_KINDS.length);
    for (const plan of reduced) {
      expect(plan.movement, plan.kind).toEqual([]);
      for (const trigger of VESTIBULAR_TRIGGERS) expect(plan.movement).not.toContain(trigger);
    }
  });

  it("bounds the celebration under both preferences and keeps its outcome stable", () => {
    const full = celebrationPlan("full");
    const reduced = celebrationPlan("reduced");

    expect(full.kind).toBe("celebration");
    expect(full.durationMs).toBeLessThanOrEqual(CELEBRATION_MAX_DURATION_MS);
    expect(full.durationMs).toBeGreaterThan(CELEBRATION_SKIP_WITHIN_MS);
    expect(full.skippable).toBe(true);
    expect(reduced.durationMs).toBe(0);
    expect(reduced.outcome).toBe(full.outcome);

    // The completion state is on screen before the celebration starts, so the celebration is additive.
    expect(full.outcome.length).toBeGreaterThan(0);
  });

  it("refuses a motion kind that has no spec rather than inventing a default", () => {
    // `MOTION_KINDS` and `MOTION_SPECS` are two declarations of the same vocabulary, so this look-up is a real
    // invariant between them: a kind added to one without the other must fail loudly rather than silently
    // render no motion at all.
    expect(() => motionPlanFor("not-a-motion" as MotionKind, "full")).toThrow(/no motion spec is declared/);
  });
});
