/**
 * Shared representation frame (GAME-186).
 *
 * Every primitive renders through this wrapper so accessibility and DOM structure stay identical
 * across families:
 *
 * - one `<svg role="img">` per representation, named by the canonical formatter;
 * - a visually hidden text alternative carrying the compact `n/d` text for copy/paste, marked
 *   `aria-hidden` so assistive technology hears the named image once instead of twice;
 * - declared facts (`data-*`) about the value and the whole, so fixtures and guards can assert the
 *   projection without reaching into geometry.
 *
 * No animation, no colour-only meaning and no state: the frame is a static projection. Motion and
 * interaction states belong to GAME-188/189/190.
 */

import type { ReactNode } from "react";

import type { FractionValue, RepresentationBox, RepresentationFamily } from "../contract";
import type { RepresentationWhole } from "../whole";

export type RepresentationFrameProps = {
  readonly family: RepresentationFamily;
  readonly fraction: FractionValue;
  readonly whole: RepresentationWhole;
  readonly box: RepresentationBox;
  /** The accessible name, produced by the canonical formatter. */
  readonly label: string;
  /** Compact copy/paste text, produced by the canonical formatter. */
  readonly textAlternative: string;
  readonly fluid?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

export function RepresentationFrame({
  family,
  fraction,
  whole,
  box,
  label,
  textAlternative,
  fluid = false,
  className,
  children,
}: RepresentationFrameProps) {
  const classNames = ["fm-representation", `fm-representation--${family}`];
  if (fluid) classNames.push("fm-representation--fluid");
  if (className !== undefined && className !== "") classNames.push(className);

  return (
    <span
      className={classNames.join(" ")}
      data-testid={`representation-${family}`}
      data-family={family}
      data-numerator={fraction.numerator}
      data-denominator={fraction.denominator}
      data-canonical={`${fraction.canonical.numerator}/${fraction.canonical.denominator}`}
      data-whole-id={whole.wholeId}
      data-whole-kind={whole.kind}
      data-box={`${box.width}x${box.height}`}
    >
      <svg
        className="fm-representation__svg"
        data-testid={`representation-${family}-svg`}
        role="img"
        aria-label={label}
        focusable="false"
        viewBox={`0 0 ${box.width} ${box.height}`}
        preserveAspectRatio="xMidYMid meet"
        {...(fluid ? { style: { width: "100%", height: "auto" } } : { width: box.width, height: box.height })}
      >
        {children}
      </svg>
      <span className="fm-sr-only" aria-hidden="true" data-testid={`representation-${family}-text`}>
        {textAlternative}
      </span>
    </span>
  );
}
