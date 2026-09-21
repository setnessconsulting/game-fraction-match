/**
 * Lane panel (GAME-187) — a pure projection of the fixture plans.
 *
 * GAME-189 owns the playable board. This surface exists so the *lane* layer can be inspected and qualified
 * in a browser on real engine values: which value each pair holds, which representation family each card was
 * given, whether a pair really landed on two different families, and whether the lane's declared whole
 * reaches every card.
 *
 * It decides nothing. Every family, every whole and every pairing was already chosen by the lane planner over
 * an engine deck, and the fixture planned those boards before this component ever rendered. The markup states
 * the plan's own facts as `data-*` attributes so a browser qualification can assert the projection without
 * recomputing it — and so a discrepancy between the plan and the picture is a test failure rather than a
 * judgement call.
 */

import { RepresentationByFamily, type RepresentationBox } from "../representations";
import { FIXTURE_LANE_PLANS, LANE_FIXTURE_CARD_BOX, LANE_FIXTURE_SEED } from "./laneFixtures";
import type { LaneCardPlan } from "../lanes";

function fractionLabel(card: LaneCardPlan): string {
  return `${card.form.numerator}/${card.form.denominator}`;
}

function canonicalLabel(card: LaneCardPlan): string {
  return `${card.form.canonical.numerator}/${card.form.canonical.denominator}`;
}

/**
 * One card. The box handed to the primitive is the lane's declared card box exactly, so the picture is drawn
 * at the size the legibility floors measured.
 */
function LaneCard({ card, box }: { readonly card: LaneCardPlan; readonly box: RepresentationBox }) {
  const label = fractionLabel(card);
  const canonical = canonicalLabel(card);

  return (
    <li
      className="lane-card"
      data-testid="lane-card"
      data-card-id={card.cardId}
      data-pair-id={card.pairId}
      data-representation={card.representation}
      data-fraction={label}
      data-canonical={canonical}
      data-card-size={box.width}
      data-legible={String(card.legibility.legible)}
    >
      <div className="fm-card fm-card--lane" data-testid="lane-card-surface" data-card-size={box.width}>
        <RepresentationByFamily family={card.representation} fraction={card.form} whole={card.whole} box={box} />
      </div>
      <p className="lane-card__label" data-testid="lane-card-label">
        {label}
        {label === canonical ? "" : ` (= ${canonical})`}
      </p>
    </li>
  );
}

/** The fixture lanes, each as one planned board. */
export function LanePanel() {
  return (
    <section className="panel" aria-labelledby="lane-panel-heading" data-testid="lane-panel">
      <h2 id="lane-panel-heading">Lane fixtures</h2>
      <p className="microcopy">
        GAME-187 lane plans drawn over engine decks. Debug surface only: these are neutral examples chosen to
        exercise the lane mechanism, they carry no standards claim, and this is not the playable board.
      </p>

      {FIXTURE_LANE_PLANS.map((plan) => {
        const headingId = `lane-heading-${plan.lane.laneId}`;
        const families = plan.diagnostics.representationCounts;

        return (
          <article
            className="lane-board"
            key={plan.lane.laneId}
            aria-labelledby={headingId}
            data-testid="lane-board"
            data-lane-id={plan.lane.laneId}
            data-grade-band={plan.lane.gradeBand}
            data-seed={plan.seed}
            data-pair-count={plan.lane.pairCount}
            data-card-size={plan.lane.cardBox.width}
            data-pool-size={plan.diagnostics.poolSize}
          >
            <h3 id={headingId}>{plan.lane.title}</h3>
            <p className="microcopy" data-testid="lane-board-summary">
              {`${plan.lane.pairCount} pair(s) · ${plan.cards.length} card(s) · card ${plan.lane.cardBox.width}×${plan.lane.cardBox.height} px · ` +
                `seed ${plan.seed} · families ${Object.entries(families)
                  .filter(([, count]) => count > 0)
                  .map(([family, count]) => `${family} ${count}`)
                  .join(", ") || "none"}`}
            </p>

            <ul className="lane-board__pairs" data-testid="lane-pairs">
              {plan.pairs.map((pair) => (
                <li
                  className="lane-pair"
                  key={pair.pairId}
                  data-testid="lane-pair"
                  data-pair-id={pair.pairId}
                  data-canonical={`${pair.canonical.numerator}/${pair.canonical.denominator}`}
                  data-distinct-representations={String(pair.distinctRepresentations)}
                >
                  <ul className="lane-cards" data-testid="lane-cards">
                    {pair.cards.map((card) => (
                      <LaneCard key={card.cardId} card={card} box={plan.lane.cardBox} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </article>
        );
      })}

      <p className="gallery-note">
        {`Planned once from the fixture seed ${LANE_FIXTURE_SEED} at a ${LANE_FIXTURE_CARD_BOX.width}×${LANE_FIXTURE_CARD_BOX.height} px card box; ` +
          "the same seed always deals the same board."}
      </p>
    </section>
  );
}
