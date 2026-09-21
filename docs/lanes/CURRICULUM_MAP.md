# Curriculum map (GAME-187)

This document is the reviewer-facing half of `src/lanes/curriculum.ts`. The TypeScript module is the
authority; this page explains what it claims and why, so the claims can be checked by someone who is not
reading code.

**The game teaches equivalence.** It does not teach the whole fractions domain, and it deliberately
claims less than a fraction curriculum might. Claims are stated as exactly one of three postures:

| Posture | Meaning |
| --- | --- |
| `primary` | the lane is designed to teach or assess this standard |
| `supporting` | the lane exercises this standard as a means to the primary one |
| `review-only` | the content is prerequisite or reinforcement material; **no instruction or assessment is claimed** |

A `primary` or `supporting` claim may only be made about the band's own standards. Another grade's standard
can only ever be claimed `review-only`, and `curriculumProblems()` fails the build if that rule is broken.

## Grade 3 — fractions as numbers, and simple equivalents

**Primary:** 3.NF.A.2, 3.NF.A.3a, 3.NF.A.3b, 3.NF.A.3c

**Denominators dealt:** `2, 3, 4, 6, 8`

**Representation families:** number line, bar, circle, set, symbolic

| Lane | Shape | Why |
| --- | --- | --- |
| `g3-number-line-halves-quarters-eighths` | catalogue `2, 4, 8`, axis of 8, 3 pairs, number line first | 3.NF.A.2 wants a position on a number line, and 8 parts is the coarsest axis that still makes eighths readable at the shipped card |
| `g3-equivalent-fractions-halves-to-eighths` | catalogue `2, 3, 4, 6, 8`, collection of 24, 4 pairs | 3.NF.A.3 wants equivalents justified visually, so the lane offers a bar, a circle, a collection and a symbol |

**Exclusions.**

- No denominator outside `2, 3, 4, 6, 8` is dealt at grade 3.
- Equivalence is never asserted across two different wholes.
- The number line is only offered by the narrow-catalogue lane: an axis fine enough for sixths and eighths
  collapses tick spacing below the legibility floor at the shipped card size. This is a real limitation, not
  a preference.
- No fraction addition, subtraction, multiplication or division is taught or assessed.

## Grade 4 — generate and recognise equivalent fractions

**Primary:** 4.NF.A.1. **Supporting:** 4.NF.A.2 (same-whole reasoning only)

**Denominators dealt:** `2, 3, 4, 5, 6, 8, 10, 12, 100`

**Representation families:** circle, bar, symbolic

| Lane | Shape | Why |
| --- | --- | --- |
| `g4-equivalent-fractions-full-catalogue` | the full published catalogue, 8 pairs, 12-part cap on the visual families | one lane ships the whole catalogue; the production board shape |

`requireDistinctRepresentationPerPair` is **false** on purpose. A hundredth has exactly one legible family at
the shipped card, so insisting on two *different* pictures for every pair would make the published catalogue
undealable. The supported pair families for this game include `symbolic ↔ symbolic`.

**The denominator-100 rule.** A hundredth is never drawn as a 100-part card grid. The lane declares
`maxPartitionCount: 12` on its circle and bar and offers `symbolic`, and the rule is enforced as a lane
validity invariant (`laneHundredPartGridProblems`) rather than left to the legibility floors: a floor is a
measurement of one card, and an author needs the rule to fail with the field that caused it. The
`number-line` and `symbolic` families are exempt because neither draws a partition grid.

**Exclusions.**

- Denominator 100 is never drawn as a 100-part card grid; it resolves symbolically.
- No unlike-whole comparison is offered, so 4.NF.A.2 is claimed only for same-whole reasoning.
- No decimal notation and no decimal/fraction conversion.
- No fraction arithmetic.

## Grade 5 — review-only equivalence support

**Review-only:** 5.NF.A.1, 5.NF.A.2, 5.NF.B.5b

**Denominators dealt:** the union of the grade 3 and grade 4 catalogues — `2, 3, 4, 5, 6, 8, 10, 12, 100`

**Representation families:** number line, circle, bar, symbolic

| Lane | Shape | Why |
| --- | --- | --- |
| `g5-review-lower-scaffolding` | the grade 4 catalogue, 8 pairs, labels withheld until a match, tighter adaptation thresholds | "mixed representations, lower scaffolding and strategic equivalence recognition" expressed as lane data rather than as new content |

**Exclusions.**

- The game does not add, subtract, multiply or divide fractions, so **no 5.NF.A or 5.NF.B operation is
  taught or assessed**. The grade-5 connection is prerequisite and review support only.
- Grade 5 adds no denominator of its own: it reuses the grade 3 and grade 4 catalogues.
- No scaling or resizing of fraction quantities is claimed.
- No mastery, placement or proficiency conclusion is produced anywhere in the game.

## What is deliberately *not* claimed

- No standard outside the table above appears anywhere in the game's copy or content.
- The lane fixtures that the shell renders (`src/app/laneFixtures.ts`) are **neutral examples**: they exist
  to exercise the lane mechanism, they are labelled with a grade band only as an ordering hint, and they
  carry no standards claim at all. The grade-band denominator rule is therefore enforced by the map, not by
  `validateLaneConfig` — binding a neutral fixture to a published catalogue would turn a labelling
  convention into a false curriculum statement.
- No account, persistence, parent reporting or remote telemetry exists, so no claim about a learner is
  produced or transmitted.

## How to change the map

1. Edit `src/lanes/curriculum.ts` — the catalogues live in `GRADE_BAND_DENOMINATOR_CATALOGUES`, the claim
   sets and lanes in `CURRICULUM_MAP`.
2. Every shipped lane must satisfy `validateLaneConfig` and its band's catalogue.
3. Every claimed standard must name a posture, a primary claim must belong to the band, and each line must
   state its exclusions.
4. Every family a line claims must actually be shipped by one of its lanes.
5. Run `npm run verify`. `tests/laneCurriculum.test.ts` pins the exact catalogues, the exact claim sets and
   each of the rules above, so a change that inflates a claim fails the build rather than shipping.
6. Update this document in the same change: it is the reviewer-facing statement of the same facts.
