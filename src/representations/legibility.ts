/**
 * Legibility policy (GAME-186).
 *
 * GAME-97's legibility contract says a lane must choose *another allowed representation* rather than
 * shrink a fraction until it cannot be read. This module is the mechanism behind that sentence:
 *
 * 1. it measures a candidate by building the real geometry for the intended box;
 * 2. it compares the measurements against the declared floors (8x8 px partition regions, 2 px
 *    division lines, 3:1 line contrast, readable tick and label spacing, readable glyph height);
 * 3. it returns the first legible candidate in the lane's declared order, or every problem it found.
 *
 * Nothing here decides mathematics: it decides whether a *picture* can be read. The engine still owns
 * whether two values are equal.
 */

import type { FractionValue, RepresentationBox, RepresentationFamily } from "./contract";
import { REPRESENTATION_FAMILIES } from "./contract";
import { barGeometry } from "./geometry/bar";
import { circleGeometry } from "./geometry/circle";
import { setGeometry } from "./geometry/setModel";
import { numberLineGeometry } from "./geometry/numberLine";
import { symbolicGeometry } from "./geometry/symbolic";
import type { GeometryMetrics } from "./geometry/metrics";
import {
  MIN_CARD_SIZE_CSS_PX,
  MIN_DIVISION_CONTRAST_RATIO,
  MIN_DIVISION_LINE_CSS_PX,
  MIN_PARTITION_REGION_CSS_PX,
  MIN_SYMBOL_GLYPH_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  MIN_TICK_SPACING_CSS_PX,
} from "./layout";
import { discreteSetWholeOf, numberLineWholeOf, type RepresentationWhole } from "./whole";

export {
  MIN_CARD_SIZE_CSS_PX,
  MIN_DIVISION_CONTRAST_RATIO,
  MIN_DIVISION_LINE_CSS_PX,
  MIN_PARTITION_REGION_CSS_PX,
  MIN_SYMBOL_GLYPH_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  MIN_TICK_SPACING_CSS_PX,
};

/**
 * The palette pair a division line is drawn against, per theme.
 *
 * These mirror `--fm-text` and `--fm-surface` in `src/app/globals.css`; a unit test parses that
 * stylesheet and fails if the two drift apart, so the contrast floor cannot be invalidated by a
 * palette edit.
 */
export const DIVISION_LINE_TOKENS: Readonly<
  Record<"light" | "dark", { readonly line: string; readonly surface: string }>
> = Object.freeze({
  light: Object.freeze({ line: "#1d2430", surface: "#ffffff" }),
  dark: Object.freeze({ line: "#eef1f5", surface: "#1c222b" }),
});

function parseHexColor(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (match === null || match[1] === undefined) {
    throw new Error(`expected a six-digit hex colour; received "${hex}"`);
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** WCAG relative luminance of a six-digit hex colour. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const channel = (component: number): number => {
    const scaled = component / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two six-digit hex colours. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The worst contrast a division line sees across the supported themes. */
export function divisionLineContrastRatio(): number {
  return Math.min(
    contrastRatio(DIVISION_LINE_TOKENS.light.line, DIVISION_LINE_TOKENS.light.surface),
    contrastRatio(DIVISION_LINE_TOKENS.dark.line, DIVISION_LINE_TOKENS.dark.surface),
  );
}

/** Everything needed to judge one candidate representation. */
export type LegibilityRequest = {
  readonly family: RepresentationFamily;
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  /** The whole the picture would draw. Required: a comparison is only meaningful with a declared whole. */
  readonly whole: RepresentationWhole;
  /** Lane-declared cap from GAME-187. Distinct from the physical floors. */
  readonly maxPartitionCount?: number;
};

export type LegibilityVerdict = {
  readonly family: RepresentationFamily;
  readonly legible: boolean;
  readonly metrics: GeometryMetrics;
  readonly divisionLineContrastRatio: number;
  readonly problems: readonly string[];
};

/** Build the geometry a family would draw for this request. Exported so fixtures cannot drift. */
export function measureGeometry(request: LegibilityRequest): GeometryMetrics {
  switch (request.family) {
    case "bar":
      return barGeometry({ fraction: request.fraction, box: request.box }).metrics;
    case "circle":
      return circleGeometry({ fraction: request.fraction, box: request.box }).metrics;
    case "set":
      return setGeometry({
        fraction: request.fraction,
        box: request.box,
        whole: discreteSetWholeOf(request.whole, "set legibility"),
      }).metrics;
    case "number-line":
      return numberLineGeometry({
        fraction: request.fraction,
        box: request.box,
        whole: numberLineWholeOf(request.whole, "number-line legibility"),
      }).metrics;
    case "symbolic":
      return symbolicGeometry({ fraction: request.fraction, box: request.box }).metrics;
  }
}

function partitionProblems(metrics: GeometryMetrics, family: RepresentationFamily): string[] {
  const region = metrics.partitionRegion;
  if (region === null) return [];

  const problems: string[] = [];
  if (region.width < MIN_PARTITION_REGION_CSS_PX) {
    problems.push(
      `${family} partition is ${region.width.toFixed(2)}px wide, below the ${MIN_PARTITION_REGION_CSS_PX}px floor`,
    );
  }
  if (region.height < MIN_PARTITION_REGION_CSS_PX) {
    problems.push(
      `${family} partition is ${region.height.toFixed(2)}px tall, below the ${MIN_PARTITION_REGION_CSS_PX}px floor`,
    );
  }
  return problems;
}

/**
 * Judge one candidate representation.
 *
 * Every failing floor is reported with the measured value, so a lane author can see *why* a family was
 * rejected instead of guessing.
 */
export function evaluateLegibility(request: LegibilityRequest): LegibilityVerdict {
  const metrics = measureGeometry(request);
  const problems: string[] = [];
  const lineContrast = divisionLineContrastRatio();

  if (request.maxPartitionCount !== undefined && request.fraction.denominator > request.maxPartitionCount) {
    problems.push(
      `${request.family} would need ${request.fraction.denominator} partitions, above this lane's declared maxPartitionCount of ${request.maxPartitionCount}`,
    );
  }

  problems.push(...partitionProblems(metrics, request.family));

  if (metrics.divisionLineThicknessPx < MIN_DIVISION_LINE_CSS_PX) {
    problems.push(
      `${request.family} division lines are ${metrics.divisionLineThicknessPx.toFixed(2)}px, below the ${MIN_DIVISION_LINE_CSS_PX}px floor`,
    );
  }

  if (lineContrast < MIN_DIVISION_CONTRAST_RATIO) {
    problems.push(
      `division lines only reach ${lineContrast.toFixed(2)}:1 contrast, below the ${MIN_DIVISION_CONTRAST_RATIO}:1 floor`,
    );
  }

  if (metrics.glyphPx !== null && metrics.glyphPx < MIN_SYMBOL_GLYPH_CSS_PX) {
    problems.push(
      `symbolic digits would render at ${metrics.glyphPx.toFixed(2)}px, below the ${MIN_SYMBOL_GLYPH_CSS_PX}px floor`,
    );
  }

  if (metrics.tickSpacingPx !== null && metrics.tickSpacingPx < MIN_TICK_SPACING_CSS_PX) {
    problems.push(
      `number-line ticks would sit ${metrics.tickSpacingPx.toFixed(2)}px apart, below the ${MIN_TICK_SPACING_CSS_PX}px floor`,
    );
  }

  if (metrics.tickLabelSpacingPx !== null && metrics.tickLabelSpacingPx < MIN_TICK_LABEL_SPACING_CSS_PX) {
    problems.push(
      `number-line labels would sit ${metrics.tickLabelSpacingPx.toFixed(2)}px apart, below the ${MIN_TICK_LABEL_SPACING_CSS_PX}px floor`,
    );
  }

  if (metrics.tickLabelCount !== null && metrics.tickLabelCount < 2) {
    problems.push(
      `number-line labels would collapse to ${metrics.tickLabelCount} label(s); at least 2 are required to read the axis`,
    );
  }

  return Object.freeze({
    family: request.family,
    legible: problems.length === 0,
    metrics,
    divisionLineContrastRatio: lineContrast,
    problems: Object.freeze(problems),
  });
}

/** One lane-allowed candidate, in the lane's declared preference order. */
export type RepresentationCandidate = {
  readonly family: RepresentationFamily;
  readonly maxPartitionCount?: number;
};

/**
 * Which whole a family would draw.
 *
 * A lane declares this per family because the whole kinds are not interchangeable: a bar needs a
 * continuous whole, a set needs a collection with a divisible total, a number line needs an axis.
 * Returning `null` means "this lane declares no whole for that family", which rejects the candidate
 * loudly instead of guessing.
 */
export type RepresentationWholeResolver = (family: RepresentationFamily) => RepresentationWhole | null;

/** A selection request: the value, the intended box, and the lane's declared wholes. */
export type RepresentationSelectionRequest = {
  readonly fraction: FractionValue;
  readonly box: RepresentationBox;
  readonly wholeFor: RepresentationWholeResolver;
};

/** Build a resolver from the wholes a lane declares. Unset families are unavailable, not guessed. */
export function representationWholes(spec: {
  readonly continuous?: RepresentationWhole;
  readonly set?: RepresentationWhole;
  readonly numberLine?: RepresentationWhole;
}): RepresentationWholeResolver {
  return (family: RepresentationFamily): RepresentationWhole | null => {
    switch (family) {
      case "symbolic":
      case "bar":
      case "circle":
        return spec.continuous ?? null;
      case "set":
        return spec.set ?? null;
      case "number-line":
        return spec.numberLine ?? null;
    }
  };
}

export type RepresentationRejection = {
  readonly family: RepresentationFamily;
  readonly problems: readonly string[];
};

export type RepresentationSelection =
  | {
      readonly ok: true;
      readonly family: RepresentationFamily;
      readonly verdict: LegibilityVerdict;
      readonly rejections: readonly RepresentationRejection[];
    }
  | {
      readonly ok: false;
      readonly problems: readonly string[];
      readonly rejections: readonly RepresentationRejection[];
    };

/**
 * Choose the first legible candidate, in the lane's declared order.
 *
 * Deterministic: same candidates, same fraction, same box, same whole -> same family, always. When no
 * candidate is legible the result carries every rejection so the failure is actionable.
 *
 * This function is total for *legibility*: a family too small to read is a rejection, never an error.
 * It still throws when a declared whole cannot represent the value at all — a set model of a value at or
 * above one whole, or a whole of the wrong kind for a family. Those are lane configuration errors, not
 * rendering choices, and they are loud on purpose.
 */
export function selectLegibleRepresentation(
  candidates: readonly RepresentationCandidate[],
  request: RepresentationSelectionRequest,
): RepresentationSelection {
  const rejections: RepresentationRejection[] = [];

  for (const candidate of candidates) {
    const whole = request.wholeFor(candidate.family);
    if (whole === null) {
      rejections.push(
        Object.freeze({
          family: candidate.family,
          problems: Object.freeze([
            `no whole is declared for ${candidate.family} in this lane, so the family cannot be drawn`,
          ]),
        }),
      );
      continue;
    }

    const verdict = evaluateLegibility({
      family: candidate.family,
      fraction: request.fraction,
      box: request.box,
      whole,
      ...(candidate.maxPartitionCount === undefined ? {} : { maxPartitionCount: candidate.maxPartitionCount }),
    });
    if (verdict.legible) {
      return Object.freeze({
        ok: true as const,
        family: candidate.family,
        verdict,
        rejections: Object.freeze(rejections),
      });
    }
    rejections.push(Object.freeze({ family: candidate.family, problems: verdict.problems }));
  }

  const problems = rejections.flatMap((rejection) =>
    rejection.problems.map((problem) => `${rejection.family}: ${problem}`),
  );

  return Object.freeze({
    ok: false as const,
    problems: Object.freeze(
      problems.length > 0
        ? problems
        : ["no representation candidates were supplied; a lane must declare at least one"],
    ),
    rejections: Object.freeze(rejections),
  });
}

/** Thrown when a lane's candidates cannot render a value legibly. Fails loudly, never shrinks. */
export class RepresentationLegibilityError extends Error {
  readonly problems: readonly string[];

  constructor(fraction: FractionValue, box: RepresentationBox, problems: readonly string[]) {
    super(
      `no legible representation for ${fraction.numerator}/${fraction.denominator} in a ${box.width}x${box.height}px box:\n- ${problems.join("\n- ")}`,
    );
    this.name = "RepresentationLegibilityError";
    this.problems = problems;
  }
}

/** Selection variant for generators: throws instead of returning a failure result. */
export function requireLegibleRepresentation(
  candidates: readonly RepresentationCandidate[],
  request: RepresentationSelectionRequest,
): { readonly family: RepresentationFamily; readonly verdict: LegibilityVerdict } {
  const selection = selectLegibleRepresentation(candidates, request);
  if (!selection.ok) {
    throw new RepresentationLegibilityError(request.fraction, request.box, selection.problems);
  }
  return Object.freeze({ family: selection.family, verdict: selection.verdict });
}

/** Every family, in canonical order — the default candidate list for diagnostics and fixtures. */
export function allRepresentationCandidates(): readonly RepresentationCandidate[] {
  return REPRESENTATION_FAMILIES.map((family) => Object.freeze({ family }));
}

/** Convenience for diagnostics: which families are legible for a value in a box, and why not. */
export function legibilityReport(request: RepresentationSelectionRequest): readonly {
  readonly family: RepresentationFamily;
  readonly legible: boolean;
  readonly problems: readonly string[];
}[] {
  return REPRESENTATION_FAMILIES.map((family) => {
    const whole = request.wholeFor(family);
    if (whole === null) {
      return Object.freeze({
        family,
        legible: false,
        problems: Object.freeze([`no whole is declared for ${family}`]),
      });
    }
    const verdict = evaluateLegibility({
      family,
      fraction: request.fraction,
      box: request.box,
      whole,
    });
    return Object.freeze({ family, legible: verdict.legible, problems: verdict.problems });
  });
}
