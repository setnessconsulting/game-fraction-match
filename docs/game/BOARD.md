# Board and shell contract (GAME-189)

The playable surface is `src/game/`, and it is reached from the root of the artifact. The debug shell that each
earlier story qualified its artefact in lives behind `#debug`, so what ships is the product rather than a gallery.

## 1. The authority rule, made structural

**React renders engine state and emits typed intents. It never computes equivalence or matched state.**

That is not a convention here, it is a split: `src/game/session.ts` holds every decision the shell makes — which
lane a grade plays, what the warm-up is, what each intent does — and it contains no React. `Board.tsx` renders
that value and asks the engine for facts:

| Question | Asked of |
| --- | --- |
| how does this card project? | `cardStateOf` |
| may this card be picked? | `isCardSelectable` |
| how many pairs are left? | `remainingPairCount` |
| is the board finished? | `isGameComplete` |
| what happens if the learner picks this? | `applyAction`, behind `applyIntent` |

Nothing in the shell re-derives any of it, and nothing decides a match. The unit tests drive real boards by
reading the engine's own `canonical` pair rather than by implementing a second equivalence check.

**Nothing advances on a timer.** There is no `setTimeout`, no animation callback and no transport that can move
the game forward; every transition comes from an intent, and an intent comes from a learner action.

## 2. Content comes from the reviewed map

`productionLaneFor(gradeBand)` picks the **largest board the grade's own published lanes deal**, from
`curriculumLanes()` — the reviewed map, not the neutral fixtures in `src/app/laneFixtures.ts`. Ties fall to the
map's order, so the choice is deterministic and the map stays the authority on what a grade plays.

| Grade | Production lane | Board |
| --- | --- | --- |
| 3 | `g3-equivalent-fractions-halves-to-eighths` | 4 pairs / 8 cards |
| 4 | `g4-equivalent-fractions-full-catalogue` | 8 pairs / 16 cards |
| 5 | `g5-review-lower-scaffolding` | 8 pairs / 16 cards |

**Grade 3 deals 8 cards, not 16**, because that is what its reviewed catalogue publishes. The shell does not
inflate a grade's content to reach a board size — the board shape follows the content, not the other way round.
The 16-card production board is what grades 4 and 5 deal.

### The warm-up is the same lane, re-dealt smaller

`warmUpLaneFor` lowers `pairCount` to `WARM_UP_PAIR_COUNT` and changes nothing else: same catalogue, same
representation mix, same wholes, same card box, same scaffolding. Lowering is safe where raising would not be —
a lane that can supply eight pairs can supply four — and `warmUpLaneProblems` reports a lane that cannot supply a
warm-up instead of quietly dealing something else. This is what "the warm-up and the production board share one
engine/action path with only configuration differences" means in code.

The warm-up differs in exactly one rendering respect: every face is showing. That is a *display* decision and
nothing more — the engine still decides visibility and legality, so a visible face is a face the learner may look
at, never a face the shell pretends is selected.

## 3. The card size is not the design's to choose

**Each card is drawn at the box its lane was qualified at, and the grid reflows its columns around that size.**

A lane's `cardBox` is the box GAME-186's legibility floors were measured at and GAME-187's coverage proof was
made against. Shrinking the picture to fit a phone would silently invalidate that proof: the families were chosen
by measuring geometry at that box, and a smaller box is a different measurement. So the board pins the size
(`planBoardLayout({ fixedCardCssPx: lane.cardBox.width })`) and only the column count is responsive.

### Recorded conflict: this does not satisfy GAME-188's "fits at every base viewport"

GAME-188 established that a 16-card board fits a 320×568 phone at 100% zoom with no internal scrolling, with cards
at or above the 68px floor. That was proved with the design's own minimum card size.

A **16-card board at the qualified 96px box needs at least 396px of width** (4 × 96 + 3 × 4), and 396px of height.
The 320×568 and 390×844 base viewports cannot host it at the qualified size, so on those viewports the page
scrolls vertically and the *whole active board is not simultaneously visible*. On 768×1024 and 1280×800 it fits.

The two contracts cannot both hold, and neither is wrong:

- shrinking the card to 68px would satisfy GAME-188's fit table and break GAME-187's coverage proof;
- pinning the card at 96px keeps every legibility proof intact and means a phone scrolls.

This change takes the second, because a legibility proof is a measurement and a fit table is a layout, and it is
recorded here rather than resolved silently. **It needs an owner decision before GAME-194 promotes anything**:
either the qualified card box becomes viewport-dependent (which means re-qualifying coverage at that box, a
GAME-186/187 content change), or the phone boards scroll by design (a GAME-188/189 layout change).

The horizontal invariant holds everywhere regardless: the board never overflows its own container at any
viewport or zoom.

## 4. Focus is derived, then handed over

`src/game/focus.ts` is the model: a **roving tabindex** where exactly one card is in the tab order, arrow keys move
geometrically (no wrapping), Home and End jump within the row, and the anchor is computed from engine state —
first card the engine still lets you pick, then first unmatched, then the first card.

The component remembers where focus actually went and reconciles: when the engine moves underneath (a card
matches), a card that is no longer playable cannot keep `tabIndex === 0`, so focus returns to the engine's anchor.
Columns come from the layout plan, so a reflowed board moves focus in the shape the learner can see.

## 5. Hidden values never reach the DOM

On a production board a hidden card renders no value, no family, no fraction attribute and no SVG: its accessible
name is exactly `Hidden card`. `valueVisibilityFor` answers value-visibility and label-visibility as two separate
questions, because they are different: the warm-up shows every value, while a lane's `labelVisibility` may still
withhold the printed label (`on-reveal`) or never print it (`never`).

`tests/e2e/gameBoard.spec.ts` asserts the discipline on the rendered production board: every card `hidden`, every
`data-value-visible="false"`, no `data-fraction`, no `<svg>`, and no fraction-shaped text anywhere in the board.

## 6. The host boundary

The game never navigates its host. No `window.parent`, no top-level route, no `postMessage`, no network, no
storage — the games-site play toolbar owns the way back to the arcade and fullscreen, and **ending a session
returns to this game's own setup**. `scripts/lib/guardRules.mjs` enforces the first two over repository source and
`check:privacy` enforces the rest; a browser journey asserts the URL is unchanged after ending a session.

## 7. The recovery seam

A render failure must reach a calm surface rather than a stack trace, and the only way to *qualify* that is to
cause one. `#board-error-qualification` makes the board throw, and `BoardErrorBoundary` renders the recovery
surface: plain language, one real action, no exception text. The trigger is an exact hash, inert otherwise, and it
exists so the browser journey can assert the recovery path instead of asserting that the code looks right.

The repository-wide console-error gate stays strict: the one journey that causes a failure declares the exact
patterns it expects, next to the failure, and an **uncaught** error is fatal in every journey.

## 8. What this story does not claim

- **Not the GAME-335 iframe host boundary.** GAME-335 is in Ready, not Done: the games-site coming-soon routes and
  the preview-only static-web host contract are its work and are not touched here. The game builds and runs from a
  versioned asset base (a nested journey proves it), but "runs correctly inside the GAME-335 static-web iframe
  fixture" is **not yet demonstrated**.
- **No explanatory feedback.** The mismatch surface states the fact in one short line and offers an explicit
  continue. GAME-190 owns the equality explanation, the comparator classifier, the copy register and the 1.2s
  inspection window; motion here is limited to CSS transitions that carry no information.
- **No session bounds or summary.** There is no soft or hard cap, no idle panel and no factual summary. GAME-191
  owns those, and ending a session returns to setup.
- **No accessibility qualification.** GAME-192 owns keyboard, touch, screen-reader, zoom/reflow, forced-colors and
  reduced-motion qualification. What is here is the starting surface: one bounded live region per outcome, an
  explicit continue, a focus model, and accessible names that use the authored value.
- **No forced-colors or reduced-motion board treatment of its own** beyond what GAME-188's card styles already
  declare.
- **Cross-engine scope is the board only.** Chromium, Firefox and mobile WebKit run the board journey. The
  representation, lane and design qualifications remain Chromium-only by their own recorded limitation, and
  promoting them is GAME-192's work rather than a configuration change.
