/**
 * Circle / area model (GAME-186).
 *
 * One circle is one whole, cut into equal wedges. Filled wedges are solid ink and empty wedges are
 * outlines, so the shaded quantity is readable without relying on hue. Radial dividers are stroked
 * lines of the shared 2 px thickness.
 */

import { circleGeometry } from "../geometry/circle";
import { accessibilityLabelFor, textAlternativeFor } from "../notation";
import { RepresentationFrame } from "./RepresentationFrame";
import { resolveBox, type BaseRepresentationProps } from "./types";

export type FractionCircleProps = BaseRepresentationProps;

export function FractionCircle({ fraction, whole, box, fluid, className }: FractionCircleProps) {
  const resolvedBox = resolveBox("circle", box);
  const geometry = circleGeometry({ fraction, box: resolvedBox });

  return (
    <RepresentationFrame
      family="circle"
      fraction={fraction}
      whole={whole}
      box={resolvedBox}
      label={accessibilityLabelFor({ family: "circle", fraction, whole })}
      textAlternative={textAlternativeFor(fraction)}
      fluid={fluid}
      className={className}
    >
      {geometry.circles.map((circle) => (
        <circle
          key={`outline-${circle.circleIndex}`}
          className="fm-whole-frame"
          data-testid="circle-whole-frame"
          data-circle-index={circle.circleIndex}
          cx={circle.centerX}
          cy={circle.centerY}
          r={circle.radius}
        />
      ))}
      {geometry.wedges.map((wedge) => (
        <path
          key={`${wedge.circleIndex}-${wedge.wedgeIndex}`}
          className="fm-partition"
          data-testid="circle-wedge"
          data-fill={wedge.filled ? "filled" : "empty"}
          data-ordinal={wedge.ordinal}
          d={wedge.path}
        />
      ))}
      {geometry.divisions.map((division) => (
        <line
          key={`${division.circleIndex}-${division.boundaryIndex}`}
          className="fm-division"
          data-testid="circle-division"
          x1={division.x1}
          y1={division.y1}
          x2={division.x2}
          y2={division.y2}
        />
      ))}
    </RepresentationFrame>
  );
}
