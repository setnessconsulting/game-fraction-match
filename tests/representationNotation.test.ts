import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  REPRESENTATION_FAMILIES,
  VULGAR_FRACTION_GLYPHS,
  accessibilityLabelFor,
  canonicalNotation,
  canonicalSpokenNotation,
  compactNotation,
  containsVulgarFractionGlyph,
  denominatorWord,
  equivalenceClause,
  isCanonicalForm,
  numberToWords,
  ordinalWord,
  partStatement,
  shortLabelFor,
  spokenNotation,
  stackedNotation,
  textAlternativeFor,
  wholeText,
} from "../src/representations";
import { TEST_CONTINUOUS_WHOLE, representationFixture, testSetWhole } from "./representationFixtures";

/**
 * One canonical formatter owns the written digits, the spoken name and the copy/paste text, so these
 * tests keep all three pinned together — including the promise that no output ever leans on a
 * vulgar-fraction glyph for meaning.
 */

describe("number words", () => {
  it("spells cardinals up to the documented ceiling and falls back to digits beyond it", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(19)).toBe("nineteen");
    expect(numberToWords(20)).toBe("twenty");
    expect(numberToWords(21)).toBe("twenty-one");
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(105)).toBe("one hundred five");
    expect(numberToWords(999)).toBe("nine hundred ninety-nine");
    expect(numberToWords(1000)).toBe("1000");
    expect(numberToWords(-3)).toBe("minus three");
    expect(numberToWords(1.5)).toBe("1.5");
  });

  it("spells ordinals, including the composed and hundredth forms", () => {
    expect(ordinalWord(1)).toBe("first");
    expect(ordinalWord(4)).toBe("fourth");
    expect(ordinalWord(8)).toBe("eighth");
    expect(ordinalWord(12)).toBe("twelfth");
    expect(ordinalWord(20)).toBe("twentieth");
    expect(ordinalWord(21)).toBe("twenty-first");
    expect(ordinalWord(25)).toBe("twenty-fifth");
    expect(ordinalWord(100)).toBe("one hundredth");
    expect(ordinalWord(200)).toBe("two hundredth");
    expect(ordinalWord(1000)).toBe("one thousandth");
    expect(ordinalWord(0)).toBe("0");
    expect(ordinalWord(-1)).toBe("-1");
  });

  it("matches the denominator's plurality", () => {
    expect(denominatorWord(2, 1)).toBe("half");
    expect(denominatorWord(2, 3)).toBe("halves");
    expect(denominatorWord(4, 1)).toBe("fourth");
    expect(denominatorWord(4, 3)).toBe("fourths");
    expect(denominatorWord(8, 7)).toBe("eighths");
  });
});

describe("written and spoken notation", () => {
  it("keeps the authored digits and states the canonical value separately", () => {
    const form = createFractionForm(2, 4);
    expect(compactNotation(form)).toBe("2/4");
    expect(canonicalNotation(form.canonical)).toBe("1/2");
    expect(stackedNotation(form)).toEqual({ numeratorText: "2", denominatorText: "4" });
    expect(partStatement(form)).toBe("2 of 4 equal parts");
  });

  it("speaks the authored form, not its reduction", () => {
    expect(spokenNotation(createFractionForm(1, 2))).toBe("one half");
    expect(spokenNotation(createFractionForm(2, 4))).toBe("two fourths");
    expect(spokenNotation(createFractionForm(3, 2))).toBe("three halves");
    expect(spokenNotation(createFractionForm(0, 5))).toBe("zero");
    expect(spokenNotation(createFractionForm(1, 1))).toBe("one whole");
    expect(spokenNotation(createFractionForm(5, 1))).toBe("five wholes");
    expect(canonicalSpokenNotation(createFractionForm(2, 4).canonical)).toBe("one half");
  });

  it("adds the equivalence clause only when the authored form is reducible", () => {
    const reduced = createFractionForm(1, 2);
    const reducible = createFractionForm(2, 4);

    expect(isCanonicalForm(reduced)).toBe(true);
    expect(isCanonicalForm(reducible)).toBe(false);
    expect(equivalenceClause(reduced)).toBe("");
    expect(equivalenceClause(reducible)).toBe(" Equal to one half (1/2).");
    expect(textAlternativeFor(reduced)).toBe("1/2");
    expect(textAlternativeFor(reducible)).toBe("2/4 = 1/2");
  });
});

describe("vulgar-fraction policy", () => {
  it("recognises the glyphs the formatter must never depend on", () => {
    expect(VULGAR_FRACTION_GLYPHS.length).toBeGreaterThan(10);
    for (const glyph of VULGAR_FRACTION_GLYPHS) {
      expect(containsVulgarFractionGlyph(`shaded ${glyph} of the bar`)).toBe(true);
    }
    expect(containsVulgarFractionGlyph("2/4 of the bar")).toBe(false);
  });

  it("never emits one, for any value or family", () => {
    for (const fixture of [
      { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 4 },
      { numerator: 7, denominator: 8 },
      { numerator: 1, denominator: 100 },
    ]) {
      const value = representationFixture(fixture.numerator, fixture.denominator);
      const texts = [
        compactNotation(value.form),
        canonicalNotation(value.form.canonical),
        spokenNotation(value.form),
        canonicalSpokenNotation(value.form.canonical),
        textAlternativeFor(value.form),
        equivalenceClause(value.form),
        partStatement(value.form),
      ];
      for (const family of REPRESENTATION_FAMILIES) {
        const whole = value.wholes(family);
        if (whole === null) continue;
        texts.push(accessibilityLabelFor({ family, fraction: value.form, whole }));
        texts.push(shortLabelFor(family, value.form));
      }
      for (const text of texts) {
        expect(text, `${fixture.numerator}/${fixture.denominator}: "${text}"`).not.toMatch(/[\u00BC-\u00BE\u2044\u2150-\u215F\u2189]/);
        expect(containsVulgarFractionGlyph(text)).toBe(false);
      }
    }
  });
});

describe("accessible names", () => {
  it("names the symbolic form as what it is, with the whole stated in words", () => {
    expect(
      accessibilityLabelFor({ family: "symbolic", fraction: createFractionForm(2, 4), whole: TEST_CONTINUOUS_WHOLE }),
    ).toBe("Fraction symbol: two fourths (2/4). Equal to one half (1/2). Whole: one whole unit.");
  });

  it("names an area model by the parts it shaded", () => {
    expect(
      accessibilityLabelFor({ family: "bar", fraction: createFractionForm(2, 4), whole: TEST_CONTINUOUS_WHOLE }),
    ).toBe("Bar model showing 2 of 4 equal parts shaded: two fourths (2/4). Equal to one half (1/2). Whole: one whole unit.");

    expect(
      accessibilityLabelFor({ family: "circle", fraction: createFractionForm(1, 2), whole: TEST_CONTINUOUS_WHOLE }),
    ).toBe("Circle model showing 1 of 2 equal parts shaded: one half (1/2). Whole: one whole unit.");
  });

  it("names a set model by the objects selected out of the declared total", () => {
    expect(
      accessibilityLabelFor({ family: "set", fraction: createFractionForm(2, 4), whole: testSetWhole(8) }),
    ).toBe(
      "Set model showing 4 of 8 objects selected: two fourths (2/4). Equal to one half (1/2). Whole: one collection of 8 objects (8 objects in total).",
    );
  });

  it("names a number line by the position it marks", () => {
    expect(
      accessibilityLabelFor({ family: "number-line", fraction: createFractionForm(2, 4), whole: TEST_CONTINUOUS_WHOLE }),
    ).toBe("Number line with a point at two fourths (2/4). Equal to one half (1/2). Whole: one whole unit.");
  });

  it("refuses to name a set model against a whole it cannot count", () => {
    expect(() =>
      accessibilityLabelFor({ family: "set", fraction: createFractionForm(2, 4), whole: TEST_CONTINUOUS_WHOLE }),
    ).toThrow(/accessibilityLabelFor set requires a discrete-set whole; received continuous-whole/);
  });

  it("always ends with the declared whole, which is what makes a comparison honest", () => {
    for (const family of REPRESENTATION_FAMILIES) {
      const value = representationFixture(3, 4, { setTotalObjectCount: 8, ticksPerUnit: 4 });
      const whole = value.wholes(family);
      if (whole === null) throw new Error(`fixture declared no whole for ${family}`);
      const label = accessibilityLabelFor({ family, fraction: value.form, whole });
      expect(label.endsWith(`Whole: ${wholeText(whole)}.`)).toBe(true);
      expect(label).toContain("(3/4)");
      expect(label).toContain("three fourths");
    }
  });

  it("labels a short form for diagnostics without abbreviations", () => {
    expect(shortLabelFor("set", createFractionForm(3, 4))).toBe("Set model 3/4");
    expect(shortLabelFor("number-line", createFractionForm(1, 100))).toBe("Number line 1/100");
  });
});
