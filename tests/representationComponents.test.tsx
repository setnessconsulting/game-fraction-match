import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  REPRESENTATION_FAMILIES,
  REPRESENTATION_FAMILY_LABELS,
  FractionBar,
  FractionCircle,
  FractionComparison,
  FractionNumberLine,
  FractionSet,
  FractionSymbol,
  RepresentationByFamily,
  RepresentationContractError,
  accessibilityLabelFor,
  nominalBox,
  representationWholes,
  type RepresentationBox,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../src/representations";
import { TEST_CONTINUOUS_WHOLE, representationFixture, testNumberLineWhole, testSetWhole } from "./representationFixtures";

/**
 * The components are pure projections, so they can be asserted as markup in a plain Node test — no DOM,
 * no browser and no rendering library beyond React's own server renderer. These tests pin the three
 * things a learner and an assistive-technology user actually receive: the accessible name, the hidden
 * copy/paste text, and the fact that the shaded quantity is exposed as data rather than as colour.
 */

const BOX: RepresentationBox = { width: 96, height: 96 };

function markupFor(family: RepresentationFamily, options: {
  readonly numerator?: number;
  readonly denominator?: number;
  readonly whole?: RepresentationWhole;
  readonly box?: RepresentationBox;
  readonly fluid?: boolean;
} = {}): string {
  const fixture = representationFixture(options.numerator ?? 2, options.denominator ?? 4, {
    setTotalObjectCount: 8,
    ticksPerUnit: 4,
  });
  const whole = options.whole ?? fixture.wholes(family) ?? TEST_CONTINUOUS_WHOLE;

  return renderToStaticMarkup(
    <RepresentationByFamily
      family={family}
      fraction={fixture.form}
      whole={whole}
      {...(options.box === undefined ? { box: BOX } : { box: options.box })}
      {...(options.fluid === undefined ? {} : { fluid: options.fluid })}
    />,
  );
}

function countMatches(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe("shared frame", () => {
  it("renders one named image per representation, with the value and the whole as data", () => {
    const fixture = representationFixture(2, 4, { setTotalObjectCount: 8, ticksPerUnit: 4 });

    for (const family of REPRESENTATION_FAMILIES) {
      const markup = markupFor(family);
      const whole = fixture.wholes(family) ?? TEST_CONTINUOUS_WHOLE;
      const label = accessibilityLabelFor({ family, fraction: fixture.form, whole });

      expect(markup, family).toContain(`data-testid="representation-${family}"`);
      expect(markup, family).toContain(`data-family="${family}"`);
      expect(markup, family).toContain('data-numerator="2"');
      expect(markup, family).toContain('data-denominator="4"');
      expect(markup, family).toContain('data-canonical="1/2"');
      expect(markup, family).toContain(`data-whole-kind="${whole.kind}"`);
      expect(markup, family).toContain(`data-whole-id="${whole.wholeId}"`);
      expect(markup, family).toContain('data-box="96x96"');
      expect(markup, family).toContain('role="img"');
      expect(markup, family).toContain(`aria-label="${label}"`);
      expect(markup, family).toContain('viewBox="0 0 96 96"');
      expect(markup, family).toContain('width="96"');
      expect(markup, family).toContain('height="96"');
      expect(countMatches(markup, 'role="img"'), family).toBe(1);
    }
  });

  it("carries the compact copy/paste text in a hidden span, out of the accessibility tree", () => {
    const markup = markupFor("bar");
    expect(markup).toContain('class="fm-sr-only"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-testid="representation-bar-text">2/4 = 1/2</span>');
  });

  it("keeps the authored digits while stating one canonical value", () => {
    const quarter = markupFor("symbolic", { numerator: 2, denominator: 4 });
    const half = markupFor("symbolic", { numerator: 1, denominator: 2 });

    expect(quarter).not.toBe(half);
    expect(quarter).toContain('data-canonical="1/2"');
    expect(half).toContain('data-canonical="1/2"');
    expect(quarter).toContain('data-testid="symbolic-numerator"');
    expect(quarter).toContain('data-testid="symbolic-denominator"');
    expect(quarter).toContain(">2</text>");
    expect(quarter).toContain(">4</text>");
  });

  it("is deterministic: identical props produce identical markup", () => {
    expect(markupFor("circle")).toBe(markupFor("circle"));
  });

  it("falls back to the family's nominal box when none is given", () => {
    const fixture = representationFixture(2, 4);
    const markup = renderToStaticMarkup(<FractionBar fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} />);
    const nominal = nominalBox("bar");
    expect(markup).toContain(`viewBox="0 0 ${nominal.width} ${nominal.height}"`);
    expect(markup).toContain(`data-box="${nominal.width}x${nominal.height}"`);
  });

  it("scales to its container in fluid mode instead of fixing a pixel box", () => {
    const markup = markupFor("bar", { fluid: true });
    expect(markup).toContain("fm-representation--fluid");
    expect(markup).toContain('style="width:100%;height:auto"');
    expect(markup).not.toContain('width="96"');
  });

  it("lets a consumer add a class without losing the layer's own classes", () => {
    const fixture = representationFixture(2, 4);
    const markup = renderToStaticMarkup(
      <FractionSymbol fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} box={BOX} className="fm-card__ink" />,
    );
    expect(markup).toContain('class="fm-representation fm-representation--symbolic fm-card__ink"');
  });
});

describe("bar and circle projections", () => {
  it("exposes every part with an explicit filled/empty state, never a colour", () => {
    const markup = markupFor("bar");
    expect(countMatches(markup, 'data-testid="bar-partition"')).toBe(4);
    expect(countMatches(markup, 'data-fill="filled"')).toBe(2);
    expect(countMatches(markup, 'data-fill="empty"')).toBe(2);
    expect(countMatches(markup, 'data-testid="bar-division"')).toBe(3);
    expect(countMatches(markup, 'data-testid="bar-whole-frame"')).toBe(1);
  });

  it("draws a wedge per part and a divider per boundary", () => {
    const markup = markupFor("circle");
    expect(countMatches(markup, 'data-testid="circle-wedge"')).toBe(4);
    expect(countMatches(markup, 'data-testid="circle-division"')).toBe(4);
    expect(countMatches(markup, 'data-testid="circle-whole-frame"')).toBe(1);
    expect(countMatches(markup, 'data-fill="filled"')).toBe(2);
  });

  it("draws whole models plus a partial one above one whole", () => {
    const markup = markupFor(
      "bar",
      {
        numerator: 5,
        denominator: 4,
        whole: TEST_CONTINUOUS_WHOLE,
      },
    );
    // The fixture defaults to an eight-object collection, so 5/4 needs its own continuous whole here.
    expect(countMatches(markup, 'data-testid="bar-strip"')).toBe(2);
    expect(countMatches(markup, 'data-fill="filled"')).toBe(5);
  });
});

describe("set and number-line projections", () => {
  it("renders one object per declared total, with the selected count exposed as data", () => {
    const markup = markupFor("set", { whole: testSetWhole(8) });
    expect(countMatches(markup, 'data-testid="set-object"')).toBe(8);
    expect(countMatches(markup, 'data-fill="filled"')).toBe(4);
    expect(markup).toContain('data-whole-kind="discrete-set"');
    expect(markup).toContain("Set model showing 4 of 8 objects selected");
  });

  it("renders the baseline, every tick and the point at the exact value", () => {
    const markup = markupFor("number-line", { whole: representationFixture(2, 4, { ticksPerUnit: 4 }).numberLine });
    expect(countMatches(markup, 'data-testid="number-line-tick"')).toBe(5);
    expect(countMatches(markup, 'data-testid="number-line-label"')).toBe(5);
    expect(countMatches(markup, 'data-testid="number-line-baseline"')).toBe(1);
    expect(markup).toContain('data-testid="number-line-point"');
    expect(markup).toContain('data-tick-index="2"');
    expect(markup).toContain('font-size="10"');
  });

  it("refuses a whole of the wrong kind instead of drawing something meaningless", () => {
    const fixture = representationFixture(2, 4);
    expect(() =>
      renderToStaticMarkup(<FractionSet fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} box={BOX} />),
    ).toThrow(/FractionSet requires a discrete-set whole; received continuous-whole/);

    expect(() =>
      renderToStaticMarkup(<FractionNumberLine fraction={fixture.form} whole={testSetWhole(4)} box={BOX} />),
    ).toThrow(/FractionNumberLine requires a number-line-axis whole; received discrete-set/);
  });

  it("renders each family component directly as well as through the dispatcher", () => {
    const fixture = representationFixture(2, 4, { setTotalObjectCount: 8, ticksPerUnit: 4 });
    const direct = [
      renderToStaticMarkup(<FractionSymbol fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} box={BOX} />),
      renderToStaticMarkup(<FractionBar fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} box={BOX} />),
      renderToStaticMarkup(<FractionCircle fraction={fixture.form} whole={TEST_CONTINUOUS_WHOLE} box={BOX} />),
      renderToStaticMarkup(<FractionSet fraction={fixture.form} whole={fixture.set} box={BOX} />),
      renderToStaticMarkup(<FractionNumberLine fraction={fixture.form} whole={fixture.numberLine} box={BOX} />),
    ];

    for (const family of REPRESENTATION_FAMILIES) {
      expect(direct).toContain(markupFor(family));
    }
    expect(REPRESENTATION_FAMILY_LABELS.bar).toBe("Bar model");
  });
});

describe("comparison view", () => {
  it("states the shared whole once and renders both sides", () => {
    const fixture = representationFixture(2, 4);
    const markup = renderToStaticMarkup(
      <FractionComparison
        left={{ family: "symbolic", fraction: createFractionForm(1, 2), whole: TEST_CONTINUOUS_WHOLE }}
        right={{ family: "bar", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
        box={BOX}
      />,
    );

    expect(markup).toContain('data-testid="representation-comparison"');
    expect(markup).toContain('data-pair="symbolic--bar"');
    expect(markup).toContain('data-rule="shared-whole"');
    expect(markup).toContain('data-shared-whole-id="test-unit-whole"');
    expect(markup).toContain("Same whole: one whole unit");
    expect(countMatches(markup, 'role="img"')).toBe(2);
    expect(markup).toContain('aria-label="Fraction symbol: one half (1/2). Whole: one whole unit."');
  });

  it("reports the shared-axis rule for a number-line pair", () => {
    const fixture = representationFixture(2, 4, { ticksPerUnit: 8 });
    const equivalent = representationFixture(1, 2, { ticksPerUnit: 8 });
    const markup = renderToStaticMarkup(
      <FractionComparison
        left={{ family: "number-line", fraction: fixture.form, whole: fixture.numberLine }}
        right={{ family: "number-line", fraction: equivalent.form, whole: equivalent.numberLine }}
        box={BOX}
      />,
    );

    expect(markup).toContain('data-rule="shared-axis"');
    expect(markup).toContain('data-pair="number-line--number-line"');
  });

  it("refuses to draw a pair with no shared whole definition", () => {
    const fixture = representationFixture(2, 4);
    expect(() =>
      renderToStaticMarkup(
        <FractionComparison
          left={{ family: "bar", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
          right={{ family: "set", fraction: fixture.form, whole: testSetWhole(4) }}
          box={BOX}
        />,
      ),
    ).toThrow(/outside the supported comparison matrix/);
  });

  it("refuses two different whole identities", () => {
    const fixture = representationFixture(2, 4);
    expect(() =>
      renderToStaticMarkup(
        <FractionComparison
          left={{ family: "bar", fraction: fixture.form, whole: testNumberLineWhole(4) }}
          right={{ family: "circle", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
          box={BOX}
        />,
      ),
    ).toThrow(RepresentationContractError);
  });

  it("can scale to its container and take a consumer class", () => {
    const fixture = representationFixture(2, 4);
    const markup = renderToStaticMarkup(
      <FractionComparison
        left={{ family: "bar", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
        right={{ family: "circle", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
        box={BOX}
        fluid
        className="fm-comparison--wide"
      />,
    );

    expect(markup).toContain('class="fm-comparison fm-comparison--fluid fm-comparison--wide"');
    expect(countMatches(markup, "fm-representation--fluid")).toBe(2);
  });

  it("lets one side carry its own box while the other uses the shared box", () => {
    const fixture = representationFixture(2, 4);
    const markup = renderToStaticMarkup(
      <FractionComparison
        left={{ family: "bar", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE, box: { width: 160, height: 96 } }}
        right={{ family: "circle", fraction: fixture.form, whole: TEST_CONTINUOUS_WHOLE }}
        box={BOX}
      />,
    );

    expect(markup).toContain('data-box="160x96"');
    expect(markup).toContain('data-box="96x96"');
  });

  it("shares one whole resolver across a comparison, so both sides declare the same collection", () => {
    const left = representationFixture(2, 4, { setTotalObjectCount: 8 });
    const right = representationFixture(4, 8, { setTotalObjectCount: 8 });
    const resolver = representationWholes({ set: left.set });

    expect(resolver("set")).toBe(left.set);
    const markup = renderToStaticMarkup(
      <FractionComparison
        left={{ family: "set", fraction: left.form, whole: left.set }}
        right={{ family: "set", fraction: right.form, whole: right.set }}
        box={{ width: 120, height: 120 }}
      />,
    );
    expect(markup).toContain('data-rule="shared-set-total"');
    expect(markup).toContain("Set model showing 4 of 8 objects selected");
  });
});
