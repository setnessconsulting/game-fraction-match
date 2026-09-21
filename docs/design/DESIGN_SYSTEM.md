# Design system (GAME-188)

> ## FALLBACK / FIGMA NOT QUALIFIED
>
> This checked-in specification is the **design authority for Fraction Match**.
>
> The story's preferred authority is a persistent Figma `fileKey` with implementation-ready frames and
> components. **No such file exists for this project, and none is claimed.** No credential able to create one
> is available in the development environment, and the Figma REST API cannot author frames or components —
> that requires the Figma Plugin API, which runs inside Figma's own application. Producing a `fileKey` here
> would therefore mean fabricating design evidence, which this story explicitly forbids.
>
> The story permits this fallback, and its acceptance criteria are explicit that
> *"missing Figma capability does not block implementation when the fallback is complete, but final evidence
> remains truthfully unqualified for Figma."* That is exactly the state recorded here.
>
> **To lift the label:** create a Figma file for Fraction Match, then record its `fileKey` here and in
> `src/design/index.ts`. The frame and component inventory to build in it is the state list below — it is
> already implementation-ready, which is what makes the migration a mechanical one.

## 1. What this layer is

The design layer lives in `src/design/` and its only public surface is `src/design/index.ts`. It is an
authority about **appearance** — and nothing else:

| Authority | Owns |
| --- | --- |
| the engine (`src/engine`) | which values are dealt, whether two values are equal, what is matched |
| the representations (`src/representations`) | whether a picture is legible at a given box |
| the lanes (`src/lanes`) | content: catalogues, policies, wholes, mixes, adaptation |
| **the design layer (`src/design`)** | sizes, surfaces, states, motion and the responsive contract |

It imports **nothing at all** — not the engine, not the representations, not the lanes, and no package.
`npm run check:design` (part of `npm run check:architecture`, so `npm run verify`) fails the build if it tries.
That purity is not tidiness for its own sake: it is why `planBoardLayout` can answer *"does a 16-card board fit
a 320×568 phone?"* in plain Node, which is the claim this story is really making.

## 2. The required state inventory

24 designed states cover the story's 18 required bullets. The inventory is **data**
(`src/design/states.ts`), not prose, so "every required state is designed" is a test rather than an assertion,
and the rendered panel lists every entry.

| # | Story bullet | Designed state | Implementation hook |
| --- | --- | --- | --- |
| 1 | grade setup | Grade setup | `data-screen="grade-setup"` |
| 2 | instruction state | Instruction | `data-screen="instruction"` |
| 3 | 4-pair/8-card all-faces-visible warm-up | Warm-up board | `data-screen="warm-up"` |
| 4 | 8-pair/16-card production board | Production board | `data-screen="production-board"` |
| 5 | hidden / hover / focus / pressed / selected / comparing / matched / explaining | Card: hidden | `data-card-state="hidden"` |
| 5 | | Card: selected | `data-card-state="revealed"` |
| 5 | | Card: comparing | `data-comparison="pending"` |
| 5 | | Card: matched | `data-card-state="matched"` |
| 5 | | Card: explaining | `data-feedback="explaining"` |
| 6 | every GAME-186 representation family | Representation families | `data-family="symbolic\|bar\|circle\|set\|number-line"` |
| 7 | equivalent-match | Equivalent match | `data-feedback="match"` |
| 7 | mismatch/recovery | Mismatch and recovery | `data-feedback="mismatch"` |
| 8 | shared comparison strip | Comparison strip | `data-component="comparison-strip"` |
| 9 | calm render/error surface | Calm recovery | `data-screen="calm-recovery"` |
| 10 | moves/pairs progress | Progress | `data-component="progress"` |
| 11 | end-session confirmation | End-session confirmation | `data-screen="end-session-confirm"` |
| 12 | completion/session summary | Session summary | `data-screen="session-summary"` |
| 13 | replay action | Replay | `data-action="replay"` |
| 13 | change-grade / setup action | Change grade | `data-action="change-grade"` |
| 14 | phone/tablet/desktop layouts | Layout classes | `data-layout="phone\|tablet\|desktop"` |
| 15 | keyboard/focus states | Keyboard focus | `data-focus-ring="visible"` |
| 16 | forced-colors/high-contrast treatment | Forced colors | `data-media="forced-colors"` |
| 17 | reduced-motion variants | Reduced motion | `data-media="reduced-motion"` |
| 18 | bounded celebration | Celebration | `data-feedback="celebration"` |

### Names are the interface

Where a state is the engine's own fact, the design uses the engine's own vocabulary. The engine's `CardState`
is `"hidden" | "revealed" | "matched"`; the design reads `revealed` as *selected* because that is what it means
to the learner, and it does not invent a parallel set of words. `tests/designSystem.test.ts` drives a real board
until all three engine states have actually been observed and then requires that the design declares all three,
so a new engine state cannot ship undesigned.

### Distinguishable without colour

The five states the story names must be readable with no hue at all. Colour is never the channel that carries
them:

| State | Boundary | Other non-colour affordances |
| --- | --- | --- |
| hidden | **dashed, 1px** | no value in the DOM at all; back-of-card marker glyph |
| selected | solid, 2px | solid emphasized boundary, corner marker, raised surface |
| comparing | solid, 2px + board-level bracket | both cards joined by a comparison bracket; a third card may not appear |
| matched | **solid, 3px** (thickest) | closed pair seam; matched marker glyph |
| explaining | unchanged | inline explanation slot reserved *below* the pair |

`tests/e2e/designSystem.spec.ts` measures the rendered boundary style and width of the hidden / selected /
matched samples and asserts the triples are pairwise distinct with colour stripped out entirely — and then
re-measures under `forced-colors: active` to prove the same three boundaries survive.

## 3. Tokens

Tokens are declared twice on purpose: `src/app/globals.css` holds what the browser paints, and
`src/design/tokens.ts` holds what the layer reasons about. CSS cannot import TypeScript, so the honest
arrangement is two declarations plus a test that fails if they drift — the same arrangement the representation
layer already uses for its contrast pair. A test parses both and compares every token in both themes.

### Inherited, not redesigned

`--fm-text` and `--fm-surface` are the pair GAME-186's **3:1 division-line contrast floor** was measured
against, and `MIN_LEGIBLE_CARD_CSS_PX` (68px) is the box its legibility floors were measured at. GAME-188
restates them verbatim and holds itself to them. Moving either would silently invalidate a measurement another
story proved, so the test pins them against `DIVISION_LINE_TOKENS` in the representation layer.

### Declared contrast floors

| Pair | Floor | Why |
| --- | --- | --- |
| `text` on `surface` / `background` / `surfaceRaised` | 4.5:1 | body text (WCAG 2.2 AA 1.4.3) |
| `muted` on `surface` | 4.5:1 | secondary and debug text |
| `focusRing` on `surface`, `background`, `surfaceSunken`, `surfaceRaised` | 3:1 | the focus indicator must be findable on every surface a focused control can sit on |
| `borderStrong` on `surface`, `surfaceRaised` | 3:1 | a boundary that carries meaning (WCAG 2.2 AA 1.4.11) |
| `inkMatched`, `inkMismatch` on `surface` | 4.5:1 | these inks label a relationship, so they must be readable |

The focus ring is deliberately **not** `accent`: a ring that matched the accent would vanish on accent-filled
surfaces. Every one of these ratios is computed and asserted in `tests/designSystem.test.ts`.

## 4. The responsive contract

### Base viewports

`320×568`, `390×844`, `768×1024`, `1280×800`. Layout class is derived from width (`<600` phone, `<1024`
tablet, else desktop) by a pure function rather than guessed from a media query.

### At 100% zoom

- the active 16-card production board **fits all cards simultaneously**;
- **no internal board scrolling** (`scrollHeight ≤ clientHeight` on the board itself);
- every interactive card target is **at least 44×44 CSS px**;
- a card carrying a representation is **at least 68×68 CSS px** — the GAME-186 legibility floor. The design
  contract is the stricter of the two, because a card that is legible also happens to be tappable;
- HUD and feedback may be compact but may not obscure cards: the planner subtracts a per-class HUD reserve
  before the board is allowed to claim height.

The planned board is therefore:

| Viewport | Columns × rows | Card | Board | Fits |
| --- | --- | --- | --- | --- |
| 320×568 | 4 × 4 | **68px** (the floor) | 284×284 | no scrolling |
| 390×844 | 4 × 4 | 86px | 356×356 | no scrolling |
| 768×1024 | 4 × 4 | 112px (capped) | 460×460 | no scrolling |
| 1280×800 | 4 × 4 | 112px (capped) | 460×460 | no scrolling |

**The gap and the chrome are derived, not chosen.** On a 320px-wide phone the board needs
4 × 68 = 272px of cards plus three 4px gaps = 284px, which leaves 320 − 284 = 36px for chrome — 18px per side.
`BOARD_CHROME_CSS_PX` is 17px per side (8px page padding + 8px panel padding + 1px panel border), so the
planned card lands at exactly the 68px GAME-186 floor. There is 2px of slack in the whole smallest viewport;
a wider gap or a heavier panel would put the cards under the floor. `tests/designResponsive.test.ts` asserts
those budgets directly, and `tests/e2e/designSystem.spec.ts` measures the rendered board, so the regression
surfaces before it ships.

That 1px border is worth recording: the first version of this model omitted it, and the browser test caught the
board overflowing its container by exactly 1px per side. The plan and the painted stylesheet are two
declarations of the same chrome, and only a measurement on the real element can prove they agree.

### At 200% zoom / reflow

- **vertical page scrolling is allowed**;
- **horizontal content loss or overlap is prohibited** at every zoom level — this is asserted as an invariant
  across all viewports × zooms × board sizes, not as a spot check;
- all cards and controls remain reachable in logical order.

The board reflows to fewer columns rather than being clipped: `planBoardLayout` is asked for the zoomed
viewport, reduces columns until a card clears the floor, and reports `requiresPageScroll` instead of pretending
the board still fits. At 320×568 @ 200% it plans a 2-column board with 70px cards.

`tests/e2e/designSystem.spec.ts` then measures the *rendered* board at every base viewport and asserts the
card size equals what `planBoardLayout` planned, that no internal or document-level horizontal overflow
exists, and that the halved content viewport (200% zoom) reflows without losing a card.

### A note on 200% zoom emulation

The browser test emulates 200% zoom as the **halved content viewport**: the same physical window showing half
the CSS pixels. That is the dimension the reflow contract is about, and it is stated here rather than implied.
A real browser zoom setting and a halved viewport are not identical in every respect (device pixel ratio and
font rasterisation differ), so this is recorded as an emulation, not as a claim about a specific browser build.

## 5. Motion

Motion is **presentation only**. That is structural, not stylistic, and it is enforced in two places:

- GAME-186's primitives may not carry any motion at all — `transition: none` and `animation: none` are the
  only permitted values in the representation stylesheet, so geometry a legibility floor measured can never be
  moving while it is measured;
- `motionPlanFor(kind, "reduced")` returns **zero duration, no movement, and a byte-identical `outcome`** to
  the full variant, so a reduced-motion session is the same product with a different rendering.

| Motion | Duration | Movement | Non-motion fallback (identical in both preferences) |
| --- | --- | --- | --- |
| reveal | 220ms | flip3d | the card face changes in place with no rotation |
| selection | 120ms | scale | the selection marker and boundary weight appear immediately |
| comparison | 200ms | translation | both cards sit on the shared comparison strip at once |
| match confirmation | 260ms | scale | the matched glyph and shared-value statement appear at once |
| mismatch recovery | 320ms | translation | both cards remain visible for the inspection window, then clear together |
| celebration | 2400ms, **skippable** | scale, translation | a static completion state with the session facts already on screen |

Bounds, asserted rather than documented:

- **celebration ≤ 2500ms** and **skippable within 1000ms**; it changes no game state, and the completion state
  is on screen *before* it starts, so skipping costs nothing;
- every other transition ≤ 400ms;
- no motion carries unique information: each declares the fallback that carries the same meaning;
- nothing rushes GAME-190's **1.2s minimum mismatch inspection** — motion cannot shorten a contract it does not
  own.

## 6. Accessibility variants

- **Forced colors** — stated explicitly rather than left to the user agent. Boundaries are kept by
  `border-width` and `border-style`, system colours replace the palette, and the five states stay five states
  with no hue in play.
- **Focus** — an outline (`3px`, offset `2px`) using `--fm-focus-ring`, chosen and tested to be visible on
  every surface. Focus is never a colour change alone.
- **Reduced motion** — identical state and feedback, zero duration, no transform. Verified by comparing the
  rendered state signatures before and after the preference changes.
- **No precision tapping** — the smallest planned interactive target is 68px, well above the 44px floor.
- **No colour-only state** — see §2.

## 7. Originality

No comparator imagery, layout or branding is used or referenced anywhere in this design. The design is derived
from the game's own content model (one declared whole, five representation families, a pairs board) rather than
from a competitor's screen. GAME-193 owns the formal comparator benchmark and IP review; this section records
only that nothing was copied to get here.

## 8. What GAME-188 does not claim

- **No Figma authority.** See the label at the top. The fallback is complete; the Figma provenance is absent.
- **No board implementation.** GAME-189 builds the semantic board. The reference surface in
  `src/app/DesignPanel.tsx` exists so the design contract is *measurable* in a browser, not to be the game.
- **No explanatory copy.** The explanation slot is reserved; GAME-190 owns what goes in it.
- **No session behaviour.** GAME-191 owns session bounds, the summary and the replay arc.
- **No final accessibility qualification.** GAME-192 owns keyboard, touch, screen-reader, zoom and
  forced-colors qualification. What is here is the starting surface, already constrained to make that pass
  achievable.
- **No cross-engine proof.** Only Chromium is exercised, matching the rest of the repository.
- **Page-level 200% zoom is not qualified here.** At the halved content viewport the *board and its panel*
  reflow without horizontal loss, and that is what the browser test asserts. The page as a whole still scrolls
  horizontally at that width, because the GAME-186 gallery and GAME-187 lane panel render cards at the fixed
  boxes they were qualified at (68px and 96px) and must not shrink — shrinking a fraction until it cannot be
  read is the exact failure GAME-186 exists to prevent. GAME-189 owns the real page composition and GAME-192
  owns the zoom qualification.
- **No arcade card art.** The story asks for catalog art and copy to be production-ready — no art exists yet,
  and inventing placeholder art would pre-empt GAME-194's promotion review. This is recorded as outstanding
  rather than quietly omitted, and GAME-335's temporary coming-soon asset covers the gap.
