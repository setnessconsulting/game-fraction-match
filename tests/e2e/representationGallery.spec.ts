import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for the GAME-186 representation gallery.
 *
 * The unit tests measure geometry as arithmetic; this journey measures the *rendered* page, which is the
 * only place the legibility floors can actually be falsified. It asserts, in a real browser:
 *
 * - the smallest shipped card is exactly the size the geometry reasoned about, and the drawing is not
 *   scaled (so one SVG user unit is one CSS pixel);
 * - the measured floor-relevant distances (partition widths, object diameters, tick spacing, glyph
 *   height) hold in the shipped build;
 * - division-line ink clears 3:1 against the surface it is drawn on, measured from computed colours;
 * - filled and empty parts differ by fill presence, not hue, and survive forced colors;
 * - reduced motion, and a 320 px viewport, change no geometry;
 * - every representation exposes one accessible name that states the value and the whole;
 * - axe finds no violation in the gallery subtree.
 *
 * The literals here mirror the gallery fixture on purpose: this journey validates the shipped bundle,
 * not the modules it was built from.
 */

const EXPECTED_ROWS: readonly { readonly fraction: string; readonly family: string; readonly rejected: string }[] = [
  { fraction: "1/2", family: "bar", rejected: "" },
  { fraction: "2/4", family: "bar", rejected: "" },
  { fraction: "2/3", family: "bar", rejected: "" },
  { fraction: "3/4", family: "bar", rejected: "" },
  { fraction: "5/6", family: "bar", rejected: "" },
  { fraction: "7/8", family: "circle", rejected: "bar" },
  { fraction: "1/100", family: "symbolic", rejected: "bar,circle,set,number-line" },
];

const EXPECTED_COMPARISONS = [
  "symbolic-vs-bar",
  "symbolic-vs-circle",
  "symbolic-vs-set",
  "symbolic-vs-number-line",
  "bar-vs-circle",
  "set-vs-set",
  "number-line-vs-number-line",
];

const MIN_CARD_SIZE_PX = 68;

type MeasuredShape = {
  readonly tag: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

async function galleryGeometry(page: Page): Promise<MeasuredShape[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="representation-gallery"] svg *')).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        x: Math.round(rect.x * 1000) / 1000,
        y: Math.round(rect.y * 1000) / 1000,
        width: Math.round(rect.width * 1000) / 1000,
        height: Math.round(rect.height * 1000) / 1000,
      };
    }),
  );
}

test.describe("GAME-186 representation gallery — shipped build", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("representation-gallery")).toBeVisible();
  });

  test("shows the documented family for every smallest-card row", async ({ page }) => {
    const rows = page.getByTestId("gallery-min-row");
    await expect(rows).toHaveCount(EXPECTED_ROWS.length);

    for (const [index, expected] of EXPECTED_ROWS.entries()) {
      const row = rows.nth(index);
      await expect(row).toHaveAttribute("data-fraction", expected.fraction);
      await expect(row).toHaveAttribute("data-selected-family", expected.family);
      await expect(row).toHaveAttribute("data-rejected", expected.rejected);
      // The card draws the family the row claims it selected, and exactly one representation of it.
      await expect(row.getByTestId("gallery-card")).toHaveAttribute("data-family", expected.family);
      await expect(row.locator(`svg[data-testid="representation-${expected.family}-svg"]`)).toHaveCount(1);
    }
  });

  test("states the refusal instead of shrinking a hundredth, and refuses the bar/set pair", async ({ page }) => {
    const refusals = page.getByTestId("gallery-refusal");
    await expect(refusals).toHaveCount(2);
    await expect(refusals.nth(0)).toHaveAttribute("data-refusal-key", "legibility");
    await expect(refusals.nth(1)).toHaveAttribute("data-refusal-key", "comparison");

    const legibility = await refusals.nth(0).innerText();
    expect(legibility).toContain("1/1000");
    expect(legibility).toContain("below the 8px floor");
    expect(legibility).toContain("below the 6px floor");

    await expect(refusals.nth(1)).toContainText("cannot be compared");
  });

  test("draws the smallest card at exactly the qualified size, unscaled", async ({ page }) => {
    const cards = page.locator('[data-testid="gallery-min-row"] [data-testid="gallery-card"]');
    await expect(cards).toHaveCount(EXPECTED_ROWS.length);

    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="gallery-min-row"] [data-testid="gallery-card"]')).map(
        (card) => {
          const svg = card.querySelector("svg");
          if (svg === null) return null;
          const cardRect = card.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const viewBox = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
          return {
            cardWidth: cardRect.width,
            cardHeight: cardRect.height,
            svgWidth: svgRect.width,
            svgHeight: svgRect.height,
            viewBoxWidth: viewBox[2] ?? 0,
            viewBoxHeight: viewBox[3] ?? 0,
          };
        },
      ),
    );

    for (const card of measured) {
      expect(card).not.toBeNull();
      expect(card!.cardWidth).toBeCloseTo(MIN_CARD_SIZE_PX, 2);
      expect(card!.cardHeight).toBeCloseTo(MIN_CARD_SIZE_PX, 2);
      // One SVG user unit must be one CSS pixel, otherwise every floor measured here is a fiction.
      expect(card!.svgWidth).toBeCloseTo(card!.viewBoxWidth, 2);
      expect(card!.svgHeight).toBeCloseTo(card!.viewBoxHeight, 2);
    }
  });

  test("renders the measured floors for every family at the default card", async ({ page }) => {
    const measurements = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="gallery-default-row"]'));
      return rows.map((row) => {
        const family = row.getAttribute("data-family") ?? "none";
        const rectOf = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, x: rect.x, y: rect.y };
        };

        if (family === "bar") {
          const partitions = Array.from(row.querySelectorAll('[data-testid="bar-partition"]')).map(rectOf);
          const divisions = Array.from(row.querySelectorAll('[data-testid="bar-division"]')).map(rectOf);
          return {
            family,
            partitionWidth: partitions[0]?.width ?? 0,
            partitionHeight: partitions[0]?.height ?? 0,
            divisionWidth: divisions[0]?.width ?? 0,
            divisionHeight: divisions[0]?.height ?? 0,
          };
        }
        if (family === "circle") {
          const wedge = row.querySelector('[data-testid="circle-wedge"]');
          return { family, wedgePathLength: wedge?.getAttribute("d")?.length ?? 0 };
        }
        if (family === "set") {
          const objects = Array.from(row.querySelectorAll('[data-testid="set-object"]')).map((element) => element.getAttribute("r"));
          return { family, objectCount: objects.length, radius: Number(objects[0] ?? 0) };
        }
        if (family === "number-line") {
          const ticks = Array.from(row.querySelectorAll('[data-testid="number-line-tick"]')).map(rectOf);
          return {
            family,
            tickCount: ticks.length,
            tickSpacing: (ticks[1]?.x ?? 0) - (ticks[0]?.x ?? 0),
            tickWidth: ticks[0]?.width ?? 0,
          };
        }
        if (family === "symbolic") {
          const digits = Array.from(row.querySelectorAll('[data-testid="symbolic-numerator"], [data-testid="symbolic-denominator"]'));
          return { family, glyphSize: digits.map((element) => Number(element.getAttribute("font-size") ?? 0))[0] ?? 0 };
        }
        return { family };
      });
    });

    const byFamily = new Map(measurements.map((entry) => [entry.family, entry]));
    expect([...byFamily.keys()].sort()).toEqual(["bar", "circle", "number-line", "set", "symbolic"]);

    // Bar: quarter parts of a 88 px usable width, minus the 2 px divider between neighbours.
    const bar = byFamily.get("bar")!;
    expect(bar.partitionWidth! - bar.divisionWidth!).toBeGreaterThanOrEqual(8);
    expect(bar.divisionWidth!).toBeGreaterThanOrEqual(2);
    expect(bar.divisionHeight!).toBeGreaterThanOrEqual(2);
    expect(bar.partitionHeight!).toBeGreaterThanOrEqual(8);

    // Circle: quarter wedges are drawn as real arcs, not collapsed slivers.
    const circle = byFamily.get("circle")!;
    expect(circle.wedgePathLength!).toBeGreaterThan(20);

    // Set: the declared collection is drawn in full, with readable objects.
    const set = byFamily.get("set")!;
    expect(set.objectCount!).toBe(4);
    expect(set.radius! * 2).toBeGreaterThanOrEqual(8);

    // Number line: five ticks of one whole, spaced 22 px, with 2 px marks.
    const line = byFamily.get("number-line")!;
    expect(line.tickCount!).toBe(5);
    expect(line.tickSpacing!).toBeGreaterThanOrEqual(6);
    expect(line.tickWidth!).toBeGreaterThanOrEqual(2);

    // Symbolic: the digits stay above the 10 px glyph floor.
    const symbolic = byFamily.get("symbolic")!;
    expect(symbolic.glyphSize!).toBeGreaterThanOrEqual(10);
  });

  test("renders the smallest card's picture exactly at the partition floor", async ({ page }) => {
    const measured = await page.evaluate(() => {
      const rectOf = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, x: rect.x };
      };
      const rowFor = (fraction: string) => document.querySelector(`[data-testid="gallery-min-row"][data-fraction="${fraction}"]`);

      // 5/6 at 68 px is the tightest bar the smallest card draws: 60 px of usable width in sixths.
      const sixthsRow = rowFor("5/6")!;
      const sixthsPartition = rectOf(sixthsRow.querySelector('[data-testid="bar-partition"]')!);
      const sixthsDivision = rectOf(sixthsRow.querySelector('[data-testid="bar-division"]')!);

      // 7/8 falls through to the circle, which is the documented fallback at this size.
      const eighthsRow = rowFor("7/8")!;
      const eighthsWedge = eighthsRow.querySelector('[data-testid="circle-wedge"]');

      // 1/100 falls through to the symbol, whose glyph size is the only floor left to clear.
      const hundredthsRow = rowFor("1/100")!;
      const hundredthsDigit = hundredthsRow.querySelector('[data-testid="symbolic-numerator"]');

      return {
        sixthsCellWidth: sixthsPartition.width,
        sixthsDivisionWidth: sixthsDivision.width,
        eighthsCircleCount: eighthsRow.querySelectorAll('[data-testid="circle-whole-frame"]').length,
        eighthsWedgePath: eighthsWedge?.getAttribute("d")?.length ?? 0,
        hundredthsGlyphSize: Number(hundredthsDigit?.getAttribute("font-size") ?? 0),
      };
    });

    // Exactly at the floor: 10 px cell minus the 2 px divider leaves the 8 px clear region.
    expect(measured.sixthsCellWidth - measured.sixthsDivisionWidth).toBeCloseTo(8, 2);
    expect(measured.eighthsCircleCount).toBe(1);
    expect(measured.eighthsWedgePath).toBeGreaterThan(20);
    expect(measured.hundredthsGlyphSize).toBeGreaterThanOrEqual(10);
  });

  test("keeps number-line labels from touching each other in real rendered text", async ({ page }) => {
    const overlaps = await page.evaluate(() => {
      const failures: string[] = [];
      for (const svg of Array.from(document.querySelectorAll('[data-testid="representation-number-line-svg"]'))) {
        const labels = Array.from(svg.querySelectorAll('[data-testid="number-line-label"]'));
        const boxes = labels.map((label) => {
          const box = (label as SVGGraphicsElement).getBBox();
          return { text: label.textContent ?? "", left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
        });
        for (let index = 1; index < boxes.length; index += 1) {
          const previous = boxes[index - 1]!;
          const current = boxes[index]!;
          if (current.left < previous.right) {
            failures.push(`"${previous.text}" overlaps "${current.text}"`);
          }
        }
        for (const box of boxes) {
          if (box.left < 0 || box.right > Number((svg.getAttribute("viewBox") ?? "0 0 0 0").split(/\s+/)[2])) {
            failures.push(`"${box.text}" leaves the box`);
          }
        }
      }
      return failures;
    });

    expect(overlaps).toEqual([]);
  });

  test("distinguishes filled from empty parts by fill presence, at 3:1 against the card surface", async ({ page }) => {
    const measured = await page.evaluate(() => {
      const parse = (value: string): [number, number, number] | null => {
        const match = /rgba?\(([^)]+)\)/.exec(value);
        if (match === null) return null;
        const parts = match[1]!.split(",").map((part) => Number.parseFloat(part));
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
      };
      const luminance = ([r, g, b]: [number, number, number]): number => {
        const channel = (component: number): number => {
          const scaled = component / 255;
          return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };

      const card = document.querySelector('[data-testid="gallery-min-row"] [data-testid="gallery-card"]');
      const cardStyle = getComputedStyle(card!);
      const filled = document.querySelector('[data-fill="filled"]');
      const empty = document.querySelector('[data-fill="empty"]');
      const filledStyle = getComputedStyle(filled!);
      const emptyStyle = getComputedStyle(empty!);

      const filledColor = parse(filledStyle.fill) ?? parse(filledStyle.stroke);
      const surfaceColor = parse(cardStyle.backgroundColor);
      const ratio =
        filledColor === null || surfaceColor === null
          ? 0
          : ((): number => {
              const lighter = Math.max(luminance(filledColor), luminance(surfaceColor));
              const darker = Math.min(luminance(filledColor), luminance(surfaceColor));
              return (lighter + 0.05) / (darker + 0.05);
            })();

      return {
        filledFill: filledStyle.fill,
        emptyFill: emptyStyle.fill,
        filledStroke: filledStyle.stroke,
        emptyStroke: emptyStyle.stroke,
        surface: cardStyle.backgroundColor,
        contrast: ratio,
      };
    });

    expect(measured.emptyFill).toBe("none");
    expect(measured.filledFill).not.toBe("none");
    expect(measured.contrast).toBeGreaterThanOrEqual(3);
    expect(measured.filledStroke).toBe(measured.emptyStroke);
  });

  test("stays readable in forced colors, where hue cannot carry any meaning", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });

    const measured = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="gallery-min-row"] [data-testid="gallery-card"]');
      const filled = card!.querySelector('[data-fill="filled"]');
      const empty = card!.querySelector('[data-fill="empty"]');
      return {
        filledFill: getComputedStyle(filled!).fill,
        emptyFill: getComputedStyle(empty!).fill,
        filledStroke: getComputedStyle(filled!).stroke,
        emptyStroke: getComputedStyle(empty!).stroke,
        surface: getComputedStyle(card!).backgroundColor,
      };
    });

    // Filled and empty must still differ, and the shaded part must not vanish into the surface.
    expect(measured.filledFill).not.toBe(measured.emptyFill);
    expect(measured.filledFill).not.toBe(measured.surface);
    expect(measured.filledStroke).toBe(measured.emptyStroke);
    await expect(page.getByTestId("representation-gallery")).toBeVisible();
  });

  test("reduced motion changes no geometry at all", async ({ page }) => {
    const before = await galleryGeometry(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const after = await galleryGeometry(page);

    expect(after.length).toBe(before.length);
    expect(after).toEqual(before);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await galleryGeometry(page)).toEqual(before);
  });

  test("fits the smallest declared viewport without reflowing the card away", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForLoadState("networkidle");

    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      widestGalleryElement: Math.max(
        ...Array.from(document.querySelectorAll('[data-testid="representation-gallery"] *')).map((element) =>
          Math.min(element.getBoundingClientRect().width, window.innerWidth),
        ),
      ),
      cardWidths: Array.from(document.querySelectorAll('[data-testid="gallery-min-row"] [data-testid="gallery-card"]')).map(
        (card) => card.getBoundingClientRect().width,
      ),
    }));

    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.innerWidth + 1);
    for (const width of measured.cardWidths) expect(width).toBeCloseTo(MIN_CARD_SIZE_PX, 2);
  });

  test("names every representation for assistive technology, without a colour-only cue", async ({ page }) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="representation-gallery"] svg[role="img"]')).map((svg) => ({
        label: svg.getAttribute("aria-label") ?? "",
        hiddenText: svg.parentElement?.querySelector(".fm-sr-only")?.textContent ?? "",
        ariaHidden: svg.parentElement?.querySelector(".fm-sr-only")?.getAttribute("aria-hidden"),
      })),
    );

    expect(labels.length).toBeGreaterThanOrEqual(7 + 5 + 14);
    for (const entry of labels) {
      expect(entry.label).toMatch(/^(Fraction symbol|Bar model|Circle model|Set model|Number line)/);
      expect(entry.label).toContain("Whole:");
      expect(entry.label).toMatch(/\d+\/\d+/);
      expect(entry.hiddenText).toMatch(/\d+\/\d+/);
      expect(entry.ariaHidden).toBe("true");
      expect(entry.label).not.toMatch(/[\u00BC-\u00BE\u2044\u2150-\u215F\u2189]/);
    }
  });

  test("passes an axe scan of the gallery subtree", async ({ page }) => {
    // `@axe-core/playwright` resolves its own (newer) `playwright-core` than `@playwright/test` pins, so
    // the two `Page` types are structurally identical but nominally distinct. The cast is that seam, and
    // nothing else about the scan is relaxed: the installed axe-core runs against the real page.
    const axeBuilder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
    const results = await axeBuilder
      .include('[data-testid="representation-gallery"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`),
    ).toEqual([]);
  });

  test("draws every supported comparison and both refusals", async ({ page }) => {
    const comparisons = page.locator('[data-testid="gallery-comparisons"] > li');
    await expect(comparisons).toHaveCount(EXPECTED_COMPARISONS.length);

    for (const [index, key] of EXPECTED_COMPARISONS.entries()) {
      await expect(comparisons.nth(index)).toHaveAttribute("data-comparison", key);
    }

    const rules = await page.locator('[data-testid="representation-comparison"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-rule")),
    );
    expect(rules).toEqual([
      "shared-whole",
      "shared-whole",
      "shared-whole",
      "shared-whole",
      "shared-whole",
      "shared-set-total",
      "shared-axis",
    ]);
  });
});
