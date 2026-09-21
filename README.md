# Fraction Match

Standalone browser math game: match two cards that represent the **same amount**, even when the
symbols look different. Canonical implementation repository for Jira Epic **GAME-97**.

> **This build is the GAME-185 foundation, not the finished Fraction Match experience.** It ships a
> deterministic fraction engine, provenance, architecture guards, CI, and a minimal browser shell
> that proves the standalone artifact boots and that the engine drives the UI. The production card
> art, fraction visualisations, grade lanes, board UX and feedback system are deliberately **not**
> implemented here.

## Status

| Item | Value |
| --- | --- |
| Jira Epic | GAME-97 — Fraction Match — standalone equivalent-fractions game, games-site release and final qualification |
| Jira story | GAME-185 — FM-01 — Bootstrap standalone repo and exact deterministic fraction engine |
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

src/App.tsx            Minimal foundation shell: projects engine state, dispatches engine actions.
src/app/               Foundation debug fixture and global styles.
scripts/               Architecture guards and the nested asset-base harness.
tests/                 Unit, property, architecture-guard and browser tests.
docs/provenance/       Legacy baseline provenance record.
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

// A future lane supplies the families; GAME-185 ships only a neutral debug fixture.
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
npm run test:coverage  # the same, with engine coverage thresholds (90% per file minimum; currently 100%)
npm run build          # production static artifact in dist/
npm run preview        # serve dist/ at the domain root

npm run check:purity       # engine purity: no ambient state, no packages
npm run check:boundary     # presentation may import only the public engine boundary
npm run check:architecture # both guards above
npm run check:privacy      # dependency allowlist + privacy surface scan (needs a build)

npm run test:e2e       # build, then direct/root browser smoke (port 4173)
npm run test:host      # build, then nested versioned asset-base smoke (port 4183)
npm run serve:nested-host  # inspect the nested harness yourself

npm run verify         # typecheck, lint, coverage, guards, build, privacy — the CI-equivalent local gate
```

Engine tests run without React, DOM or SVG: Vitest's environment is plain Node, and `tests/` never
mounts a component.

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
| Browser smoke (direct and nested versioned base) | `tests/e2e/` |

## Continuous integration

`.github/workflows/ci.yml` runs on Node 24 from the committed lockfile and needs **no credentials**:
install, typecheck, lint, coverage tests, architecture guards, production build, privacy guard, then
Chromium browser smoke for both the direct build and the nested versioned asset base. Release and
publication credentials are intentionally absent until a later story owns publication.

## Downstream story boundaries

This foundation intentionally stops before the following work; it builds the seams they need.

| Story | Owns | Not implemented here |
| --- | --- | --- |
| GAME-186 | Accessible SVG fraction representation primitives over these rational values | any SVG primitives or production card art |
| GAME-187 | Grade 3/4/5 lanes, denominator catalogues, representation mixes, distractors, progression and review — as `DeckConfig` data | any curriculum, lane or grade logic |
| GAME-188 | Production visual/responsive/motion design | any visual design authority |
| GAME-189 | Final semantic board UX and the standalone shell | the production board |
| GAME-190 | Explanatory match/mismatch feedback and bounded game feel | any feedback system or dwell timing |
| GAME-191 | Bounded session lifecycle and factual summary | session bounds or summary |
| GAME-192 | Full accessibility and device qualification (axe tooling is pre-provisioned) | accessibility qualification |
| GAME-193 | Comparator scorecard and bounded playtest | any playtest or comparison |
| GAME-194 | Immutable R2 publication and production promotion | publication, manifests, promotion |
| GAME-335 | games-site coming-soon routes and the preview-only host seam | any `games-site` change |

Known GAME-185 limitations, recorded honestly: the shell renders unstyled debug buttons rather than
a game board; only Chromium is exercised in CI; cross-engine, screen-reader, forced-colors,
reduced-motion and reflow qualification are unproven; the shipped fixture is a neutral test fixture
and not curriculum content.

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
