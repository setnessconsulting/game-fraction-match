/**
 * Compact number-line position (GAME-186).
 *
 * The axis, domain and scale come from the declared whole, so two number lines can only be drawn
 * against one shared axis. Labels are rendered at the exact font size the geometry reasoned about,
 * otherwise the label-spacing arithmetic would stop describing the picture.
 */

import { numberLineGeometry } from "../geometry/numberLine";
import { accessibilityLabelFor, textAlternativeFor } from "../notation";
import { numberLineWholeOf } from "../whole";
import { RepresentationFrame } from "./RepresentationFrame";
import { resolveBox, type BaseRepresentationProps } from "./types";

export type FractionNumberLineProps = BaseRepresentationProps;

export function FractionNumberLine({ fraction, whole, box, fluid, className }: FractionNumberLineProps) {
  const resolvedBox = resolveBox("number-line", box);
  const lineWhole = numberLineWholeOf(whole, "FractionNumberLine");
  const geometry = numberLineGeometry({ fraction, box: resolvedBox, whole: lineWhole });

  return (
    <RepresentationFrame
      family="number-line"
      fraction={fraction}
      whole={whole}
      box={resolvedBox}
      label={accessibilityLabelFor({ family: "number-line", fraction, whole })}
      textAlternative={textAlternativeFor(fraction)}
      fluid={fluid}
      className={className}
    >
      <rect
        className="fm-division"
        data-testid="number-line-baseline"
        data-orientation="horizontal"
        x={geometry.baseline.x}
        y={geometry.baseline.y}
        width={geometry.baseline.width}
        height={geometry.baseline.height}
      />
      {geometry.ticks.map((tick) => (
        <rect
          key={tick.tickIndex}
          className="fm-division"
          data-testid="number-line-tick"
          data-orientation="vertical"
          data-labelled={tick.labelled ? "true" : "false"}
          x={tick.mark.x}
          y={tick.mark.y}
          width={tick.mark.width}
          height={tick.mark.height}
        />
      ))}
      {geometry.labels.map((label) => (
        <text
          key={label.tickIndex}
          className="fm-number-line__label"
          data-testid="number-line-label"
          data-tick-index={label.tickIndex}
          x={label.x}
          y={geometry.point.y + geometry.labelFontSizePx * 2.4}
          textAnchor="middle"
          fontSize={geometry.labelFontSizePx}
        >
          {label.text}
        </text>
      ))}
      <circle
        className="fm-number-line__point"
        data-testid="number-line-point"
        data-fill="filled"
        data-tick-index={geometry.point.tickIndex}
        cx={geometry.point.x}
        cy={geometry.point.y}
        r={geometry.point.radius}
      />
    </RepresentationFrame>
  );
}
