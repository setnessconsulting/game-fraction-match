/**
 * Fraction bar / strip (GAME-186).
 *
 * Filled and empty parts differ by fill presence, not by hue: filled parts are solid ink, empty parts
 * are outlines. That keeps the model readable in forced-colors and high-contrast modes and means
 * colour is never the only cue. Division lines are rectangles so their rendered thickness can be
 * measured in a browser.
 */

import { barGeometry, type BarOrientation } from "../geometry/bar";
import { accessibilityLabelFor, textAlternativeFor } from "../notation";
import { RepresentationFrame } from "./RepresentationFrame";
import { resolveBox, type BaseRepresentationProps } from "./types";

export type FractionBarProps = BaseRepresentationProps & {
  readonly orientation?: BarOrientation;
};

export function FractionBar({ fraction, whole, box, orientation = "horizontal", fluid, className }: FractionBarProps) {
  const resolvedBox = resolveBox("bar", box);
  const geometry = barGeometry({ fraction, box: resolvedBox, orientation });

  return (
    <RepresentationFrame
      family="bar"
      fraction={fraction}
      whole={whole}
      box={resolvedBox}
      label={accessibilityLabelFor({ family: "bar", fraction, whole })}
      textAlternative={textAlternativeFor(fraction)}
      fluid={fluid}
      className={className}
    >
      {geometry.strips.map((strip) => (
        <g key={strip.stripIndex} data-testid="bar-strip" data-strip-index={strip.stripIndex}>
          {strip.partitions.map((partition) => (
            <rect
              key={partition.partitionIndex}
              className="fm-partition"
              data-testid="bar-partition"
              data-fill={partition.filled ? "filled" : "empty"}
              data-ordinal={partition.ordinal}
              x={partition.x}
              y={partition.y}
              width={partition.width}
              height={partition.height}
            />
          ))}
        </g>
      ))}
      {geometry.divisionLines.map((line, index) => (
        <rect
          key={`division-${index}`}
          className="fm-division"
          data-testid="bar-division"
          data-orientation={line.orientation}
          x={line.x}
          y={line.y}
          width={line.width}
          height={line.height}
        />
      ))}
      {geometry.frames.map((frame, index) => (
        <rect
          key={`frame-${index}`}
          className="fm-whole-frame"
          data-testid="bar-whole-frame"
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
        />
      ))}
    </RepresentationFrame>
  );
}
