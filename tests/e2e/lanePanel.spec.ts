import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for the GAME-187 lane panel.
 *
 * The unit tests assert the plan; this journey asserts the *rendered* board, which is the only place the
 * plan's own claims can be falsified. It measures:
 *
 * - the real card size, and that one SVG user unit is one CSS pixel, so the size the lane was qualified at is
 *   the size a learner gets;
 * - that each card draws exactly one representation and that its family is the one the plan chose;
 * - that a pair the plan calls "two different families" really renders two different families;
 * - that every representation still exposes one accessible name stating value and whole, with no
 *   vulgar-fraction glyph;
 * - that a 320 px viewport reflows without pushing the board sideways;
 * - that axe finds no violation in the panel.
 *
 * The literals mirror the fixture lanes on purpose: this journey validates the shipped bundle, not the
 * modules it was built from.
 */

const EXPECTED_BOARDS: readonly { readonly laneId: string; readonly pairCount: number; readonly cardSize: number }[] = [
  { laneId: "fixture-warm-up", pairCount: 4, cardSize: 96 },
  { laneId: "fixture-eighths", pairCount: 3, cardSize: 96 },
  { laneId: "fixture-production-eight", pairCount: 8, cardSize: 96 },
];

test.describe("GAME-187 lane panel — shipped build", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#debug");
    await expect(page.getByTestId("lane-panel")).toBeVisible();
  });

  test("draws one board per fixture lane, with the pair count the lane declares", async ({ page }) => {
    const boards = page.getByTestId("lane-board");
    await expect(boards).toHaveCount(EXPECTED_BOARDS.length);

    for (const [index, expected] of EXPECTED_BOARDS.entries()) {
      const board = boards.nth(index);
      await expect(board).toHaveAttribute("data-lane-id", expected.laneId);
      await expect(board).toHaveAttribute("data-pair-count", String(expected.pairCount));
      await expect(board).toHaveAttribute("data-card-size", String(expected.cardSize));

      // One pair row per declared pair, and two cards in each.
      await expect(board.getByTestId("lane-pair")).toHaveCount(expected.pairCount);
      await expect(board.getByTestId("lane-card")).toHaveCount(expected.pairCount * 2);
      await expect(board.getByTestId("lane-cards").first().getByTestId("lane-card")).toHaveCount(2);
    }
  });

  test("draws exactly one representation per card, of the family the plan chose", async ({ page }) => {
    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="lane-card"]')).map((card) => ({
        representation: card.getAttribute("data-representation") ?? "",
        legible: card.getAttribute("data-legible") ?? "",
        svgCount: card.querySelectorAll("svg[role='img']").length,
        representationSvgs: Array.from(card.querySelectorAll("svg[data-testid^='representation-']")).map(
          (svg) => svg.getAttribute("data-testid") ?? "",
        ),
      })),
    );

    expect(measured.length).toBeGreaterThanOrEqual((4 + 3 + 8) * 2);
    for (const card of measured) {
      expect(card.svgCount, card.representation).toBe(1);
      expect(card.representationSvgs, card.representation).toEqual([`representation-${card.representation}-svg`]);
      expect(card.legible, card.representation).toBe("true");
    }
  });

  test("renders each card at exactly the lane's card box, unscaled", async ({ page }) => {
    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="lane-board"]')).flatMap((board) => {
        const declared = Number(board.getAttribute("data-card-size"));
        return Array.from(board.querySelectorAll('[data-testid="lane-card"]')).map((card) => {
          const surface = card.querySelector('[data-testid="lane-card-surface"]')!;
          const svg = card.querySelector("svg")!;
          const surfaceRect = surface.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const viewBox = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
          return {
            declared,
            surfaceWidth: surfaceRect.width,
            surfaceHeight: surfaceRect.height,
            svgWidth: svgRect.width,
            svgHeight: svgRect.height,
            viewBoxWidth: viewBox[2] ?? 0,
            viewBoxHeight: viewBox[3] ?? 0,
          };
        });
      }),
    );

    for (const card of measured) {
      expect(card.surfaceWidth).toBeCloseTo(card.declared, 2);
      expect(card.surfaceHeight).toBeCloseTo(card.declared, 2);
      // One SVG user unit must be one CSS pixel, otherwise every floor measured for the lane is a fiction.
      expect(card.svgWidth).toBeCloseTo(card.viewBoxWidth, 2);
      expect(card.svgHeight).toBeCloseTo(card.viewBoxHeight, 2);
    }
  });

  test("keeps a pair on two different representation families wherever the plan says it did", async ({ page }) => {
    const pairs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="lane-pair"]')).map((pair) => ({
        distinct: pair.getAttribute("data-distinct-representations") ?? "",
        families: Array.from(pair.querySelectorAll('[data-testid="lane-card"]')).map(
          (card) => card.getAttribute("data-representation") ?? "",
        ),
      })),
    );

    expect(pairs.length).toBeGreaterThanOrEqual(4 + 3 + 8);

    let distinctPairs = 0;
    for (const pair of pairs) {
      expect(pair.families).toHaveLength(2);
      const reallyDistinct = pair.families[0] !== pair.families[1];
      expect(reallyDistinct, pair.families.join(" vs ")).toBe(pair.distinct === "true");
      if (reallyDistinct) distinctPairs += 1;
    }

    // Every fixture lane asks for two different pictures per pair, so every pair must really be one.
    expect(distinctPairs).toBe(pairs.length);
  });

  test("names every representation for assistive technology, without a colour-only cue", async ({ page }) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="lane-panel"] svg[role="img"]')).map((svg) => ({
        label: svg.getAttribute("aria-label") ?? "",
        hiddenText: svg.parentElement?.querySelector(".fm-sr-only")?.textContent ?? "",
        ariaHidden: svg.parentElement?.querySelector(".fm-sr-only")?.getAttribute("aria-hidden"),
      })),
    );

    expect(labels.length).toBeGreaterThanOrEqual((4 + 3 + 8) * 2);
    for (const entry of labels) {
      expect(entry.label).toMatch(/^(Fraction symbol|Bar model|Circle model|Set model|Number line)/);
      expect(entry.label).toContain("Whole:");
      expect(entry.label).toMatch(/\d+\/\d+/);
      expect(entry.hiddenText).toMatch(/\d+\/\d+/);
      expect(entry.ariaHidden).toBe("true");
      expect(entry.label).not.toMatch(/[\u00BC-\u00BE\u2044\u2150-\u215F\u2189]/);
    }
  });

  test("keeps every pair's two cards inside one board that reflows at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForLoadState("networkidle");

    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      boardWidths: Array.from(document.querySelectorAll('[data-testid="lane-board"]')).map(
        (board) => board.getBoundingClientRect().width,
      ),
      cardWidths: Array.from(document.querySelectorAll('[data-testid="lane-card-surface"]')).map(
        (card) => card.getBoundingClientRect().width,
      ),
    }));

    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.innerWidth + 1);
    for (const width of measured.boardWidths) expect(width).toBeLessThanOrEqual(measured.innerWidth + 1);
    for (const width of measured.cardWidths) expect(width).toBeCloseTo(96, 2);
  });

  test("passes an axe scan of the lane panel subtree", async ({ page }) => {
    const axeBuilder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
    const results = await axeBuilder
      .include('[data-testid="lane-panel"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`),
    ).toEqual([]);
  });
});
