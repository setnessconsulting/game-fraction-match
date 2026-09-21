/**
 * Countable set / collection model (GAME-186).
 *
 * The whole is the declared collection, so its total object count is part of the picture and part of
 * the component's type: this component will not render a discrete-set whole that the contract cannot
 * divide exactly, and two such models can only be compared when their totals match.
 */

import { setGeometry } from "../geometry/setModel";
import { accessibilityLabelFor, textAlternativeFor } from "../notation";
import { discreteSetWholeOf } from "../whole";
import { RepresentationFrame } from "./RepresentationFrame";
import { resolveBox, type BaseRepresentationProps } from "./types";

export type FractionSetProps = BaseRepresentationProps;

export function FractionSet({ fraction, whole, box, fluid, className }: FractionSetProps) {
  const resolvedBox = resolveBox("set", box);
  const setWhole = discreteSetWholeOf(whole, "FractionSet");
  const geometry = setGeometry({ fraction, box: resolvedBox, whole: setWhole });

  return (
    <RepresentationFrame
      family="set"
      fraction={fraction}
      whole={whole}
      box={resolvedBox}
      label={accessibilityLabelFor({ family: "set", fraction, whole })}
      textAlternative={textAlternativeFor(fraction)}
      fluid={fluid}
      className={className}
    >
      {geometry.objects.map((object) => (
        <circle
          key={object.objectIndex}
          className="fm-partition"
          data-testid="set-object"
          data-fill={object.selected ? "filled" : "empty"}
          data-ordinal={object.objectIndex}
          cx={object.centerX}
          cy={object.centerY}
          r={object.radius}
        />
      ))}
    </RepresentationFrame>
  );
}
