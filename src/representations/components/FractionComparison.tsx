/**
 * Shared two-value comparison view (GAME-186).
 *
 * Both sides are rendered inside one frame that states the declared whole once. Before rendering, the
 * comparison is *planned*: an unsupported family pair, two different whole identities, a set pair with
 * different totals or two number lines on different axes all throw
 * {@link RepresentationContractError} instead of drawing a comparison that would be misleading.
 *
 * The view never compares the two fractions. Whether they are equivalent is the engine's business;
 * this component only guarantees that the two pictures are drawn against the same whole, so a learner
 * (or a test) can count the quantity honestly.
 */

import type { FractionValue, RepresentationBox, RepresentationFamily } from "../contract";
import { requireComparisonPlan, wholeText, type ComparisonSide, type RepresentationWhole } from "../whole";
import { RepresentationByFamily } from "./RepresentationByFamily";

export type ComparisonSideProps = {
  readonly family: RepresentationFamily;
  readonly fraction: FractionValue;
  readonly whole: RepresentationWhole;
  /** Side-specific box. Falls back to the comparison's shared box, then the family's nominal box. */
  readonly box?: RepresentationBox;
};

export type FractionComparisonProps = {
  readonly left: ComparisonSideProps;
  readonly right: ComparisonSideProps;
  /** One box applied to both sides, which keeps the two pictures directly comparable in size. */
  readonly box?: RepresentationBox;
  readonly fluid?: boolean;
  readonly className?: string;
};

function sideOf(side: ComparisonSideProps): ComparisonSide {
  return { family: side.family, fraction: side.fraction, whole: side.whole };
}

export function FractionComparison({ left, right, box, fluid, className }: FractionComparisonProps) {
  // The plan is asserted before anything renders, so a refused pair throws here instead of drawing.
  const plan = requireComparisonPlan(sideOf(left), sideOf(right));
  const classNames = ["fm-comparison"];
  if (fluid) classNames.push("fm-comparison--fluid");
  if (className !== undefined && className !== "") classNames.push(className);
  const pairId = `${left.family}--${right.family}`;

  const renderSide = (side: ComparisonSideProps) => (
    <RepresentationByFamily
      family={side.family}
      fraction={side.fraction}
      whole={side.whole}
      box={side.box ?? box}
      fluid={fluid}
    />
  );

  return (
    <div
      className={classNames.join(" ")}
      data-testid="representation-comparison"
      data-pair={pairId}
      data-rule={plan.rule}
      data-shared-whole-id={plan.sharedWholeId}
      data-left-family={left.family}
      data-right-family={right.family}
    >
      <div className="fm-comparison__side" data-testid="representation-comparison-left">
        {renderSide(left)}
      </div>
      <p className="fm-comparison__whole" data-testid="representation-comparison-whole">
        {`Same whole: ${wholeText(left.whole)}`}
      </p>
      <div className="fm-comparison__side" data-testid="representation-comparison-right">
        {renderSide(right)}
      </div>
    </div>
  );
}
