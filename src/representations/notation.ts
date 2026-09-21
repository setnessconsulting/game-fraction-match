/**
 * The canonical fraction formatter (GAME-186).
 *
 * GAME-97 requires "one canonical formatter" that owns visual fraction notation, the spoken
 * accessible name and compact `n/d` text. This module is that owner. Every representation family
 * calls it, so the stacked digits, the screen-reader sentence and the copy-paste text can never
 * drift apart.
 *
 * VULGAR-FRACTION POLICY
 * No output of this module contains a vulgar-fraction glyph (`½`, `⅓`, `⁄`, ...). The authored form
 * is always spelled as `n/d` with an ASCII solidus plus a spoken name, which keeps the text
 * machine-readable, greppable and copy-pasteable for assistive technology and for tests. A vulgar
 * glyph is therefore never the sole semantic representation of a value.
 *
 * The formatter describes the *authored* form (so `2/4` stays `2/4`) and mentions the canonical value
 * only as a stated equivalence. It never decides equivalence itself.
 */

import type { CanonicalValue, FractionValue, RepresentationFamily } from "./contract";
import { REPRESENTATION_FAMILY_LABELS } from "./contract";
import { discreteSetWholeOf, setSelection, wholeText, type RepresentationWhole } from "./whole";

/**
 * Vulgar-fraction glyphs and fraction-slash punctuation deliberately never emitted by this module.
 *
 * Sources: U+00BC..U+00BE, U+2044, U+2150..U+215F, U+2189.
 */
export const VULGAR_FRACTION_GLYPHS: readonly string[] = [
  "\u00BC",
  "\u00BD",
  "\u00BE",
  "\u2044",
  "\u2150",
  "\u2151",
  "\u2152",
  "\u2153",
  "\u2154",
  "\u2155",
  "\u2156",
  "\u2157",
  "\u2158",
  "\u2159",
  "\u215A",
  "\u215B",
  "\u215C",
  "\u215D",
  "\u215E",
  "\u215F",
  "\u2189",
];

/** Whether text contains any glyph this formatter must never rely on. */
export function containsVulgarFractionGlyph(text: string): boolean {
  return VULGAR_FRACTION_GLYPHS.some((glyph) => text.includes(glyph));
}

const UNITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"] as const;

const ORDINALS: Readonly<Record<number, string>> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  5: "fifth",
  6: "sixth",
  7: "seventh",
  8: "eighth",
  9: "ninth",
  10: "tenth",
  11: "eleventh",
  12: "twelfth",
  13: "thirteenth",
  14: "fourteenth",
  15: "fifteenth",
  16: "sixteenth",
  17: "seventeenth",
  18: "eighteenth",
  19: "nineteenth",
  20: "twentieth",
  30: "thirtieth",
  40: "fortieth",
  50: "fiftieth",
  60: "sixtieth",
  70: "seventieth",
  80: "eightieth",
  90: "ninetieth",
};

function unitWord(value: number): string {
  return UNITS[value] ?? String(value);
}

/** Cardinal word for a whole number. Values outside 0..999 fall back to digits, deterministically. */
export function numberToWords(value: number): string {
  if (!Number.isSafeInteger(value)) return String(value);
  if (value < 0) return `minus ${numberToWords(-value)}`;
  if (value < UNITS.length) return unitWord(value);
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? String(Math.floor(value / 10) * 10);
    const unit = value % 10;
    return unit === 0 ? tens : `${tens}-${unitWord(unit)}`;
  }
  if (value < 1000) {
    const hundreds = `${unitWord(Math.floor(value / 100))} hundred`;
    const rest = value % 100;
    return rest === 0 ? hundreds : `${hundreds} ${numberToWords(rest)}`;
  }
  return String(value);
}

/** Ordinal word for a whole number (`4` -> `fourth`, `21` -> `twenty-first`). */
export function ordinalWord(value: number): string {
  const direct = ORDINALS[value];
  if (direct !== undefined) return direct;
  if (!Number.isSafeInteger(value) || value <= 0) return String(value);
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)];
    if (tens !== undefined && tens !== "") return `${tens}-${ordinalWord(value % 10)}`;
  }
  if (value < 1000 && value % 100 === 0) return `${unitWord(value / 100)} hundredth`;
  if (value < 1000) return `${unitWord(Math.floor(value / 100))} hundred ${ordinalWord(value % 100)}`;
  if (value % 1000 === 0) return `${numberToWords(value / 1000)} thousandth`;
  return `${numberToWords(value)}-th`;
}

/** Denominator word matching the numerator's plurality (`1/2` -> `half`, `3/2` -> `halves`). */
export function denominatorWord(denominator: number, numerator: number): string {
  if (denominator === 2) return numerator === 1 ? "half" : "halves";
  const singular = ordinalWord(denominator);
  return numerator === 1 ? singular : `${singular}s`;
}

/** Compact authored text, `2/4`. Always an ASCII solidus. */
export function compactNotation(fraction: FractionValue): string {
  return `${fraction.numerator}/${fraction.denominator}`;
}

/** Compact canonical text, `1/2`. Always an ASCII solidus. */
export function canonicalNotation(value: CanonicalValue): string {
  return `${value.numerator}/${value.denominator}`;
}

/** The two digits a stacked symbolic view renders, plus the fact that they are authored digits. */
export function stackedNotation(fraction: FractionValue): {
  readonly numeratorText: string;
  readonly denominatorText: string;
} {
  return Object.freeze({
    numeratorText: String(fraction.numerator),
    denominatorText: String(fraction.denominator),
  });
}

/** Spoken name of the authored form, `2/4` -> `two fourths`. */
export function spokenNotation(fraction: FractionValue): string {
  if (fraction.numerator === 0) return "zero";
  if (fraction.denominator === 1) {
    return fraction.numerator === 1 ? "one whole" : `${numberToWords(fraction.numerator)} wholes`;
  }
  return `${numberToWords(fraction.numerator)} ${denominatorWord(fraction.denominator, fraction.numerator)}`;
}

/** Spoken name of the canonical value, `1/2` -> `one half`. */
export function canonicalSpokenNotation(value: CanonicalValue): string {
  return spokenNotation({ numerator: value.numerator, denominator: value.denominator, canonical: value });
}

/** How many equal parts the authored form names, `2/4` -> `2 of 4 equal parts`. */
export function partStatement(fraction: FractionValue): string {
  return `${fraction.numerator} of ${fraction.denominator} equal parts`;
}

/** Whether the authored form is already the canonical form (used for the equivalence clause). */
export function isCanonicalForm(fraction: FractionValue): boolean {
  return fraction.numerator === fraction.canonical.numerator && fraction.denominator === fraction.canonical.denominator;
}

/**
 * The "which equals ..." clause, present only when the authored form is not already canonical.
 * Empty otherwise so names stay short for reduced forms.
 */
export function equivalenceClause(fraction: FractionValue): string {
  if (isCanonicalForm(fraction)) return "";
  return ` Equal to ${canonicalSpokenNotation(fraction.canonical)} (${canonicalNotation(fraction.canonical)}).`;
}

/** The text alternative a representation exposes for copy/paste and assistive technology. */
export function textAlternativeFor(fraction: FractionValue): string {
  const compact = compactNotation(fraction);
  return isCanonicalForm(fraction) ? compact : `${compact} = ${canonicalNotation(fraction.canonical)}`;
}

/** Everything the formatter needs to name one representation. */
export type AccessibilityLabelInput = {
  readonly family: RepresentationFamily;
  readonly fraction: FractionValue;
  readonly whole: RepresentationWhole;
};

/**
 * The single accessible name for a representation.
 *
 * Every family gets: what it is, what quantity it shows, the spoken and compact authored form, the
 * stated equivalence when the form is reducible, and an explicit statement of the declared whole
 * (which is what makes symbolic↔visual comparisons honest).
 */
export function accessibilityLabelFor(input: AccessibilityLabelInput): string {
  const { family, fraction, whole } = input;
  const label = REPRESENTATION_FAMILY_LABELS[family];
  const spoken = spokenNotation(fraction);
  const compact = compactNotation(fraction);
  const equivalence = equivalenceClause(fraction);

  switch (family) {
    case "symbolic":
      return `${label}: ${spoken} (${compact}).${equivalence} Whole: ${wholeText(whole)}.`;
    case "bar":
    case "circle":
      return `${label} showing ${partStatement(fraction)} shaded: ${spoken} (${compact}).${equivalence} Whole: ${wholeText(whole)}.`;
    case "set": {
      // Naming a set model needs the collection size, so a mismatched whole must fail here with the
      // same message every other set-family entry point uses instead of pricing a collection of zero.
      const selection = setSelection(fraction, discreteSetWholeOf(whole, "accessibilityLabelFor set"));
      return `${label} showing ${selection.selectedCount} of ${selection.totalObjectCount} objects selected: ${spoken} (${compact}).${equivalence} Whole: ${wholeText(whole)}.`;
    }
    case "number-line":
      return `${label} with a point at ${spoken} (${compact}).${equivalence} Whole: ${wholeText(whole)}.`;
  }
}

/** Short label used by fixtures and diagnostics: `Bar model 2/4`. */
export function shortLabelFor(family: RepresentationFamily, fraction: FractionValue): string {
  return `${REPRESENTATION_FAMILY_LABELS[family]} ${compactNotation(fraction)}`;
}
