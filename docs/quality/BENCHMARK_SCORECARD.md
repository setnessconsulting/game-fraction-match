# Benchmark scorecard (GAME-193)

The explicit, reproducible quality gate for Fraction Match, evaluated against one exact candidate.

> **This scorecard is the only release gate.** There is no hidden comparator, no second scorecard and no
> undocumented criterion. If a row is Below, it is Below here.

## Candidate

| | |
| --- | --- |
| Repository | `setnessconsulting/game-fraction-match` |
| Candidate commit | `2f0610b55069901994832ad719a136c5f1b08cca`, evaluated as `main`; the artifact is unchanged by the follow-up cleanup in PR #11, which only removed a stray build log and added a `.gitignore` rule � neither is part of the build |
| Version | `0.1.0` (package version; no release tag exists yet — tagging belongs to GAME-194) |
| Build | `vite build`, production: `index-*.js` 320.98 KB raw / **94.45 KB gzip**, `index-*.css` 10.79 KB raw / 2.65 KB gzip |
| Automated evidence | 36 unit files / **586 tests**; **101 browser tests** across desktop Chromium, desktop Firefox and mobile WebKit; 4 nested host tests |

## Measurement provenance

Every numeric claim below states where it came from, because a number without an origin is not evidence.

| Measurement | Origin |
| --- | --- |
| bundle size | `npm run build` output on the candidate commit, gzip column reported by Vite 8.3.0 |
| unit tests | `npm test` (vitest 4.1.11), 36 files, 586 tests |
| browser tests | `npm run test:e2e` (Playwright 1.62.1), projects: Chromium 141 desktop 1280×800, Firefox desktop 1280×800, mobile WebKit on an iPhone-13 viewport |
| viewport-dependent board size | `planBoardLayout` at the project viewports; asserted in `tests/gameSession.test.ts` |
| touch targets | `getBoundingClientRect()` on every visible control, Chromium, single sample per control |
| contrast | WCAG 2.x relative-luminance formula in `src/representations/legibility.ts`, unit-tested |
| axe | `@axe-core/playwright` 4.13.0, tags `wcag2a, wcag2aa, wcag21a, wcag21aa`, five required states |

**Sample counts are stated as they are.** Touch-target and layout numbers are single measurements of deterministic
layouts, not statistics. Nothing here is presented as a field measurement or as a representative sample.

## The 20 rows

Statuses are `Meets`, `Exceeds`, `Below` or `N/A`. Zero-tolerance rows are marked **(ZT)** and may not ship Below and
may not be waived N/A.

| # | Row | Status | References | Evidence | Finding / remediation |
| --- | --- | --- | --- | --- | --- |
| 1 | learning objective clarity | Meets | Khan Academy g3–4 equivalents *(review pending)* | `docs/lanes/CURRICULUM_MAP.md` states every claim as `primary`/`supporting`/`review-only` with explicit exclusions; the game's own copy makes no learning claim | — |
| 2 | first-action discoverability | Meets | PhET Fractions: Equality *(review pending)* | grade setup is the first screen, one action per grade, each stating its catalogue; instruction screen has exactly one primary action; no timer anywhere | — |
| 3 | engine/visual equivalence agreement **(ZT)** | Meets | all representation references | the engine's canonical pair is what the accessible name and the match strip state; `compareRationals` orders amounts for the copy; `tests/gameFeedback.test.ts` asserts copy against `compareRationals` rather than against literal strings | — |
| 4 | same-whole fidelity **(ZT)** | Meets | Math Learning Center number line | `whole` is a required prop; `planRepresentationComparison` refuses cross-whole pairs; set pairs must share identity *and* total; number-line pairs must share the axis; refusals asserted in `tests/representationIsolation.test.ts` | — |
| 5 | symbolic notation clarity | Meets | Khan Academy | ASCII `n/d` everywhere, never a vulgar glyph (guarded over the formatter); spoken name always supplied; `2/4` is never silently reduced to `1/2` | — |
| 6 | bar/strip fidelity | Meets | PhET, Math Playground | partition and division-line floors measured in `src/representations/legibility.ts`; lane coverage rejects any authored form with no legible family; gallery journey measured in a browser | — |
| 7 | circle/area fidelity | Meets | Slice Fractions 2 | same floors, wedge measured by outer arc × radial depth; browser-qualified at the shipped card box | recorded limit: a wedge is measured by outer arc and radial depth, which is a legibility model rather than a proof at every angle (GAME-186) |
| 8 | set-model fidelity | Meets | Math Playground | the collection must divide exactly (`total % denominator === 0`); a value at or above one whole is refused rather than rescaled | — |
| 9 | number-line fidelity | Meets | Math Learning Center | `ticksPerUnit` must be a multiple of every catalogue denominator, so points land on real ticks; tick-spacing and label floors measured | recorded limit: a lane containing 100 cannot offer the line legibly at any shipped card size, so grade 4 resolves a hundredth symbolically |
| 10 | cross-representation matching clarity | Meets | PhET, Slice Fractions 2 | pairs land on two different families wherever the lane requires it; the match strip shows the pair's own two forms on one shared whole and reports `distinctForms` honestly | — |
| 11 | correct-match explanation | Meets | PhET | `matchFeedback` names both authored forms and the spoken shared value, bounded to 12 words, asserted against the engine's canonical pair | — |
| 12 | mismatch explanation/recovery | Meets | PhET, Khan Academy | classifier names the signal the pair shares (GAME-187's own distractor families); the relation comes from `compareRationals`; 1.2 s minimum / 3 s maximum inspection; no shame vocabulary (regex-asserted) | — |
| 13 | progression/scaffolding | **Below** | Slice Fractions 2, ST Math *(supplemental)* | what ships: warm-up → production board, the lane's own `labelVisibility`, and a viewport-appropriate board size. The derived difficulty ladder (`laneLadder`, `recordBoardOutcome`) is implemented and tested but **no browser surface drives it** | **Owner deferral requested.** Wiring adaptation into play needs a session-level outcome feed that GAME-190/191 deliberately did not include; the risk of shipping without it is that a learner who is confused gets no easier board within a session. This is not zero-tolerance, and the deferral is recorded rather than silently accepted |
| 14 | bounded session/replay pacing | Exceeds | all references | soft prompt at 2 boards/3 min, hard cap at 4 boards/6 min, 30 s idle offer that terminates nothing, boards never auto-start, two equal-weight ending actions | stronger than the comparators reviewed in this respect; no engagement-pressure pattern exists |
| 15 | keyboard/focus interaction **(ZT)** | Meets | Xbox Accessibility Guidelines, WCAG 2.2 AA | roving tabindex with exactly one card in the order; arrows move geometrically; every pointer action has a keyboard equivalent; the focus-destroying defect found in GAME-192 is fixed and guarded by a regression test on all three engines | — |
| 16 | screen-reader parity and hidden-value protection **(ZT)** | **Below** | Xbox Accessibility Guidelines, WCAG 2.2 AA | hidden-value protection **passes** (no value, family, fraction attribute or SVG; name is exactly `Hidden card`); one bounded polite live region announces each outcome once; axe is clean across five states | **RELEASE BLOCKING.** Screen-reader parity is **unqualified**: NVDA and VoiceOver have not been run. `docs/game/ACCESSIBILITY.md` records them as pending, not performed. Automated axe output cannot substitute for a human listener, and this row is zero-tolerance, so the candidate **may not be promoted** until those runs happen |
| 17 | touch/responsive/200%-zoom quality | Meets | WCAG 2.2 AA, Xbox Guidelines | every visible control ≥ 44×44 CSS px; 200% zoom loses no content horizontally and clips no card; board reflows and deals a fitting number of pairs | touch is emulated (WebKit on a phone viewport), not physical hardware — recorded |
| 18 | reduced-motion/forced-colors parity **(ZT)** | Meets | WCAG 2.2 AA, Xbox Guidelines | reduced motion produces identical result, matched set and explanatory text, with decoration removed and the inspection window deliberately unchanged; forced colors stays usable with states told apart by boundary weight rather than hue | emulated rather than real OS settings — recorded |
| 19 | performance/reliability/privacy **(ZT)** | Meets | — | 94.45 KB gzip learner JS against GAME-194's 120 KB budget; no storage, cookie, network or telemetry marker (privacy guard); deterministic from a seed; the browser error gate is clean in every journey | budgets beyond bundle size (LCP, CLS, long tasks) belong to GAME-194's hosted measurement and are not claimed here |
| 20 | originality/IP separation and healthy-engagement posture **(ZT)** | Meets | all references | **zero** comparator-named files in the repository; `docs/provenance/LEGACY_BASELINE.md` records what was inspected and what was not copied; the copy register's banned-pattern review is clean (no streak, leaderboard, lives, timer, or child-vs-child comparison); no audio, no remote telemetry | — |

### Ship rule

Six zero-tolerance rows meet. **Row 16 is Below**, so the release rule is not satisfied and **the candidate may
not be promoted to games-site production** until the screen-reader runs are performed and this row is re-tested.
Row 13 is Below and owner-deferred with the risk stated above.

## Comparator references — roles and review status

Reviewed in their defined roles. **None has been studied hands-on**, and that is recorded rather than dressed up:
a genuine comparative study means running each product, which has not happened.

| Reference | Role | Status | Impact if unreviewed |
| --- | --- | --- | --- |
| PhET — Fractions: Equality | primary comparator for equivalent-fraction interaction and feedback | **review pending (owner)** | rows 10–12 rest on internal evidence and on published descriptions only; a real gap in first-action or feedback design relative to PhET would not have been caught |
| Slice Fractions 2 | comparator for progression and game feel | **review pending (owner)** | row 13's `Below` is judged against the shipped game, not against Slice Fractions' adaptation loop; the size of the gap is not quantified |
| Math Playground equivalent-fraction activities | comparator for activity framing and repetition | **review pending (owner)** | no impact identified on any row currently rated Meets |
| Math Learning Center — Fractions / Number Line | reference standard for number-line fidelity | **review pending (owner)** | row 9's floors are measured from this repository's own legibility model, not from the MLC's conventions |
| Khan Academy g3–4 equivalent fractions | reference for notation and articulation clarity | **review pending (owner)** | row 5 rests on internal notation rules (ASCII, no vulgar glyphs, spoken names) |
| Xbox Accessibility Guidelines + WCAG 2.2 AA | normative reference for rows 15–18 | **partially reviewed** — the criteria each row cites are applied in code and in tests; no line-by-line conformance audit has been performed | rows 15–18 could be Below against a criterion not yet considered; row 16 is already Below on screen-reader parity |

`ST Math` and `Mathigon Polypad` are supplemental notes only, as the story permits, and are not used as gates.

**Inaccessible / unavailable:** none of the six was inaccessible. All six are **unreviewed rather than
unreachable**, and the difference matters — the follow-up action is a study session, not an access request.

## Human evidence — the playtest

**Status: PENDING — owner-run.** The story is explicit that automated or AI review cannot substitute for this, and
it has not been performed. What follows is the protocol, ready to run against the candidate above.

- **Candidate:** the exact commit `2f0610b…` above. Any later commit invalidates the result.
- **Participants:** 1–3 owner-selected learners, grades 3–5, with an adult present and consenting.
- **Devices:** one phone (≤ 400 CSS px wide) and one tablet or laptop. Non-identifying: no names, no faces, no
  audio/video recording, no account, no telemetry.
- **Duration:** one bounded sitting, ~15 minutes per learner, ending at the game's own soft prompt.
- **Tasks, in order:** (1) choose a grade and start; (2) match one pair on the warm-up; (3) play one production
  board; (4) reach the summary and choose one of its two actions.
- **Observe and note, verbatim where possible:** whether the first action was found without help; whether the
  learner matched *equal quantities* rather than identical pictures (ask them to say why two cards go together);
  whether a mismatch explanation was read or skipped; whether anything was confusing, dull, or felt like pressure.
- **Do not collect:** scores, times, grades, names, device identifiers or any personal data. Notes stay
  non-identifying.
- **What it is not:** statistically representative evidence. It is a qualitative usability and delight signal.
- **Record in this file** as a dated paragraph naming the candidate SHA, the device classes and the number of
  learners — and the honest conclusion, including if the conclusion is "inconclusive".

## Banned engagement-pattern review

Clean. No streak, combo, multiplier, life, heart, countdown, daily record, personal best, leaderboard,
child-vs-child comparison, loss framing, or "try again / try harder" copy exists anywhere in the game. The copy
register lists every learner-facing string and a regex in `tests/gameFeedback.test.ts` and
`tests/gameSessionBounds.test.ts` refuses that vocabulary across every generated message.

## Copy and IP register

`docs/game/COPY_REGISTER.md` is complete for every string the game can currently produce, including the session
arc. It also records the banned-pattern review. No comparator imagery, code, asset, audio, layout, writing or
branding exists anywhere in this repository — asserted by the provenance record and by the absence of any
comparator-named file.

## How to re-test

1. Check out the candidate commit and run `npm run verify` (typecheck, lint, coverage, six architecture guards,
   build, privacy).
2. Run `npm run test:e2e` and `npm run test:host`.
3. Record the new bundle sizes from the build output.
4. Re-run any row whose evidence changed, and re-timestamp the candidate row above.
5. A row may only move to Meets with evidence attached to the new candidate SHA.
