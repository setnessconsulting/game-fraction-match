# Lane contract (GAME-187)

A **lane** is content as data: which denominators may be dealt, which authored numerators are allowed,
which representation families are preferred and in what order, the one whole every card in the lane shares,
the card box those pictures were qualified at, how plausible its distractors must be, how much scaffolding
it shows, and how it is allowed to change between boards.

The lane layer sits between two authorities it does not own and must never replace:

| Authority | Owns | A lane may |
| --- | --- | --- |
| the engine (`src/engine`) | which pool values are dealt, how pairs are chosen, how the deck is shuffled | read the public boundary and hand it a pool |
| the representation layer (`src/representations`) | whether a picture is legible at a given box | ask for the first legible family, and be told why the others were refused |
| **the lane layer (`src/lanes`)** | content and the rules applied to it | compose a pool, state constraints, plan a board, adapt between boards |

There is exactly one generator. A lane composes; it never shuffles, never computes equivalence, and never
picks a picture by hand.

## `LaneConfig`

```ts
type LaneConfig = {
  laneId: string;
  gradeBand: "grade-3" | "grade-4" | "grade-5";   // an ordering label, not a standards claim
  title: string;
  pairCount: number;                              // 2..32 (the engine's own bounds)
  cardBox: { width: number; height: number };     // the box the floors were measured at
  denominatorCatalogue: readonly number[];        // 2..1000, no duplicates
  numeratorPolicy?: { allowZero?; allowWhole?; allowImproper? };
  maxFormsPerFamily?: number;                     // >= 2: one form is not a pair
  scaleFactors?: readonly number[];                // each >= 2; scale factor 1 is always available
  representationMix: readonly { family; maxPartitionCount? }[];   // preference order, no repeats
  requireDistinctRepresentationPerPair?: boolean;  // defaults to true
  labelVisibility?: "always" | "on-reveal" | "never";             // defaults to "always"
  thresholds?: { progression: number; fallback: number; review: number };  // each >= 1
  whole: LaneWholeDeclaration;
  distractorPolicy?: {
    minimumNearMissLinks?: number;                 // defaults to poolSize - 1
    minimumRationalGap?: { numerator; denominator };  // exact gap, on the lane's own axis
    families?: readonly ("same-numerator" | "same-denominator")[];
  };
  constraints?: { requireDistinctAuthoredForms?: boolean };
};
```

### The fields, and what each one is for

- **`denominatorCatalogue`** — the authored denominators a lane may deal. It is *content*, not a
  computation: a value only enters the pool if the catalogue can write at least two authored forms of it,
  because two identical pictures are not a pair.
- **`scaleFactors`** — which equivalent notations may be written *on top of* a value's own form.
  `[2, 4]` over a catalogue of `2, 4, 8` writes `1/2`, `2/4` and `4/8` but never `3/6`. Scale factor 1 is
  the value's own form and is always available; a factor that leaves a value with only that form drops the
  value from the pool rather than weakening the pair rule.
- **`distractorPolicy.minimumNearMissLinks`** — how connected the pool must be through near-miss links.
- **`distractorPolicy.families`** — which near-miss *classes* the lane accepts. A distractor is plausible
  when it shares a written signal with the target: the same numerator (`1/2` beside `1/3`) or the same
  denominator (`1/4` beside `3/4`). A declared class the pool never realizes is a lane error, not a
  silently ignored preference.
- **`distractorPolicy.minimumRationalGap`** — how *distinguishable* two pool values must be. This is
  compared on the lane's own axis: `whole.ticksPerUnit` is already a multiple of every catalogue
  denominator, so each pool value has an exact integer tick position and no rounding is involved. The
  gap's denominator must divide `ticksPerUnit`, otherwise the gap could not be placed on the axis at all.
- **`labelVisibility`** — the scaffolding knob. `always` states the value in words as well as in geometry,
  `on-reveal` withholds the label until a card is matched, `never` is the lowest-scaffolding setting.
  Adaptation may restore a label, but only between boards.
- **`thresholds`** — how progression, fallback and review behave (see below). Latency is deliberately
  absent from this type: speed is diagnostic and can never promote or demote.
- **`whole`** — one continuous whole, one countable collection and one axis, shared by every card in the
  lane. Every catalogue denominator must divide the collection total and the axis scale.

## Validation

`validateLaneConfig` asks four questions in order, because each needs the previous answer:

1. **Is it structurally a lane?** ids, grade band, pair count, card box, catalogue, and every optional
   policy (including the new scale-factor, label-visibility, threshold, gap and distractor-class fields).
   A structural failure stops the audit.
2. **Can its wholes carry its catalogue?** Every catalogue denominator must divide `setTotalObjectCount`
   and `ticksPerUnit`.
3. **Does the catalogue yield a usable pool?** At least `pairCount` values with two authored forms each,
   connected by near-miss links, meeting the declared gap and realizing the declared distractor classes.
4. **Can its mix draw every value in that pool at its card box?** The GAME-186 legibility floors decide,
   and the lane fails if any authored form has no legible family (or only one, when it insists on two
   different pictures per pair).

Every later stage reports all of its problems at once, so a lane author fixes a lane in one pass. A lane
that cannot be dealt fails loudly: no representation or content requirement is ever silently dropped.

### The denominator-100 rule

A lane whose catalogue contains `100` may never draw a hundredth as a partition grid — it is unreadable at
every shipped card size. `laneHundredPartGridProblems` is therefore a **lane validity rule**, not a hope
that the legibility floors will catch it: the two families that draw no grid, `symbolic` and `number-line`,
are exempt, and every other family in the mix must declare a `maxPartitionCount` strictly below 100 so a
hundred-part grid is *unreachable* rather than merely illegible.

## The difficulty ladder

Adaptation needs somewhere to move, so `laneLadder(lane)` derives it from the lane itself. The ladder runs
from the most scaffolded rung to the lane as written, and each rung is produced from the previous one by a
single bounded edit:

1. `label-scaffolding` — restore the printed label;
2. `representation-mixing` — drop the least-preferred family;
3. `denominator-reach` — drop the largest catalogue denominator.

An edit is kept only when the result is *still a satisfiable lane*, so adaptation can never walk into a
board the lane layer would refuse. A one-rung ladder is a legitimate answer; an easier lie is not.

`assertLaneLadderInvariants` proves the result without trusting the derivation: every rung is re-validated,
the top rung is compared against the lane as written, each adjacent pair must differ in **exactly one**
dimension, and the change must move in the easier direction (labels more scaffolded, families a prefix,
catalogue a subset). A rung can never widen the lane, so adaptation cannot escape the grade or lane the
learner chose.

## Adaptation and bounded review

Every function in `src/lanes/adaptation.ts` is pure, seeded and memory-only: a session is a frozen value,
every transition returns a new session, and nothing is written or scheduled anywhere.

```ts
const ladder = laneLadder(lane);                       // validated content, no outcomes needed
let session = createLaneSession(lane, seed);            // starts at the most scaffolded rung
const board = planLaneBoard(session, ladder);           // the board on screen; frozen
const report = boardOutcomeFor(board, { matchedPairs, confusedPairIds, activeMs });
session = recordBoardOutcome(session, ladder, report);  // the *next* board's difficulty
```

The product rules, and where each one is enforced:

| Rule | Where |
| --- | --- |
| difficulty changes only between boards | `recordBoardOutcome` decides the next board's step; the board in play keeps its own |
| one bounded dimension at a time | the ladder moves by at most one rung, and adjacent rungs differ in exactly one dimension |
| latency is diagnostic only and never changes difficulty | `activeMs` is carried in evidence and read by no decision |
| repeated confusion may restore labels or schedule review | a due review board restores `labelVisibility: "always"` |
| review uses fresh instances, not the identical memorized pair | the deal is rejected and re-dealt while it would reproduce the memorized pair; failing all `REVIEW_FRESHNESS_ATTEMPTS` is a loud error |
| the current board never mutates beneath the learner | sessions and boards are frozen; a transition returns a new one |
| session evidence is memory-only and deterministic under fixtures | nothing leaves the process; identical inputs give identical sessions |
| no mastery conclusion is produced | no score, proficiency, level or placement exists in any type or export |

Session state is bounded: at most `MAX_PENDING_REVIEW` review items (oldest dropped) and at most
`MAX_EVIDENCE_BOARDS` finished boards are retained.

## Guarantees and limitations

**Guaranteed.** Activation never escapes the lane; every planned card is one the coverage report proved
legible for that exact authored form; adaptation changes at most one dimension per board boundary; a review
board is never the pair the learner memorized; the current board is never mutated; no mastery is expressed.

**Not guaranteed, recorded honestly.**

- A review board is a *fresh deal of the same lane*, not a targeted re-serve of the confused value. The
  engine owns which pool values are dealt, so the session **reports** whether the reviewed value was
  re-encountered (`reviewedValuesDealt`) rather than forcing it. The loud guarantee is the narrower, stronger
  one: never the identical memorized pair.
- The ladder is derived, not authored. A lane can therefore offer fewer rungs than an author might expect;
  the derivation stops at the first edit that would make a rung undealable.
- `labelVisibility`, `thresholds` and `scaleFactors` are content decisions. They are validated, but nothing
  in this repository yet plays a session in a browser: GAME-189 owns the board, GAME-190 the feedback and
  GAME-191 the session lifecycle that would drive them.
- A lane with `100` in its catalogue cannot offer the number line legibly at any shipped card size, because
  the axis must be at least 100 ticks. Grade 4 therefore resolves a hundredth symbolically.

## Consumer rules

- **Validate before dealing.** `assertValidLane` (or `isSatisfiableLane` for a soft check) answers whether a
  lane can be drawn at all. `planLaneDeck` validates first and refuses a lane that cannot be dealt.
- **Never shuffle a lane.** The engine chooses; the planner only relates values to representations.
- **Trust the plan's diagnostics, not its prose.** `plan.diagnostics` reports measured near-miss links and
  representation counts, and `assertLanePlanInvariants` re-derives the plan's shape from the engine's deck.
- **Ask coverage for per-form evidence.** `laneCoverageReport` measures every authored form against every
  family in the mix and reports each rejection with the measurement that caused it.

## Downstream owners

| Story | Owns |
| --- | --- |
| GAME-188 | the real card size and production design (a lane's `cardBox` is the box it was qualified at) |
| GAME-189 | rendering a planned board and the setup flow that picks a grade |
| GAME-190 | explanatory feedback for a match or a mismatch |
| GAME-191 | session bounds, the factual summary and the replay arc |
| GAME-192 | accessibility, keyboard, touch, forced-colors and reduced-motion qualification |

The lane fixtures in `src/app/laneFixtures.ts` are neutral examples chosen to exercise the mechanism. They
carry no standards claim. The reviewed content with its claims and exclusions lives in
[`CURRICULUM_MAP.md`](./CURRICULUM_MAP.md).
