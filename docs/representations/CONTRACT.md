# Representation contract (GAME-186)

Status: implemented. Owner of the five representation families, the declared-whole rules, the legibility
policy and the accessible naming of a representation. Consumers: GAME-187 (lanes), GAME-188 (design),
GAME-189 (board), GAME-190 (feedback), GAME-192 (qualification).

The layer lives in `src/representations/` and its only public surface is `src/representations/index.ts`.

## 1. Where it sits

```text
src/engine/          mathematics (authority): canonical rationals, authored forms, deck, state machine
src/representations/ pictures: geometry, notation, wholes, legibility, React/SVG primitives
src/app/             the shell and the GAME-186 gallery that consumes the primitives
```

- The engine is the only mathematical authority. This layer never reduces, compares, repairs or
  re-derives a value; it reads `numerator`, `denominator` and the engine-supplied `canonical` pair as
  data.
- The layer imports **no engine module at all**, not even for a type: the input contract is structural,
  so an engine `FractionForm` can be passed straight in. That keeps the dependency one way and lets the
  whole layer move into a shared package later without moving authority.
- Geometry is a one-way projection. Nothing in the DOM, the SVG or the CSS can feed anything back into
  correctness.

`npm run check:representations` (part of `npm run check:architecture`) fails the build if the layer
imports engine code, imports anything outside itself except React, or carries ambient state, and if the
stylesheet loses any of the invariants in section 6.

## 2. What a primitive takes

```ts
type FractionValue = { numerator: number; denominator: number; canonical: { numerator: number; denominator: number } };
type RepresentationBox = { width: number; height: number };   // CSS px
type RepresentationFamily = "symbolic" | "bar" | "circle" | "set" | "number-line";
```

Components take `{ fraction, whole, box?, fluid?, className? }`. `whole` is **required**: a picture
without a declared whole cannot take part in an honest comparison, so the type system makes that mistake
impossible rather than documenting it away. `box` defaults to the family's nominal size
(`NOMINAL_BOXES`); geometry is authored *at the intended rendered size*, so one SVG user unit is one CSS
pixel when the default box is used.

The frame is shared by every family (`RepresentationFrame`):

- one `<svg role="img">` per representation, named by the canonical formatter;
- a visually hidden, `aria-hidden` text alternative carrying `n/d` (and `= canonical` when the authored
  form is reducible) so copy/paste and screenshots keep the exact notation;
- `data-*` facts (`data-family`, `data-numerator`, `data-denominator`, `data-canonical`, `data-whole-id`,
  `data-whole-kind`, `data-box`) so fixtures and guards can assert the projection instead of the geometry;
- `data-fill="filled" | "empty"` on every part, so the shaded quantity is data rather than a colour.

## 3. Declared wholes

A visual comparison is only meaningful when both sides declare the **same** whole. Three kinds exist:

| Kind | Constructed by | What must match between two sides |
| --- | --- | --- |
| `continuous-whole` | `continuousWhole()` | `wholeId` |
| `discrete-set` | `discreteSetWhole({ totalObjectCount })` | `wholeId` **and** `totalObjectCount` |
| `number-line-axis` | `numberLineWhole({ axis: numberLineAxis({ ticksPerUnit }) })` | `wholeId`, `domainStart`, `domainEnd`, `ticksPerUnit` |

Rules:

- A **set** model divides its collection exactly: `totalObjectCount % denominator === 0`. It also shows
  parts of *one* collection, so a value at or above one whole has no set picture at all and is refused
  rather than rescaled.
- A **number line** must share one scale: `ticksPerUnit % denominator === 0`, so the point lands on a
  real tick instead of a rounding artefact, and the value must sit inside the declared domain.
- `1/2` and `2/4` on one eight-part axis both land on tick 4, which is what makes "same place" true
  rather than "looks similar".

The comparison matrix (`comparisonRuleFor`) is enforced by `planRepresentationComparison` /
`requireComparisonPlan`:

| Pair | Rule | Drawn |
| --- | --- | --- |
| `symbolic` with anything | `shared-whole` | enabled — a symbol states the visual whole in words |
| `bar`/`circle` with `bar`/`circle` | `shared-whole` | enabled |
| `set` with `set` | `shared-set-total` | enabled only with one identity and one total |
| `number-line` with `number-line` | `shared-axis` | enabled only on one axis |
| anything else (`bar` vs `set`, `circle` vs `number-line`, ...) | none | **refused** — throws `RepresentationContractError` |

## 4. Legibility policy

GAME-97's rule is that a lane must choose another allowed representation rather than shrink a fraction
until it cannot be read. `src/representations/legibility.ts` is the mechanism.

| Floor | Value | Measured as |
| --- | --- | --- |
| Partition region | 8 × 8 CSS px | clear region after the divider takes its share (bar cell, wedge arc × radial depth, object diameter) |
| Division line | 2 CSS px | thickness of every divider/baseline/tick/rule |
| Division-line contrast | 3:1 | WCAG contrast of `--fm-text` against `--fm-surface`, in every declared theme |
| Tick spacing | 6 CSS px | distance between adjacent ticks |
| Tick label spacing | ≥ 14 CSS px, or the widest label + 2 px | thinned labels, measured against real label estimates and verified against rendered text in the browser |
| Tick labels | ≥ 2 | a line with one label cannot be read as a scale |
| Symbol glyph height | 10 CSS px | font size the symbolic digits are rendered at |

APIs:

- `evaluateLegibility(request)` → verdict with the measurements, the contrast ratio and every problem,
  each one naming the measured value and the floor it missed.
- `selectLegibleRepresentation(candidates, request)` → first legible candidate in the lane's declared
  order, plus every rejection that came before it. Total for legibility: a picture too small to read is a
  rejection, never an error.
- `requireLegibleRepresentation(...)` → the same, throwing `RepresentationLegibilityError` with all
  problems attached.
- `legibilityReport(request)` → a per-family diagnosis for fixtures and tooling.

Two failure modes are deliberately different:

- **A soft rejection** is a rendering choice: the family is too small to read *here*, so the lane tries
  the next one.
- **A loud error** is a lane configuration mistake: a whole of the wrong kind for the family, a value at
  or above one whole in a set model, or a comparison pair with no shared-whole definition. These throw,
  because silently dropping them would let a lane ship a picture that lies about the quantity.

## 5. Accessibility and colour

- One accessible name per representation, produced by the single canonical formatter
  (`src/representations/notation.ts`): what the representation is, the quantity in words, the authored
  `n/d`, the stated equivalence when the form is reducible, and the declared whole. `2/4` is always
  announced as *two fourths* and never reduced to *one half*.
- No output of the formatter contains a vulgar-fraction glyph (`½`, `⁄`, ...). The authored form is always
  ASCII `n/d` plus a spoken name, so text stays greppable, screen-reader friendly and copy/pasteable.
- Ink only: filled parts are solid `currentColor`, empty parts are outlines. Colour never carries
  quantity, so forced colors, high contrast and greyscale all preserve the shaded amount.
- The primitives are static by construction. The stylesheet declares no `transform`, no `transition`
  other than `none`, no `animation` other than `none`, and no `font-size` for the selectors whose size is
  owned by geometry (`.fm-symbol__digit`, `.fm-number-line__label`). `@media (forced-colors: active)` and
  `@media (prefers-reduced-motion: reduce)` blocks state both promises explicitly.

## 6. Invariants enforced automatically

| Invariant | Enforced by |
| --- | --- |
| No engine import, self-contained, no ambient state in `src/representations` | `scripts/check-representation-isolation.mjs` + ESLint (`src/representations/**`) |
| No `transform`, motion other than `none`, locked `font-size`, required forced-colors/reduced-motion/hidden-text blocks | same guard, over the stylesheet text |
| Geometry, notation, whole and legibility behaviour | `tests/representation*.test.ts` (unit and property sweeps) |
| Component markup, accessible names and refusals | `tests/representationComponents.test.tsx` (server-rendered, no DOM) |
| Palette and card size still match the qualified values | `tests/representationIsolation.test.ts` parses `src/app/globals.css` |
| Floors, contrast, forced colors, reduced motion, 320 px reflow, real label spacing, axe | `tests/e2e/representationGallery.spec.ts` |
| Coverage thresholds (90% per file, lines/branches/functions) | `npm run test:coverage` includes `src/representations/**` |

## 7. Seams for downstream stories

- **GAME-187** supplies lanes as data: the allowed candidate order, `maxPartitionCount` per candidate, the
  declared whole per family, and the card box. It consumes `selectLegibleRepresentation` /
  `requireLegibleRepresentation` and must not add a second mathematics implementation.
- **GAME-188** owns card layout, colour, motion and states. The layer deliberately ships no design tokens
  beyond the ink rules; a redesign may replace card chrome, but the floors, the stamp sizes and the
  `data-*` facts are the contract this layer keeps.
- **GAME-189** renders the board and never compares fractions itself.
- **GAME-192** owns final accessibility and device qualification. The accessible names, the hidden text
  alternative and the forced-colors/reduced-motion blocks here are its starting surface.

## 8. What GAME-186 does not claim

- Only Chromium is exercised (`npm run test:e2e`), so cross-engine and screen-reader behaviour is
  unproven here; axe is run as a smoke check on the gallery subtree, not as a qualification.
- Forced-colors and reduced-motion checks use Chromium's emulation, not real high-contrast OS settings.
- The gallery fixture uses a small debug value list; it is not a lane, not curriculum and carries no
  standards claim.
- Circle geometry measures a wedge by its outer arc and radial depth. That is a legibility model, not a
  proof that a wedge is readable at every angle.
