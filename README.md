# Fraction Match

Standalone browser math game: match two cards that represent the **same amount**, even when the
symbols look different. Canonical implementation repository for Jira Epic **GAME-97**.

> **The root of this artifact is the playable game.** Choose a grade, play a warm-up, play a production board —
> built on the GAME-185 engine, the GAME-186 representation primitives, the GAME-187 lanes and the GAME-188 design
> system. The debug shell that each earlier story qualified its artefact in is behind `#debug`.
>
> The arcade card art, the explanatory feedback (GAME-190), the session bounds and factual summary (GAME-191), the
> accessibility qualification (GAME-192) and the games-site host fixture (GAME-335) are deliberately **not**
> implemented here.

## Status

| Item | Value |
| --- | --- |
| Jira Epic | GAME-97 — Fraction Match — standalone equivalent-fractions game, games-site release and final qualification |
| Jira story | GAME-185 — FM-01 — Bootstrap standalone repo and exact deterministic fraction engine |
| Jira story | GAME-186 — FM-02 — Accessible SVG fraction representation primitives |
| Jira story | GAME-187 — FM-03 — Standalone grade lanes, representation progression and bounded review |
| Jira story | GAME-188 — FM-04 — Production visual, responsive and motion design system |
| Jira story | GAME-189 — FM-05 — Standalone semantic React game shell and responsive board |
| Jira story | GAME-190 — FM-06 — Explanatory equivalence feedback, mismatch recovery and bounded game feel |
| Node | 24 (see `.nvmrc` / `.node-version` / `engines.node`) |
| Runtime dependencies | `react`, `react-dom` — nothing else |
| Release kind | `static-web` (published by `setnessconsulting/games-site`) |

## Authority boundaries

- **This repository owns** game source, exact mathematical truth, tests, architecture guards, the
  production static build, and release evidence.
- **`setnessconsulting/games-site` owns** the catalog entry, `/fraction-match/` routes, the
  same-origin iframe host, versioned artifact delivery, preview/production pointers, promotion and
  rollback. This repository must never assume it is the whole site.
- **`setnessconsulting/levelbest` is out of scope.** The historical Fraction Match component under
  `legacy/next-reference/` is reference/provenance only and is not reactivated, imported or required
  by anything here.
- **The deterministic engine owns correctness.** Rendering is a one-way projection of engine state.

## Relationship to `games-site`

games-site's release contract requires static-web artifacts to resolve from a versioned nested
prefix, never from the domain root:

```text
game-assets/fraction-match/<version>/index.html
game-assets/fraction-match/<version>/assets/...
game-assets/fraction-match/<version>/release-manifest.json
```

Accordingly this repository builds with `base: "./"` and ships a qualification harness that serves
`dist/` under `/game-assets/fraction-match/test-version/`, with Playwright proving that the built
document, its JavaScript and its CSS all resolve beneath that prefix and that the domain root is
**not** served. Host routing, preview pointers, R2 allowlists and promotion belong to GAME-335 and
GAME-194; nothing in `games-site` was modified for GAME-185.

## Architecture

```text
src/engine/            Pure, dependency-free, deterministic TypeScript. The mathematical authority.
  index.ts             The ONLY engine module presentation code may import.
  rational.ts          Canonical normalized rational values and exact equivalence.
  fractionForm.ts      Authored notation preserved alongside its derived canonical value.
  rng.ts               Deterministic mulberry32 generator and rng-injected shuffle.
  deck.ts              Generic configuration-driven deck generator.
  gameState.ts         Pure action/state machine.

src/representations/   Accessible SVG representation primitives (GAME-186). The ONLY public surface is
  index.ts             `src/representations/index.ts`; nothing here imports the engine at all.
  contract.ts          Structural input contract (an engine `FractionForm` satisfies it directly).
  whole.ts             Declared wholes, counting rules and the shared-whole comparison planner.
  notation.ts          The one canonical formatter: written digits, spoken name, text alternative.
  layout.ts            Shared geometry model and the legibility floors it is measured against.
  legibility.ts        The measurement policy and the lane-facing selection API.
  geometry/            Pure, deterministic geometry per family (bar, circle, set, number-line, symbol).
  components/          React/SVG primitives, one per family, plus the shared comparison view.

src/lanes/             Grade lanes (GAME-187): content as data, validation, planning and adaptation.
  index.ts             The ONLY public lane surface. No React, no DOM, no package imports.
  schema.ts            Lane configuration, its policies and its structural validation.
  families.ts          The lane's value pool, near-miss links and exact axis-tick positions.
  wholes.ts            The one continuous whole, collection and axis every card in a lane shares.
  coverage.ts          Per-authored-form legibility coverage against the lane's mix.
  validate.ts          The four-question lane audit, including the denominator-100 rule.
  plan.ts              The engine's deck plus one representation decision per card.
  curriculum.ts        The checked-in grades 3-5 map: claims, catalogues, lanes and exclusions.
  difficulty.ts        The derived difficulty ladder and its one-dimension-per-rung proof.
  adaptation.ts        Between-board adaptation and bounded, session-local review.

src/design/            Production design authority (GAME-188): tokens, the required state inventory, the
                       responsive fit contract and the motion spec. It imports nothing at all, so its
                       layout answers are checkable in plain Node.
  tokens.ts            The palette (inheriting GAME-186's qualified pair) and the contrast floors.
  states.ts            The 24 required design states with their code-facing names and non-colour channels.
  responsive.ts        Base viewports, the board fit planner and the zoom/reflow contract.
  motion.ts            Motion timings, the celebration bounds and reduced-motion parity.

src/App.tsx            Application root: the game, or the debug shell behind `#debug`.
src/app/               Debug fixture, the GAME-186 gallery, the GAME-187 lane panel, the GAME-188 design
                       panel, styles.
src/game/              The playable surface (GAME-189) and its feedback (GAME-190).
  session.ts           Every shell decision, with no React: grade, lane, warm-up, stages, intents.
  focus.ts             The deterministic roving-focus model, as arithmetic.
  feedback.ts          Mismatch classes, exact bounded copy, the match demonstration and the window plan.
  useInspectionWindow.ts  The cancelable 1.2s/3s window; a timer may only clear a pair, never change truth.
  Board.tsx            The board: engine state in, typed intents out, GAME-188 card states applied.
  GameApp.tsx          The stage machine, the calm-recovery boundary and the setup/instruction screens.
scripts/               Architecture guards and the nested asset-base harness.
tests/                 Unit, property, architecture-guard and browser tests.
docs/provenance/       Legacy baseline provenance record.
docs/representations/   The GAME-186 representation contract, written for its consumers.
docs/lanes/            The GAME-187 lane contract and the grades 3-5 curriculum map.
docs/design/           The GAME-188 design authority (labelled FALLBACK / FIGMA NOT QUALIFIED).
docs/game/             The GAME-189 board and shell contract, and the GAME-190 copy register.
```

### Rational and engine authority

A canonical rational is a reduced integer pair with a strictly positive denominator, a numerator
that carries the sign, zero normalized to `0/1`, and both fields safe integers. Construction
validates and reduces; a normalized integer pair is the only thing that ever decides equivalence.

- No floating-point comparison anywhere.
- No cross multiplication as the canonical equality path, because it can overflow the safe-integer
  range for values the game may legitimately generate.
- No string keys: equivalence grouping compares canonical pairs, never rendered labels.
- `pairId` and `cardId` exist for generation, rendering and debugging only. A shared `pairId` cannot
  create a match and a mismatched `pairId` cannot prevent one — this is asserted directly in
  `tests/gameState.test.ts`.
- Authored notation is preserved separately (`FractionForm`), so `1/2` and `2/4` remain visually
  different cards with one shared mathematical value.

The engine is pure. It contains no React, DOM, clock, ambient entropy, storage, network, timer or
process-environment access, and no package imports at all. Every module under `src/engine/` is
guarded by an ESLint rule set, a repository source scan and unit tests of the scan rules themselves.

### The engine in one page

```ts
import {
  PRODUCTION_PAIR_COUNT,
  WARM_UP_PAIR_COUNT,
  applyAction,
  cardStateOf,
  createDeck,
  createGameState,
  isCardSelectable,
  isGameComplete,
} from "./src/engine";

// A lane supplies the families: `laneEquivalenceFamilies(lane)` is the bridge from content to engine data.
const deck = createDeck({ pairCount: PRODUCTION_PAIR_COUNT, families, seed: 20260921 });
let state = createGameState(deck);

state = applyAction(state, { type: "select-card", cardIndex: 0 }).state; // no move yet
state = applyAction(state, { type: "select-card", cardIndex: 5 }).state; // exactly one move

cardStateOf(state, 0);            // "hidden" | "revealed" | "matched"
isCardSelectable(state, 12);      // engine-owned legality for the presenter
isGameComplete(state);            // derived from authoritative state
```

`applyAction` is total and pure: every action returns either an applied new state or an explicit
rejection with a stable reason code and the unchanged state. Repeating an action cannot
double-resolve or double-increment anything.

### Representation primitives (GAME-186)

Five families — `symbolic`, `bar`, `circle`, `set`, `number-line` — over the engine's values, with the
full rules in [`docs/representations/CONTRACT.md`](docs/representations/CONTRACT.md). The short version:

- **One-way projection.** The layer imports no engine module, not even a type, so a picture can never
  re-derive or second-guess a value, and the whole layer can move into a shared package without moving
  mathematical authority.
- **Every picture declares its whole.** Continuous whole, countable collection (with an exact total) or a
  shared axis. Two representations may only be compared when they declare the same whole; a set pair must
  keep its total fixed and a number-line pair must share one domain and scale. An unsupported pair throws
  instead of drawing two incompatible quantities side by side.
- **The legibility policy is the mechanism, not a guideline.** 8 × 8 px clear partition regions, 2 px
  division lines at ≥ 3:1 contrast, readable tick and label spacing, and a 10 px glyph floor. A lane asks
  `selectLegibleRepresentation` for the first family that can be read *at that card size* and receives
  every rejection with the measurement that caused it, instead of a shrunken picture.
- **One canonical formatter.** Written digits, the spoken name and the copy/paste text all come from the
  same module, so `2/4` is always drawn and announced as *two fourths* and never silently reduced. No
  output contains a vulgar-fraction glyph.
- **Ink only, static by construction.** Filled parts are solid ink and empty parts are outlines, so
  quantity survives forced colors and greyscale; the stylesheet declares no transform and no motion, so
  reduced motion cannot change geometry.

The shell renders a debug gallery (`src/app/RepresentationGallery.tsx`) over engine-authored values at the
smallest shipped card (68 × 68 px) and at a default card (96 × 96 px): the chosen family and the rejections
per row, all five families, every supported shared-whole comparison, and both refusals the layer performs.
It is a qualification surface, not a lane and not a board.

```ts
import { MIN_CARD_SIZE_CSS_PX, RepresentationByFamily, continuousWhole, selectLegibleRepresentation } from "./src/representations";

const whole = continuousWhole({ wholeId: "unit-whole", description: "one whole unit" });
const box = { width: MIN_CARD_SIZE_CSS_PX, height: MIN_CARD_SIZE_CSS_PX };

const choice = selectLegibleRepresentation([{ family: "bar" }, { family: "circle" }, { family: "symbolic" }], {
  fraction: form,               // an engine FractionForm, passed straight through
  box,
  wholeFor: (family) => (family === "symbolic" ? whole : whole),   // a lane declares its wholes
});

choice.ok && <RepresentationByFamily family={choice.family} fraction={form} whole={whole} box={box} />;
```

### Grade lanes, progression and bounded review (GAME-187)

A lane is content as data: a denominator catalogue, a numerator policy, a scale-factor set, one shared whole,
a card box, a representation preference order, a distractor policy, a label-visibility setting and three
adaptation thresholds. The lane layer never shuffles and never computes equivalence — the engine still
chooses which pool values are dealt, and the GAME-186 legibility policy still chooses each card's family.
The full contract is in [`docs/lanes/CONTRACT.md`](docs/lanes/CONTRACT.md).

- **Validation is the audit.** `validateLaneConfig` asks four questions in order — is it structurally a
  lane, can its wholes carry its catalogue, does the catalogue yield a usable pool, can its mix draw every
  value in that pool — and reports every problem at once. A lane that cannot be dealt fails loudly; no
  content or representation requirement is ever silently dropped.
- **The denominator-100 rule is a lane invariant.** A lane whose catalogue contains 100 may never draw a
  hundredth as a partition grid: `symbolic` and `number-line` are exempt because neither draws a grid, and
  every other family must cap its `maxPartitionCount` below 100, which makes the grid *unreachable* rather
  than merely illegible.
- **The curriculum is checked in and separate.** `src/lanes/curriculum.ts` carries the grades 3–5 claims
  (primary / supporting / review-only), the story's exact denominator catalogues, the exclusions and the
  shipped lanes. `curriculumProblems()` refuses a claim that inflates what a lane teaches, including a
  primary claim about another grade's standard. See
  [`docs/lanes/CURRICULUM_MAP.md`](docs/lanes/CURRICULUM_MAP.md).
- **Difficulty is a derived ladder.** `laneLadder` walks from the most scaffolded rung to the lane as
  written, one bounded edit at a time (restore the printed label, drop the least-preferred family, drop the
  largest catalogue denominator), keeping a rung only while it is still a satisfiable lane.
  `assertLaneLadderInvariants` then proves that adjacent rungs differ in exactly one dimension and that each
  change moves in the easier direction.
- **Adaptation happens between boards only.** `recordBoardOutcome` decides the *next* board's difficulty;
  the board in play keeps its own. Latency is carried as evidence and read by no decision, so speed never
  promotes or demotes.
- **Review is bounded and fresh.** A confused value is scheduled at most `MAX_PENDING_REVIEW` deep, and its
  review board restores printed labels and refuses to deal the memorized pair again — re-dealing until it
  does not, and failing loudly if it cannot.
- **No mastery is expressed.** There is no score, proficiency, level or placement in any type or export.

```ts
import { boardOutcomeFor, createLaneSession, laneLadder, planLaneBoard, recordBoardOutcome } from "./src/lanes";

const ladder = laneLadder(lane);                 // derived from validated content; no outcomes needed
let session = createLaneSession(lane, seed);     // starts at the most scaffolded rung
const board = planLaneBoard(session, ladder);    // frozen: this is the board on screen
session = recordBoardOutcome(session, ladder, boardOutcomeFor(board, { matchedPairs: 3, activeMs: 12_000 }));
```

The shell renders the fixture lanes as a debug panel (`src/app/LanePanel.tsx`): one planned board per lane,
with value, family and distinct-representation facts stated as `data-*` attributes so the browser
qualification can assert the projection instead of recomputing it. Those fixtures are **neutral examples**
and carry no standards claim; the reviewed content is the curriculum map.

### Design system (GAME-188)

`src/design/` is the appearance authority: tokens, the required state inventory, the responsive fit contract
and the motion spec. It is **pure data and pure functions** — it imports nothing at all, not even React — which
is what lets the central claim be arithmetic instead of a screenshot:

> a 16-card production board fits a 320×568 phone at 100% zoom with no internal scrolling, every card at 68×68
> CSS px or larger.

That claim is computed by `planBoardLayout`, asserted in `tests/designResponsive.test.ts` across every base
viewport and zoom level, and then *measured on the rendered board* by `tests/e2e/designSystem.spec.ts`, which
fails if the implementation disagrees with the plan. The 4px board gap is derived from that budget rather than
chosen, so a future gap tweak fails in the unit test rather than in a screenshot.

Two inherited values are deliberately **not** the design layer's to move: `--fm-text` and `--fm-surface` are
the pair GAME-186's 3:1 division-line contrast floor was measured against, and 68px is the box its legibility
floors were measured at. The design layer restates them, holds itself to them, and fails the build if they
drift.

Motion is presentation only, structurally: GAME-186's primitives carry no motion at all, and under a
reduced-motion preference every duration collapses to zero with a byte-identical outcome, so no information
lives in a transition. Celebration is bounded to 2500ms and skippable within 1000ms.

The authority is the checked-in specification at [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md),
labelled **`FALLBACK / FIGMA NOT QUALIFIED`**: the story prefers a persistent Figma `fileKey`, no such file
exists for this project, and no Figma evidence is claimed anywhere in this repository.

### The playable board (GAME-189)

The **root of the artifact is now the game**: choose a grade, play a warm-up, play a production board. The debug
shell that each earlier story qualified its artefact in moved behind `#debug`, so what ships is the product rather
than a gallery. The full contract is in [`docs/game/BOARD.md`](docs/game/BOARD.md).

`src/game/session.ts` holds every decision the shell makes and contains no React, which is what makes the story's
authority rule structural rather than conventional: React renders engine state and emits intents, and it never
computes a match. Every question with a right answer is asked of the engine — `cardStateOf`, `isCardSelectable`,
`remainingPairCount`, `isGameComplete` — and nothing advances on a timer.

Content comes from GAME-187's **reviewed curriculum map**: a grade plays the largest board its own published lanes
deal, and the warm-up is the same lane re-dealt at the warm-up pair count, so the two boards share one
engine/action path. Grade 3 therefore deals 8 cards rather than 16, because that is what its catalogue publishes —
the shell does not inflate a grade's content to reach a board size.

**The card size is not the design's to choose.** A card is drawn at the box its lane was qualified at, because the
lane's coverage proof was a measurement at that box. That collides with GAME-188's "a 16-card board fits 320×568 at
100% zoom": a 16-card board at the 96px qualified box needs 396px of width. The resolution is that **the board size
gives way, not the card** — a phone deals fewer pairs (4 pairs on a 320×568 phone, the lane's full 8 on a desktop)
so every legibility proof and the all-cards-visible contract both hold. The board size is decided at deal time and
recorded in [`docs/game/BOARD.md`](docs/game/BOARD.md).

### Explanatory feedback (GAME-190)

Every resolve teaches the relationship. A mismatch names the amount that is larger and the signal the pair shares
(`Same top number. 1/2 is more than 1/3.`), and a match shows the shared amount in the two forms the learner
actually picked, on one shared whole. Every learner-facing string is in
[`docs/game/COPY_REGISTER.md`](docs/game/COPY_REGISTER.md).

Two decisions are load-bearing:

- **No mathematics happens in the copy.** Which amount is larger comes from a new engine primitive,
  `compareRationals`, which is deliberately *not* a cross-multiplication — `a.n * b.d` can leave the safe-integer
  range, so it compares integer parts and recurses on remainders. A sentence about a quantity is therefore exact
  for any values the engine can construct, and presentation still does not compute mathematics.
- **The inspection window is not motion.** A mismatched pair stays on screen for at least 1200ms and clears itself
  by 3000ms, and those durations are **identical under a reduced-motion preference**: that window is the time the
  two amounts need to be looked at, so collapsing it would change what the learner is told rather than how it is
  drawn. Reduced motion still removes the decoration, and the browser journey asserts both halves.

A timer may only ever clear a pending comparison. The engine decided the outcome and counted the move when the
second card was chosen, so an automatic dismissal changes no truth — asserted by capturing the move count and
matched set before and after it fires.

### Seeds and determinism

The engine never reads ambient entropy. Seeds are 32-bit unsigned integers supplied as data. The
same seed plus the same configuration plus the same action sequence always yields identical state;
`tests/rng.test.ts` pins a reference vector so the generator cannot change silently. In production
the shell samples entropy with `crypto.getRandomValues` and passes the number in.

### Privacy posture

The foundation is memory-only:

- no learner accounts or identity;
- no cookies, `localStorage`, `sessionStorage`, `IndexedDB` or persistent gameplay state;
- no remote learner telemetry, analytics, Sentry/observability, session replay or advertising;
- no network gameplay API calls — static asset loading is the only browser network requirement.

`npm run check:privacy` enforces a React-only runtime dependency allowlist and scans both source and
the production bundle for persistence, network, telemetry and analytics markers. The browser smoke
test additionally asserts that a play session issues **no request at all** after the initial static
load. `fetch(` is enforced on repository source only, because Vite's modulepreload polyfill contains
one legitimate static-asset `fetch` in the bundled output.

## Commands

```bash
npm ci                 # install exactly what the lockfile pins
npm run dev            # local dev server
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # unit + property + architecture-guard tests
npm run test:coverage  # the same, with 90% per-file coverage thresholds over engine, representations and lanes
npm run build          # production static artifact in dist/
npm run preview        # serve dist/ at the domain root

npm run check:purity           # engine purity: no ambient state, no packages
npm run check:boundary         # presentation may import only the public engine boundary
npm run check:representations  # the representation layer stays engine-free, self-contained and static
npm run check:lanes            # the lane layer consumes only the two public boundaries and no package
npm run check:architecture     # all four guards above
npm run check:privacy          # dependency allowlist + privacy surface scan (needs a build)

npm run test:e2e       # build, then direct/root browser smoke (port 4173)
npm run test:host      # build, then nested versioned asset-base smoke (port 4183)
npm run serve:nested-host  # inspect the nested harness yourself

npm run verify         # typecheck, lint, coverage, guards, build, privacy — the CI-equivalent local gate
```

Engine tests run without React, DOM or SVG: Vitest's environment is plain Node, and `tests/` never mounts
a component. The representation primitives are asserted the same way — React's server renderer returns the
same markup the browser receives, so their accessible names, hidden text alternatives and refusals are
unit tested without a DOM. Everything the browser alone can measure (real card sizes, rendered label
spacing, computed contrast, forced colors, reduced motion, 320 px reflow, axe) is asserted in
`tests/e2e/representationGallery.spec.ts` against the built artifact. The lane layer is tested the same
way — it imports no package at all, so its validation, curriculum map, ladder and adaptation are plain Node —
and the lane panel reuses the same split: `tests/e2e/lanePanel.spec.ts` measures what only a browser can.

## Nested-host and static-web requirement

`npm run test:host` starts `scripts/nested-host-server.mjs` — a standard-library-only harness that
mounts `dist/` at `/game-assets/fraction-match/test-version/` and returns 404 for everything else,
including `/`, `/index.html` and `/assets/`. Playwright then asserts that:

- the nested `index.html` responds 200 and mounts React;
- every document, JavaScript and CSS response resolves beneath the versioned prefix;
- `.../test-version` (no trailing slash) resolves to its index document;
- the artifact does **not** exist at the domain root;
- no browser console error or uncaught page error occurs (an automatic gate on every browser test).

## Testing

| Area | Where |
| --- | --- |
| Canonical rationals: reduction, signs, zero, zero denominator, unsafe integers, boundary values, equivalence oracle | `tests/rational.test.ts` |
| Authored form preservation and validation | `tests/fractionForm.test.ts` |
| Deterministic generator including a pinned reference vector | `tests/rng.test.ts` |
| 4-pair and 8-pair boards, configuration failure modes, deck invariants | `tests/deck.test.ts` |
| Many-seed property sweeps over generic and boundary fixtures | `tests/deckProperties.test.ts` |
| State machine: reveal, match, mismatch, moves, duplicate/third-card/matched rejection, acknowledgement, completion, purity, `pairId` independence | `tests/gameState.test.ts` |
| Historical eight-pair board parity as a regression fixture | `tests/legacyParity.test.ts` |
| Guard rule engine, including negative cases | `tests/architectureGuards.test.ts` |
| Public engine boundary contract | `tests/engineBoundary.test.ts` |
| Toolchain pinning and manifest invariants | `tests/toolchain.test.ts` |
| Representation input contract | `tests/representationContract.test.ts` |
| Declared wholes, counting rules and the comparison matrix | `tests/representationWhole.test.ts` |
| The canonical formatter, accessible names and the vulgar-glyph policy | `tests/representationNotation.test.ts` |
| Deterministic geometry per family | `tests/representationGeometry.test.ts` |
| Legibility floors, selection, refusals and property sweeps over values and boxes | `tests/representationLegibility.test.ts` |
| Primitive markup, accessible names and refusal behaviour (server-rendered) | `tests/representationComponents.test.tsx` |
| Guard scanners, style invariants, palette/card-size drift and gallery decisions | `tests/representationIsolation.test.ts` |
| Lane configuration, the new progression policies and structural validation | `tests/laneSchema.test.ts` |
| Lane pools, scale-factor sets, exact axis positions and the distractor gap/class rules | `tests/laneFamilies.test.ts`, `tests/laneDistractors.test.ts` |
| Lane wholes, divisibility and the shared-whole rules | `tests/laneWholes.test.ts` |
| Per-authored-form legibility coverage, including a family that cannot express a value | `tests/laneCoverage.test.ts` |
| Lane planning, pair representation choice and plan invariants | `tests/lanePlan.test.ts` |
| The curriculum map: exact catalogues, claims, exclusions and the denominator-100 rule | `tests/laneCurriculum.test.ts` |
| The difficulty ladder and its one-dimension-per-rung invariants | `tests/laneDifficulty.test.ts` |
| Between-board adaptation, bounded review, latency independence and the no-mastery posture | `tests/laneAdaptation.test.ts` |
| Lane guard scanners, real-tree isolation and the build/lint wiring | `tests/laneIsolation.test.ts` |
| The fixture lanes end to end at a fixed seed | `tests/laneFixtures.test.ts` |
| Browser smoke (direct and nested versioned base) | `tests/e2e/` |
| Representation qualification in the built artifact (floors, contrast, forced colors, reduced motion, 320 px, label spacing, axe) | `tests/e2e/representationGallery.spec.ts` |
| Lane panel qualification in the built artifact (card size and scale, one representation per card, distinct families per pair, accessible names, 320 px reflow, axe) | `tests/e2e/lanePanel.spec.ts` |

## Continuous integration

`.github/workflows/ci.yml` runs on Node 24 from the committed lockfile and needs **no credentials**:
install, typecheck, lint, coverage tests, architecture guards, production build, privacy guard, then
Chromium browser smoke for both the direct build and the nested versioned asset base. Release and
publication credentials are intentionally absent until a later story owns publication.

## Downstream story boundaries

This foundation intentionally stops before the following work; it builds the seams they need.

| Story | Owns | Not implemented here |
| --- | --- | --- |
| GAME-186 | Accessible SVG representation primitives over these rational values | implemented here — see [`docs/representations/CONTRACT.md`](docs/representations/CONTRACT.md); still not a board, a lane or production card art |
| GAME-187 | Grade 3/4/5 lanes, denominator catalogues, representation mixes, distractors, progression and review | implemented here — see [`docs/lanes/CONTRACT.md`](docs/lanes/CONTRACT.md) and [`docs/lanes/CURRICULUM_MAP.md`](docs/lanes/CURRICULUM_MAP.md); it is content and rules, not a board, a session UI or production card art |
| GAME-188 | Production visual/responsive/motion design | implemented here — see [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md); the authority is the checked-in fallback, explicitly labelled `FALLBACK / FIGMA NOT QUALIFIED` because no Figma file exists, and it is a contract rather than a board |
| GAME-189 | Final semantic board UX and the standalone shell | implemented here — see [`docs/game/BOARD.md`](docs/game/BOARD.md); the playable game is the root surface and the debug galleries moved to `#debug`. Not the GAME-335 iframe fixture, not GAME-190 feedback, not GAME-191 session bounds |
| GAME-190 | Explanatory match/mismatch feedback and bounded game feel | implemented here — see [`docs/game/COPY_REGISTER.md`](docs/game/COPY_REGISTER.md); every explanation is generated from the engine's own values, bounded to 12 words, and the inspection window is identical under reduced motion. Not the GAME-191 session arc, and audio is deliberately absent (silence-first v1) |
| GAME-191 | Bounded session lifecycle and factual summary | session bounds or summary |
| GAME-192 | Full accessibility and device qualification (axe tooling is pre-provisioned) | accessibility qualification |
| GAME-193 | Comparator scorecard and bounded playtest | any playtest or comparison |
| GAME-194 | Immutable R2 publication and production promotion | publication, manifests, promotion |
| GAME-335 | games-site coming-soon routes and the preview-only host seam | any `games-site` change |

Known limitations, recorded honestly. From GAME-185: the shell renders unstyled debug buttons rather than a
game board, and only Chromium is exercised in CI. From GAME-186: cross-engine and screen-reader behaviour
remain unproven; forced colors and reduced motion are checked through Chromium's emulation rather than real
OS settings; the gallery's value list is a debug fixture and not curriculum content; and the circle model's
legibility model measures a wedge by its outer arc and radial depth, which is a floor rather than a proof.
From GAME-187: the lane fixtures are **neutral examples** with no standards claim (the reviewed content is
the curriculum map); a review board is a fresh deal of the same lane rather than a targeted re-serve of the
confused value, so the session *reports* whether that value was re-encountered instead of forcing it; a
lane with 100 in its catalogue cannot offer the number line legibly at any shipped card size, so grade 4
resolves a hundredth symbolically; and adaptation and review are pure, tested domain logic that no browser
surface drives yet. From GAME-188: the design authority is the checked-in fallback and is **not** Figma-backed
— no Figma file exists for this project and none is claimed — so the design's provenance stays unqualified
until a real `fileKey` is recorded; 200% zoom is qualified by emulating the halved content viewport rather than
by driving a browser's own zoom setting; catalog card art and copy are not produced here, because inventing
placeholder art would pre-empt GAME-194's promotion review. From GAME-189: the game is playable, but **the
GAME-335 iframe fixture is not demonstrated** — GAME-335 is in Ready, not Done, and its games-site host contract
is its own work; and the production board deals a viewport-dependent number of pairs — 4 on a 320×568 phone, the
lane's full 8 on a desktop — because a card is never shrunk below the box its coverage was proved at, so a phone
plays a shorter board rather than a smaller picture. From GAME-190: the feedback is text and pictures only —
**silence-first v1 means there is no audio at all**, and none is claimed; the copy register is complete for what
the game can currently say, but the match demonstration shows the pair's own two pictures rather than a
purpose-drawn comparison figure; and the inspection window is verified with Playwright's reduced-motion
emulation rather than a real OS setting. There are still no session bounds or summary, because those belong to
GAME-191; cross-engine scope is the game journeys only — Chromium, Firefox and mobile WebKit run both of them,
while the representation, lane and design qualifications remain Chromium-only by their own recorded limitation;
and full accessibility and device qualification belongs to GAME-192.

## Provenance

The historical LevelBest Fraction Match component was inspected and recorded, not ported. See
[`docs/provenance/LEGACY_BASELINE.md`](docs/provenance/LEGACY_BASELINE.md) for the exact repository,
commit, path, blob identity, observed behaviour, preserved concepts, intentional replacements and
the explicit statement of what was not copied.

## Core loop reference (future work, not this build)

For orientation only: the intended product supports a 4-pair / 8-card warm-up and an 8-pair / 16-card
production board seeded deterministically, matching equivalent fractions across symbolic, bar,
circle/area, set and number-line representations. Accessibility, curriculum and design authority for
those flows live in the downstream stories listed above.
