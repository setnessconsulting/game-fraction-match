# Legacy baseline provenance — historical Fraction Match

This record is required by GAME-185 before any migration or reimplementation claim is made. It
documents exactly what was inspected, what the historical code did, what conceptual behaviour was
preserved, what was deliberately replaced, and what was **not** copied.

> **Historical LevelBest code is reference and provenance only.** No LevelBest code, styling,
> routing, copy, assets or tooling was copied into this repository, and nothing in
> `setnessconsulting/game-fraction-match` imports, requires or references LevelBest at runtime.
> Fraction Match is not a LevelBest runtime feature under GAME-97. The historical component must not
> be reactivated.

## Exact source inspected

| Item | Value |
| --- | --- |
| Repository | `setnessconsulting/levelbest` (https://github.com/setnessconsulting/levelbest) |
| Ref | `main` |
| Commit inspected (resolved as `main` HEAD on 2026-09-21) | `c2c8beeb4b67512d926ba5905c58b81319a46bbd` |
| Commit date | 2026-09-20 |
| Historical path | `legacy/next-reference/src/app/games/FractionMatch.tsx` |
| Blob SHA at that commit | `a63ba77cc1cf97fc5a2a46dc8fc2507a5d79fd65` |
| File size | 123 lines |
| Introduced by | `772e91abaa861d00c78c2fb0a6e8b12bb047bab2` — "feat(levelbest): establish Cloudflare Wave 1 foundation" (2026-09-10); the file has not changed since |

The previously recorded path/SHA were re-verified rather than assumed: the commit exists, it is the
current `main` HEAD of `levelbest`, and the file is present at that path with that blob identity.

## Historical behaviour observed

The component was a Next.js client component (`"use client"`) that rendered a 16-card memory board.

- **Content:** a module-level `pairs` array of eight hardcoded *string* pairs, in the order
  `1/2 & 2/4`, `1/3 & 2/6`, `2/3 & 4/6`, `1/4 & 3/12`, `3/4 & 6/8`, `1/5 & 2/10`, `2/5 & 4/10`,
  `3/5 & 6/10`.
- **Deck:** `buildDeck()` produced `{ id, label, pairId }` cards — one per string, `pairId` assigned
  by array index — then shuffled in place with an unseeded Fisher–Yates and `Math.random()`.
- **State:** `deck`, `faceUp`, `matched`, `moves`, `locked` in React component state. `won` was
  derived as `matched.length === deck.length`.
- **Interaction:** `flip(index)` returned early when `locked`, already face-up, or already matched.
  It appended the index; with fewer than two face-up cards it returned without counting a move.
  Otherwise it incremented `moves`, set `locked`, and compared `deck[a].pairId === deck[b].pairId`.
- **Timing:** matching pairs were resolved after a 500 ms `setTimeout`; mismatches cleared after
  900 ms. Both resolutions lived inside the component.
- **Completion:** when `won` became true, an `h2` announcing the move count was focused
  (`preventScroll: true`) and a "Play again" / "All games" panel replaced the board.
- **Accessibility (as authored):** board cells were `<button>` elements in a `.flip-grid` with
  `aria-label` of `Fraction <label>` or `Hidden card`, plus `, matched` once matched. Status text
  read `Fraction Match · N of M pairs · N moves`. Hidden cards rendered the literal `?`.
- **Presentation:** Bootstrap-like class names (`demo-panel`, `flip-grid`, `flip-card`, `eyebrow`,
  `lede`, `microcopy`, `demo-status`, `demo-controls`, `link-button`, `closing-copy`) supplied by
  LevelBest's global stylesheet. Exit was an `onExit` prop.

## What conceptual behaviour is preserved

These are the behaviours the modern engine intentionally keeps, expressed as explicit invariants:

1. **The core question is quantity, not notation.** Two cards match when they name the same amount,
   even when the written symbols differ (`1/2` and `2/4`).
2. **Warm-up-to-production board sizes.** The historical board was a 16-card / 8-pair board; the
   modern generator supports 8 cards / 4 pairs and 16 cards / 8 pairs from one implementation.
3. **Two-step reveal with one atomic resolution.** The first reveal is not a move; the second
   genuine, distinct second selection produces exactly one comparison and one move.
4. **Illegal repeats are inert.** Clicking the same card twice, clicking a matched card, or clicking
   during an unresolved comparison cannot create a comparison or double-count a move.
5. **Matched cards stay resolved** and the board completes when every pair is matched.
6. **Mismatches stay visible** before they return hidden — but modelled as explicit engine state
   (`awaiting-acknowledgement`) and an explicit action, never as a timer inside the math engine.
7. **Session-only play.** No accounts, no persistence, no network.
8. **Card-level semantics.** Hidden cards expose no value, a reveal changes once, and a plain-text
   counter reports pairs and moves.

The historical eight-pair content is preserved **only** as the regression fixture
`HISTORICAL_EIGHT_PAIR_FAMILIES` in `tests/fixtures.ts`, asserted by `tests/legacyParity.test.ts`.
It is not a content model, not a curriculum and not a template for GAME-187 lanes.

## What was intentionally replaced

| Historical approach | Modern approach | Reason |
| --- | --- | --- |
| Match decided by equal `pairId` strings | Match decided by canonical `Rational` equality (`rationalEquals`) | `pairId`, labels, geometry and CSS must never determine correctness (GAME-97 binding authority rules) |
| Cards carried display strings as identity | Cards carry an authored `FractionForm` plus a derived canonical `Rational` | `1/2` and `2/4` must stay visually distinct while remaining one mathematical value |
| No rational type; notation was the data | Normalized rational record with safe-integer, positive-denominator and GCD invariants | Exactness, deterministic tests, no floating-point comparison |
| Unseeded `Math.random()` shuffle | Injected 32-bit seed and a deterministic generator | Same seed + config + actions must reproduce identical state |
| Eight hardcoded string pairs | Generic configuration-driven generator (`DeckConfig` + equivalence families) | 4-pair and 8-pair boards from one path; grade lanes arrive later as data (GAME-187) |
| Board state, match rules and resolve timing all inside the React component | Pure engine owns rules; React only projects state and dispatches actions | One authority for correctness; presentation cannot leak into math |
| 500 ms / 900 ms `setTimeout` resolution in the component | Engine exposes `awaiting-acknowledgement` state and an `acknowledge-comparison` action; no timers in the engine | Feedback dwell and motion belong to GAME-190, not to the math engine |
| Next.js client component with LevelBest global CSS | Standalone Vite + React + TypeScript static artifact with `base: "./"` | Games-site static-web release contract; domain-root-independent hosting |
| Board recreated by imperative `reset()` with new randomness | Board recreated from an explicit seed; production entropy sampled in the shell via `crypto.getRandomValues` | Determinism for tests and CI, entropy injected as data |

## What was not copied

- No LevelBest source file, component, hook, utility, test or configuration.
- No LevelBest CSS, class names, layout, spacing, colour or typography.
- No LevelBest copy or microcopy (e.g. the historical "Flip two cards at a time…" line and the
  "Fractions that look different can name the same amount…" paragraph are **not** reused).
- No LevelBest routing, shell, navigation, placement, session or parent-reporting behaviour.
- No LevelBest dependency, tooling or build configuration.
- No asset, image, SVG or font authored in LevelBest.
- The historical eight-pair content is retained **only** as a test regression fixture, not as
  shipped game data. Shipped GAME-185 code contains a neutral, clearly labelled debug fixture that
  GAME-187 will replace.

## Provenance statement

The implementation in this repository was designed from the GAME-97 Epic and GAME-185 story
requirements and the games-site release contract. The historical LevelBest component was read to
understand prior behaviour and to record regression parity; it is **reference/provenance only** and
is not a source of this implementation. `setnessconsulting/game-fraction-match` has no LevelBest
runtime, tooling or code dependency, and its build, tests and CI succeed without LevelBest.

## Related reference (pattern source, not content source)

The standalone repository, toolchain and hosting conventions follow the proven standalone-game
baseline in `setnessconsulting/game-number-line-jumper`:

- repository: `setnessconsulting/game-number-line-jumper`;
- `main` at the time of GAME-185 implementation: `47a05480d7c32cee8f0991d6f6c0410be90d678e`;
- conventions reused: Node 24, pinned `package-lock.json`, React 19 + Vite + TypeScript + Vitest +
  Playwright, ESLint flat config, relative `base: "./"` build, Playwright console/error gate, and
  the `mulberry32` deterministic generator (`src/lib/games/shared/rng.ts`).

Hosting contract reference: `setnessconsulting/games-site` →
`docs/game-release-contract.md` (static-web artifacts are served from a versioned nested prefix such
as `fraction-match/<version>/index.html`, never from the domain root).
