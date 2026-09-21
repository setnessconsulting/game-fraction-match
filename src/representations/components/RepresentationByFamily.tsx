/**
 * Family dispatcher (GAME-186).
 *
 * Renders one representation for a family chosen at runtime — the shape a lane needs after
 * `selectLegibleRepresentation` picks a family. Each family narrows the declared whole to the kind it
 * can draw, so passing a set whole to a bar fails loudly instead of drawing something meaningless.
 */

import type { RepresentationFamily } from "../contract";
import { FractionBar } from "./FractionBar";
import { FractionCircle } from "./FractionCircle";
import { FractionNumberLine } from "./FractionNumberLine";
import { FractionSet } from "./FractionSet";
import { FractionSymbol } from "./FractionSymbol";
import type { BaseRepresentationProps } from "./types";

export type RepresentationByFamilyProps = BaseRepresentationProps & {
  readonly family: RepresentationFamily;
};

export function RepresentationByFamily({ family, ...rest }: RepresentationByFamilyProps) {
  switch (family) {
    case "symbolic":
      return <FractionSymbol {...rest} />;
    case "bar":
      return <FractionBar {...rest} />;
    case "circle":
      return <FractionCircle {...rest} />;
    case "set":
      return <FractionSet {...rest} />;
    case "number-line":
      return <FractionNumberLine {...rest} />;
  }
}
