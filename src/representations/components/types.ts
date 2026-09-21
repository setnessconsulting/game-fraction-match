/**
 * Shared component props (GAME-186).
 *
 * Every primitive takes the same shape: an authored fraction, the whole it draws, and the box those
 * coordinates are authored for. The whole is a *required* prop on purpose — a picture without a
 * declared whole cannot take part in a meaningful comparison, so the type system makes the mistake
 * impossible rather than documenting it away.
 */

import type { FractionValue, RepresentationBox, RepresentationFamily } from "../contract";
import { nominalBox } from "../layout";
import type { RepresentationWhole } from "../whole";

export type BaseRepresentationProps = {
  /** Authored fraction. An engine `FractionForm` satisfies this structurally. */
  readonly fraction: FractionValue;
  /** The mathematical whole this picture draws. Required, never inferred. */
  readonly whole: RepresentationWhole;
  /** Drawing box in CSS px. Defaults to the family's nominal box. */
  readonly box?: RepresentationBox;
  /** When true the SVG scales to its container width instead of a fixed pixel box. */
  readonly fluid?: boolean;
  readonly className?: string;
};

/** The box a component will draw in. */
export function resolveBox(family: RepresentationFamily, box: RepresentationBox | undefined): RepresentationBox {
  return box ?? nominalBox(family);
}
