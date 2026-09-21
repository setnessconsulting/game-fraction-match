/**
 * Stacked symbolic fraction (GAME-186).
 *
 * Renders the authored digits from the canonical formatter above and below a fraction rule. The
 * digits are SVG text with an explicit font size, because the legibility floor is a glyph-height
 * floor: shrinking the digits is exactly what a lane must avoid.
 */

import { accessibilityLabelFor, textAlternativeFor } from "../notation";
import { symbolicGeometry } from "../geometry/symbolic";
import { RepresentationFrame } from "./RepresentationFrame";
import { resolveBox, type BaseRepresentationProps } from "./types";

export type FractionSymbolProps = BaseRepresentationProps;

export function FractionSymbol({ fraction, whole, box, fluid, className }: FractionSymbolProps) {
  const resolvedBox = resolveBox("symbolic", box);
  const geometry = symbolicGeometry({ fraction, box: resolvedBox });

  return (
    <RepresentationFrame
      family="symbolic"
      fraction={fraction}
      whole={whole}
      box={resolvedBox}
      label={accessibilityLabelFor({ family: "symbolic", fraction, whole })}
      textAlternative={textAlternativeFor(fraction)}
      fluid={fluid}
      className={className}
    >
      <text
        className="fm-symbol__digit"
        data-testid="symbolic-numerator"
        data-font-size={geometry.fontSizePx}
        x={geometry.centerX}
        y={geometry.numeratorBaselineY}
        textAnchor="middle"
        fontSize={geometry.fontSizePx}
      >
        {geometry.numeratorText}
      </text>
      <rect
        className="fm-division"
        data-testid="symbolic-rule"
        data-orientation="horizontal"
        x={geometry.rule.x}
        y={geometry.rule.y}
        width={geometry.rule.width}
        height={geometry.rule.height}
      />
      <text
        className="fm-symbol__digit"
        data-testid="symbolic-denominator"
        data-font-size={geometry.fontSizePx}
        x={geometry.centerX}
        y={geometry.denominatorBaselineY}
        textAnchor="middle"
        fontSize={geometry.fontSizePx}
      >
        {geometry.denominatorText}
      </text>
    </RepresentationFrame>
  );
}
