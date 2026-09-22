# Accessibility qualification (GAME-192)

The qualification record for the finished standalone game. Every row states what was actually done and where the
evidence lives. **Nothing here is inferred**: a check that has not been performed says so.

- **Candidate:** `main` at the merge of PR #9 (this change).
- **Automated evidence:** `tests/e2e/gameAccessibility.spec.ts`, `tests/e2e/gameFeedback.spec.ts`,
  `tests/gameFocus.test.ts`, `tests/gameFeedback.test.ts`.
- **Engines:** the game journeys run on desktop Chromium, desktop Firefox and mobile WebKit. The accessibility
  qualification spec runs on Chromium; the cross-engine functional matrix belongs to GAME-194.

## The defect this story found

**Selecting a card used to destroy a keyboard user's focus.** Cards carried `disabled` when the engine would refuse
them — which is the case for the card that was just revealed — and a disabled element cannot hold focus, so the
browser dropped focus to `<body>` the instant a keyboard user activated a card. The arrow keys then arrived
nowhere: a keyboard-only learner could reveal the first card and could not reach a second.

Cards now carry **`aria-disabled`** instead. The engine is still what refuses an illegal selection — that refusal is
asserted directly by dispatching a click that reaches the handler — so the attribute is a *statement* about
legality rather than the mechanism guarding it. The card stays focusable and inspectable, and
`resolves a pair by keyboard alone, without losing focus on the first selection` is a permanent regression check.

Two notes recorded honestly:

1. The first fix attempt (re-focusing the engine's anchor when focus was destroyed) was rejected, and the story was
   recorded as blocked — but that conclusion was drawn from runs against a **stale `dist/`**, because
   `npx playwright test` serves the existing build rather than rebuilding it. The conclusion was invalid, not the
   fix. The `aria-disabled` approach is the one that shipped, verified against a fresh build.
2. The lesson is in the repository's own tooling: `npm run test:e2e` builds first. Ad-hoc `npx playwright test`
   runs must be preceded by `npm run build`.

## Per-check record

| Required check | Status | Evidence |
| --- | --- | --- |
| semantic interactive cards | **performed** | cards are real `<button>` elements; axe finds nothing serious in any state |
| roving keyboard navigation | **performed** | exactly one card in the tab order; arrows move geometrically within the rendered grid; Home/End stay in the row — `tests/gameFocus.test.ts`, and the roving check in the qualification spec |
| matched-card focus behaviour | **performed** | the anchor never rests on a matched or otherwise unplayable card, and it is asserted to be `aria-disabled="false"` after the engine moves |
| hidden-value leakage sweep | **performed** | a hidden card renders no value, family, fraction attribute or SVG, and its accessible name is exactly `Hidden card` |
| bounded live announcements | **performed** | one polite live region, whose text is a pure function of board state — it cannot repeat and cannot be queued behind an intermediate message |
| pointer/touch/keyboard parity | **performed** | the same pair is played three ways on one board (reset between runs) and must reach an identical state signature |
| touch-target measurement | **performed** | every visible control measured at ≥ 44×44 CSS px, and cards ≥ 96 px because they are drawn at the box their lane was qualified at |
| base-viewport board fit | **performed** | the board deals the largest number of pairs that fits the qualified card box, so the whole active board is visible |
| 200% zoom / reflow | **performed** | at the halved content viewport the shell, board and document all fit horizontally, and no card is clipped |
| forced colors | **performed** | states remain distinguishable by boundary weight and style with the palette replaced, and axe is clean under `forced-colors: active` |
| reduced-motion parity | **performed** | identical result, matched set and explanatory text, with the decoration removed — and the inspection window is deliberately *not* shortened |
| automated axe checks | **performed** | five required states: grade setup, instruction, board, comparing/mismatch-or-match, and summary |
| manual assistive-technology evidence (NVDA) | **PENDING — not performed** | no NVDA run has happened. It needs a Windows screen reader and a human listener, and inferring it from automated output would be a fabricated result |
| manual assistive-technology evidence (VoiceOver) | **PENDING — not performed** | as above, on macOS/iOS |
| real OS high-contrast / reduced-motion settings | **pending** | forced colors and reduced motion are verified through Chromium emulation, not a real OS setting — the same recorded limitation as GAME-186's and GAME-188's journeys |
| real touch device | **pending** | touch input is exercised through WebKit's touch emulation on a phone viewport, not on physical hardware |

## What is claimed, and what is not

**Claimed.** Every essential pointer action has a keyboard and a touch equivalent; hidden cards disclose nothing
through the DOM or the accessibility tree; the roving anchor always rests on a playable card; each outcome is
announced once through one bounded path; no state relies on colour alone and forced colors remains usable; reduced
motion produces identical outcomes and feedback; 200% zoom loses no content horizontally; every control clears the
minimum touch target; axe finds nothing serious or critical in any required state; and no observability or
network dependency was introduced to gather any of it.

**Not claimed.** This is not a screen-reader qualification: **NVDA and VoiceOver have not been run.** It is not a
real high-contrast or real reduced-motion qualification, because those are emulated. It is not a physical-device
touch qualification. Each of those is listed as pending above rather than folded into a pass.

That gap is the honest state of the story: the automated surface is qualified, the human-assistive surface is not,
and the remaining work needs a person with a screen reader rather than another automated run.
