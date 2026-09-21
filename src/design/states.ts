/**
 * The required state inventory (GAME-188).
 *
 * GAME-188 is a design story, and the failure mode of a design story is a prose list in a document that
 * nobody can check. This module turns the story's "required design states" into data, so the claim
 * "every required state is designed" becomes a test rather than an assertion.
 *
 * NAMES ARE THE INTERFACE
 * Every state carries the exact `data-*` attribute name and value that implements it, and where the state
 * is derived from the engine, the value is the engine's own vocabulary (`CardState` is
 * `"hidden" | "revealed" | "matched"`, `ComparisonOutcome` is `"match" | "mismatch"`). A design name that
 * does not map to a real code name is a design name that will be invented twice, differently, in two
 * codebases — so `tests/designStates.test.ts` asserts the mapping against the engine's own types.
 *
 * DISTINGUISHABLE WITHOUT COLOUR
 * The story requires hidden / selected / comparing / matched / explaining to be distinguishable without
 * colour. Colour is therefore never the only channel: each of those states declares a `nonColorChannels`
 * entry, and the test proves the five sets are mutually distinct. Colour may *reinforce* a state; it may
 * never be the thing that carries it.
 */

/** A state's implementation hook: the attribute the browser can be held to. */
export type StateSelector = {
  readonly attribute: string;
  readonly value: string;
};

/** One designed state. */
export type DesignState = {
  readonly id: string;
  readonly label: string;
  /** The story bullet this state satisfies, quoted so the inventory can be audited against it. */
  readonly requirement: string;
  readonly selector: StateSelector;
  /** Everything this state declares as its non-colour affordance. Empty means "colour is not load-bearing". */
  readonly nonColorChannels: readonly string[];
  /** True when the value is the engine's own vocabulary rather than a design invention. */
  readonly derivedFromEngine: boolean;
  readonly notes: string;
};

/**
 * The five card states the story requires to be readable without colour.
 *
 * `hidden` and `matched` are engine `CardState` values. `selected`, `comparing` and `explaining` are
 * projection states: the engine exposes them through `revealedCardIndexes`, `pendingComparison` and the
 * last `ComparisonResolution`, and the shell renders them without inventing new game meaning.
 */
export const CARD_STATES_WITHOUT_COLOUR = Object.freeze([
  "hidden",
  "selected",
  "comparing",
  "matched",
  "explaining",
] as const);
export type CardStateWithoutColour = (typeof CARD_STATES_WITHOUT_COLOUR)[number];

/**
 * The five colour-independent card states, declared as named constants.
 *
 * They are named rather than inlined because `colourIndependentCardChannels()` has to return their channels by
 * the story's own state names. Deriving them by looking the states up in the inventory would have required a
 * "not found" branch that no caller can ever reach, and unreachable error handling is a claim that something
 * can go wrong when it cannot. Naming them makes the mapping total by construction.
 */
const CARD_HIDDEN_STATE: DesignState = Object.freeze({
  id: "card-hidden",
  label: "Card: hidden",
  requirement: "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
  selector: Object.freeze({ attribute: "data-card-state", value: "hidden" }),
  nonColorChannels: Object.freeze(["no value shown at all", "dashed boundary", "back-of-card marker glyph"]),
  derivedFromEngine: true,
  notes: "Nothing about an unrevealed card reaches the DOM, so its own value cannot leak through styling either.",
});

const CARD_SELECTED_STATE: DesignState = Object.freeze({
  id: "card-selected",
  label: "Card: selected",
  requirement: "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
  selector: Object.freeze({ attribute: "data-card-state", value: "revealed" }),
  nonColorChannels: Object.freeze(["solid emphasized boundary", "corner selection marker", "raised elevation"]),
  derivedFromEngine: true,
  notes:
    "The engine's `revealed` is the design's `selected`: the first card of a pending comparison. The design name is the interaction reading of the engine fact.",
});

const CARD_COMPARING_STATE: DesignState = Object.freeze({
  id: "card-comparing",
  label: "Card: comparing",
  requirement: "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
  selector: Object.freeze({ attribute: "data-comparison", value: "pending" }),
  nonColorChannels: Object.freeze(["both cards joined by a comparison bracket", "no third card may appear"]),
  derivedFromEngine: true,
  notes: "A pending comparison is a property of the pair, not of one card, so it is declared on the board.",
});

const CARD_MATCHED_STATE: DesignState = Object.freeze({
  id: "card-matched",
  label: "Card: matched",
  requirement: "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
  selector: Object.freeze({ attribute: "data-card-state", value: "matched" }),
  nonColorChannels: Object.freeze(["thickest boundary", "closed pair seam", "matched marker glyph"]),
  derivedFromEngine: true,
  notes: "Matched cards stay readable: they are the worked example the learner looks back at.",
});

const CARD_EXPLAINING_STATE: DesignState = Object.freeze({
  id: "card-explaining",
  label: "Card: explaining",
  requirement: "hidden, hover/focus, pressed, selected, comparing, matched and explaining states",
  selector: Object.freeze({ attribute: "data-feedback", value: "explaining" }),
  nonColorChannels: Object.freeze(["inline explanation slot reserved below the pair", "explanation text itself"]),
  derivedFromEngine: false,
  notes:
    "The slot is designed here so that GAME-190's explanatory copy has somewhere to land that does not obscure a card.",
});

/** The full required state inventory: one entry per story bullet, in the story's own order. */
export const DESIGN_STATES: readonly DesignState[] = Object.freeze([
  Object.freeze({
    id: "grade-setup",
    label: "Grade setup",
    requirement: "grade setup",
    selector: Object.freeze({ attribute: "data-screen", value: "grade-setup" }),
    nonColorChannels: Object.freeze(["one card per grade band, each with its catalogue printed as text"]),
    derivedFromEngine: false,
    notes:
      "The band is an ordering label, not a standards claim, so the surface shows the catalogue rather than a promise about learning.",
  }),
  Object.freeze({
    id: "instruction",
    label: "Instruction",
    requirement: "instruction state",
    selector: Object.freeze({ attribute: "data-screen", value: "instruction" }),
    nonColorChannels: Object.freeze(["single-sentence instruction", "one primary action"]),
    derivedFromEngine: false,
    notes: "Instruction is one bounded sentence; it never grows into a rulebook.",
  }),
  Object.freeze({
    id: "warm-up",
    label: "Warm-up board (4 pairs / 8 cards, all faces visible)",
    requirement: "4-pair/8-card all-faces-visible warm-up",
    selector: Object.freeze({ attribute: "data-screen", value: "warm-up" }),
    nonColorChannels: Object.freeze(["every face visible at once", "pairing shown structurally"]),
    derivedFromEngine: true,
    notes:
      "Warm-up is excluded from session bounds, so it must look categorically different from a scored production board rather than merely shorter.",
  }),
  Object.freeze({
    id: "production-board",
    label: "Production board (8 pairs / 16 cards)",
    requirement: "8-pair/16-card production board",
    selector: Object.freeze({ attribute: "data-screen", value: "production-board" }),
    nonColorChannels: Object.freeze(["16 cards fitted simultaneously", "no internal board scrolling"]),
    derivedFromEngine: true,
    notes: "The fit contract for this screen is proven in `responsive.ts`, not asserted in prose.",
  }),
  CARD_HIDDEN_STATE,
  CARD_SELECTED_STATE,
  CARD_COMPARING_STATE,
  CARD_MATCHED_STATE,
  CARD_EXPLAINING_STATE,
  Object.freeze({
    id: "representation-families",
    label: "Every GAME-186 representation family",
    requirement: "every GAME-186 representation family",
    selector: Object.freeze({ attribute: "data-family", value: "symbolic | bar | circle | set | number-line" }),
    nonColorChannels: Object.freeze(["ink only: filled solids and empty outlines", "no hue carries quantity"]),
    derivedFromEngine: true,
    notes:
      "The family list is asserted against `REPRESENTATION_FAMILIES` in the test, so a new family cannot ship undesigned.",
  }),
  Object.freeze({
    id: "feedback-match",
    label: "Equivalent match",
    requirement: "equivalent-match and mismatch/recovery",
    selector: Object.freeze({ attribute: "data-feedback", value: "match" }),
    nonColorChannels: Object.freeze(["matched marker glyph", "shared-value statement in text"]),
    derivedFromEngine: true,
    notes: "The matched state appears immediately; it never waits on an animation to become true.",
  }),
  Object.freeze({
    id: "feedback-mismatch",
    label: "Mismatch and recovery",
    requirement: "equivalent-match and mismatch/recovery",
    selector: Object.freeze({ attribute: "data-feedback", value: "mismatch" }),
    nonColorChannels: Object.freeze(["bracket between the two inspected cards", "explanatory text", "no red-X glyph"]),
    derivedFromEngine: true,
    notes:
      "Recovery is inspectable, never punitive: the two cards stay visible so the relationship can be read, and nothing is lost by looking.",
  }),
  Object.freeze({
    id: "comparison-strip",
    label: "Shared comparison strip",
    requirement: "shared comparison strip",
    selector: Object.freeze({ attribute: "data-component", value: "comparison-strip" }),
    nonColorChannels: Object.freeze(["one shared whole drawn once", "both sides aligned to the same axis"]),
    derivedFromEngine: true,
    notes:
      "One declared whole, drawn once: the strip is where 'same amount' becomes visible rather than asserted.",
  }),
  Object.freeze({
    id: "calm-recovery",
    label: "Calm render/error surface",
    requirement: "calm render/error surface",
    selector: Object.freeze({ attribute: "data-screen", value: "calm-recovery" }),
    nonColorChannels: Object.freeze(["plain-language sentence", "single recovery action", "no stack trace"]),
    derivedFromEngine: false,
    notes: "A render failure reaches a usable surface. It never shows an exception to a child.",
  }),
  Object.freeze({
    id: "progress",
    label: "Moves / pairs progress",
    requirement: "moves/pairs progress",
    selector: Object.freeze({ attribute: "data-component", value: "progress" }),
    nonColorChannels: Object.freeze(["plain counts as text", "no score, no streak, no timer pressure"]),
    derivedFromEngine: true,
    notes: "Facts only. There is no score, no level and no mastery claim anywhere in the design.",
  }),
  Object.freeze({
    id: "end-session-confirm",
    label: "End-session confirmation",
    requirement: "end-session confirmation where needed",
    selector: Object.freeze({ attribute: "data-screen", value: "end-session-confirm" }),
    nonColorChannels: Object.freeze(["two equally weighted actions", "the confirm action is not pre-selected"]),
    derivedFromEngine: false,
    notes: "Ending is never a trap and never a dare: both actions are one tap and neither is styled as the 'right' answer.",
  }),
  Object.freeze({
    id: "session-summary",
    label: "Completion / session summary",
    requirement: "completion/session summary",
    selector: Object.freeze({ attribute: "data-screen", value: "session-summary" }),
    nonColorChannels: Object.freeze(["current-session facts as a plain list", "no comparative or normative framing"]),
    derivedFromEngine: false,
    notes: "Summary is a factual report of this session. It makes no claim about learning.",
  }),
  Object.freeze({
    id: "replay",
    label: "Replay",
    requirement: "replay and change-grade/setup actions",
    selector: Object.freeze({ attribute: "data-action", value: "replay" }),
    nonColorChannels: Object.freeze(["explicit action", "equal visual weight with change-grade"]),
    derivedFromEngine: false,
    notes: "Replay is always explicit. A board never auto-starts.",
  }),
  Object.freeze({
    id: "change-grade",
    label: "Change grade / back to setup",
    requirement: "replay and change-grade/setup actions",
    selector: Object.freeze({ attribute: "data-action", value: "change-grade" }),
    nonColorChannels: Object.freeze(["explicit action", "equal visual weight with replay"]),
    derivedFromEngine: false,
    notes: "Leaving is as easy as continuing, and is not framed as giving up.",
  }),
  Object.freeze({
    id: "layout-classes",
    label: "Phone / tablet / desktop layouts",
    requirement: "phone/tablet/desktop layouts",
    selector: Object.freeze({ attribute: "data-layout", value: "phone | tablet | desktop" }),
    nonColorChannels: Object.freeze(["fit proven at every base viewport", "single-column reflow at 200% zoom"]),
    derivedFromEngine: false,
    notes: "The layout class is derived from viewport width by `layoutClassFor`, so the surface is not guessed from a media query alone.",
  }),
  Object.freeze({
    id: "keyboard-focus",
    label: "Keyboard / focus states",
    requirement: "keyboard/focus states",
    selector: Object.freeze({ attribute: "data-focus-ring", value: "visible" }),
    nonColorChannels: Object.freeze(["outline offset and thickness, visible on every surface"]),
    derivedFromEngine: false,
    notes: "Focus is an outline, not a colour change, so it survives forced colors.",
  }),
  Object.freeze({
    id: "forced-colors",
    label: "Forced-colors / high-contrast treatment",
    requirement: "forced-colors/high-contrast treatment",
    selector: Object.freeze({ attribute: "data-media", value: "forced-colors" }),
    nonColorChannels: Object.freeze(["system colours only", "boundaries kept via border-width, not border-color"]),
    derivedFromEngine: false,
    notes: "The design states its forced-colors behaviour explicitly rather than relying on the user agent.",
  }),
  Object.freeze({
    id: "reduced-motion",
    label: "Reduced-motion variants",
    requirement: "reduced-motion variants",
    selector: Object.freeze({ attribute: "data-media", value: "reduced-motion" }),
    nonColorChannels: Object.freeze(["identical state and feedback", "no essential rotation, parallax or movement"]),
    derivedFromEngine: false,
    notes: "Motion is decoration. Removing it removes nothing a learner needed, which is why the outcomes must be identical.",
  }),
  Object.freeze({
    id: "celebration",
    label: "Bounded celebration",
    requirement: "bounded celebration",
    selector: Object.freeze({ attribute: "data-feedback", value: "celebration" }),
    nonColorChannels: Object.freeze(["celebration is never required to continue", "skippable from the first frame"]),
    derivedFromEngine: true,
  notes: "Bounded in `motion.ts` to at most 2500ms and skippable within 1000ms, and it changes no game state.",
  }),
]);

/** The state ids, in inventory order. */
export function designStateIds(): readonly string[] {
  return Object.freeze(DESIGN_STATES.map((state) => state.id));
}

/**
 * The five inventory entries that must survive the absence of colour, by id.
 *
 * Matched on id rather than on the selector value, because the two vocabularies deliberately differ: the
 * design reads the engine's `revealed` as *selected*, and a pending comparison belongs to the board rather
 * than to a card. Keying on the selector would silently drop two of the five.
 */
export const COLOUR_INDEPENDENT_STATE_IDS = Object.freeze([
  "card-hidden",
  "card-selected",
  "card-comparing",
  "card-matched",
  "card-explaining",
] as const);

/** States whose affordance must survive the absence of colour. */
export function colourIndependentStates(): readonly DesignState[] {
  return Object.freeze(
    DESIGN_STATES.filter((state) => (COLOUR_INDEPENDENT_STATE_IDS as readonly string[]).includes(state.id)),
  );
}

/**
 * The five colour-independent card states, with their non-colour channels.
 *
 * Returned as a map keyed by the story's own state names, because the test's job is to prove that no two
 * of these five rely on the same affordance — which is what "distinguishable without colour" means.
 */
export function colourIndependentCardChannels(): Readonly<Record<CardStateWithoutColour, readonly string[]>> {
  return Object.freeze({
    hidden: CARD_HIDDEN_STATE.nonColorChannels,
    selected: CARD_SELECTED_STATE.nonColorChannels,
    comparing: CARD_COMPARING_STATE.nonColorChannels,
    matched: CARD_MATCHED_STATE.nonColorChannels,
    explaining: CARD_EXPLAINING_STATE.nonColorChannels,
  });
}

