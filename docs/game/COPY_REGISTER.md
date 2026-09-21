# Copy register (GAME-190)

Every learner-facing string the game can produce, where it comes from, and what it claims. GAME-193 requires the
register to be complete, so this is the single place to check what the game says.

**Rules this register exists to hold:**

1. **Exactness.** Anything a string says about a quantity is derived from the engine's own values. "Which is
   larger" comes from `compareRationals`, the shared value of a match comes from the engine's canonical pair, and
   the authored forms come from the representation layer's formatter. No sentence is assembled from arithmetic
   done in a component.
2. **Bounded.** No explanation exceeds **12 learner-facing words** (`MAX_EXPLANATION_WORDS`), asserted for every
   class over a wide range of values in `tests/gameFeedback.test.ts`.
3. **No shame, no pressure.** No red X, no "wrong", no "try again", no life lost, no streak, no timer, no
   comparison to another learner. Asserted in the unit tests and in the browser journey.
4. **Nothing leaked.** A string never names a card the learner has not turned over. Asserted on the rendered board.

## GAME-190 feedback copy

Older GAME-189 strings are listed in the second table; GAME-190 replaced the mismatch line and added the match
explanation.

### Mismatch explanations

One shape, three leads, and the relation taken from the engine's ordering of the two amounts.

| Class | Template | Words | Claims |
| --- | --- | --- | --- |
| `same-numerator` | `Same top number. {a} is more than {b}.` | 8 | the pair shares a numerator; **the engine's ordering** says which amount is larger |
| `same-numerator` | `Same top number. {a} is less than {b}.` | 8 | as above, reversed |
| `same-denominator` | `Same bottom number. {a} is more than {b}.` | 8 | the pair shares a denominator; the ordering decides the relation |
| `same-denominator` | `Same bottom number. {a} is less than {b}.` | 8 | as above, reversed |
| `different-both` | `Different top and bottom numbers. {a} is more than {b}.` | 10 | neither signal is shared; the ordering decides the relation |
| `different-both` | `Different top and bottom numbers. {a} is less than {b}.` | 10 | as above, reversed |

Where `{a}` and `{b}` are the **authored** forms as written on the cards (`1/2`, `2/4`), so the sentence matches
what the learner is looking at rather than a reduced value they cannot see.

The classifier is GAME-187's own vocabulary: `same-numerator` and `same-denominator` are exactly the two
distractor families a lane authors its near-misses from, so the explanation names the relationship the content
was built to test. Anything else is `different-both`.

**A mismatch never has to explain equality.** The engine retains a pending comparison only for a mismatch, and
`mismatchFeedback` throws if it is ever handed two equal amounts rather than authoring copy that claims two equal
amounts differ.

### Match explanations

| Shape | Template | Words | Claims |
| --- | --- | --- | --- |
| Two different authored forms | `{a} and {b} are the same amount: {spoken shared}.` | 9–11 | both cards hold the engine's canonical value, stated in words as well as notation |
| The same authored form twice | `Both cards show {n/d}. Same amount.` | 6 | the two cards are written identically and hold the same amount |

Plus the strip's own line: `Same amount: {canonical notation}` — the reduced value, which is what the two cards
have in common. When the representation contract refuses to draw the pair on one shared whole, the strip appends
`(this pair cannot be drawn on one shared whole: …)` rather than presenting a demonstration that is not one.

**In how many forms?** The strip shows the pair's *own* two pictures side by side, so the shared amount is
demonstrated in two forms exactly when the lane gave the pair two different families — which GAME-187 requires
unless a lane disables it (grade 4's catalogue does, because a hundredth has only one legible family). The
`data-distinct-forms` attribute and the `distinctForms` field report which case applies rather than implying the
stronger one.

### Inspection-window copy

| State | String | Purpose |
| --- | --- | --- |
| holding | `Look at both cards.` | says what the window is for; it is not a countdown and not a scold |
| open | `Continue when you are ready.` | hands control back explicitly, with no time pressure |

The window itself is **1200ms minimum, 3000ms maximum**, identical under both motion preferences. It is the time
the two amounts need to be looked at, not an animation, so a reduced-motion preference does not shorten it.

## GAME-189 shell copy

| Surface | String | Notes |
| --- | --- | --- |
| Title | `Match the same amount` | the game's one-line claim |
| Setup | `Choose a grade` | |
| Setup note | `Each grade deals its own reviewed catalogue. The grade is an ordering label, not a claim about what you will learn today.` | refuses to promise learning |
| Grade button | `Grade 3` / `Grade 4` / `Grade 5` | an ordering label, never a standards claim |
| Grade detail | `{n} pairs · denominators {catalogue}` | states the content rather than a promise |
| Instruction | `Pick two cards that show the same amount.` | |
| Warm-up instruction | `Every card is showing. Pick two cards that show the same amount.` | |
| Instruction detail | `{n} card(s) · card {w}×{h} px` | debug-facing |
| Controls | `Start`, `Reset board`, `New board`, `Next board`, `Continue`, `End session`, `Back to grades` | all explicit; nothing auto-starts |
| Board heading | `Warm-up` / `Board` | |
| Progress | `Moves:`, `Pairs left:`, `Matched:` | facts only: no score, no level, no streak |
| Board complete | `Board complete. {n} pairs left. Nothing starts on its own — choose what comes next.` | |
| Status line | `Pick a grade to begin.` / `{Grade} · {warm-up\|board} · {n} board(s) finished` | |
| Recovery | `This board could not be drawn` + `Nothing was lost and nothing was saved. Start again from the grade screen whenever you are ready.` | calm, one action, no exception text |
| Footer | `Session-only, memory-only play.` + `No accounts, no cookies, no storage, no telemetry, no gameplay network requests.` | the privacy posture, stated |

## Banned-pattern review

| Pattern | Status |
| --- | --- |
| Shame or punishment ("wrong", "oops", red X, buzzer) | absent — asserted by regex in the unit and browser tests |
| Streaks, combos, multipliers, "keep the streak alive" | absent — no such concept exists in any type or string |
| Lives, hearts, time pressure, countdowns | absent |
| "Try again" / "try harder" framing | absent | 
| Comparison to another learner or to a previous session | absent — the summary is a fact list, and there is no persistent record |
| Loss framing ("you lost", "game over") | absent |
| Mastery, level, proficiency or placement claims | absent — no such concept exists anywhere in the game |
| Audio or remote telemetry dependency | absent — silence-first v1, and the privacy guard refuses network markers |

## How this register is kept honest

- `tests/gameFeedback.test.ts` holds every class to the word ceiling and to the shame regex, and asserts the copy
  against `compareRationals` rather than against hand-written strings, so a change to the classifier cannot make
  the copy silently wrong.
- `tests/e2e/gameFeedback.spec.ts` asserts on the *rendered* explanation: that only the two cards on show are
  named, that the window holds and then opens, and that reduced motion changes none of it.
- The register is updated in the same change as any string, and a new string that is not listed here is a gap in
  this document rather than a private decision in a component.
