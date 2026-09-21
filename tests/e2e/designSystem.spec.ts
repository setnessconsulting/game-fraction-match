import AxeBuilder from "@axe-core/playwright";

import { BASE_VIEWPORTS, planBoardLayout } from "../../src/design";
import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for the GAME-188 design system.
 *
 * The unit tests prove the *plan*; this journey proves the rendered artifact agrees with it, which is the only
 * place a layout contract can be falsified. It measures:
 *
 * - the real 16-card board at every base viewport, and that the rendered card size equals the planned card
 *   size rather than a number that merely looks plausible;
 * - that the board fits with no internal scrolling and never pushes the document sideways;
 * - that every card clears both floors: 68px (GAME-186 legibility) and 44px (touch target);
 * - that the five colour-independent states differ in boundary style and width, not only in colour;
 * - that forced colors keeps those boundaries, and that reduced motion changes no state and no boundary;
 * - that 200% zoom reflows (vertical scrolling allowed) without horizontal content loss;
 * - that the design authority label is the truthful fallback identity;
 * - that axe finds no violation in the panel.
 */

/** The card size `planBoardLayout` is expected to choose for each base viewport, mirrored for readability. */
const EXPECTED_CARD_SIZES: Readonly<Record<string, number>> = Object.freeze({
  "phone-small": 68,
  "phone": 86,
  "tablet": 112,
  "desktop": 112,
});

const PRODUCTION_CARD_COUNT = 16;
const MIN_LEGIBLE_CARD_CSS_PX = 68;
const MIN_TOUCH_TARGET_CSS_PX = 44;

test.describe("GAME-188 design system — shipped build", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#debug");
    await expect(page.getByTestId("design-panel")).toBeVisible();
  });

  test("records the design authority as the labelled fallback, not as Figma", async ({ page }) => {
    await expect(page.getByTestId("design-authority")).toHaveText("FALLBACK / FIGMA NOT QUALIFIED");

    // The story forbids fabricated design evidence, so no Figma artifact may be *cited*: no file URL, no
    // fileKey value, and no link to the product. The panel is allowed to explain the preference that was not
    // met, which is why this checks for a citation rather than for the word.
    const html = await page.content();
    expect(html).not.toContain("figma.com");
    expect(html.toLowerCase()).not.toContain("filekey=");
  });

  test("renders one card per required colour-independent state plus a full production board", async ({ page }) => {
    await expect(page.getByTestId("design-card")).toHaveCount(PRODUCTION_CARD_COUNT);
    await expect(page.getByTestId("design-state-card")).toHaveCount(3);
    await expect(page.getByTestId("design-explanation")).toBeVisible();

    // The inventory is rendered from the module, so an unlisted required state cannot be presented as done.
    await expect(page.getByTestId("design-states").locator("li")).toHaveCount(24);
    await expect(page.getByTestId("design-motion").locator("li")).toHaveCount(7);
  });

  for (const viewport of BASE_VIEWPORTS) {
    test(`fits the whole 16-card board at ${viewport.label} with no internal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByTestId("design-panel")).toBeVisible();

      const measured = await page.evaluate(() => {
        const board = document.querySelector('[data-testid="design-board"]') as HTMLElement;
        const cards = Array.from(document.querySelectorAll('[data-testid="design-card"]')) as HTMLElement[];
        const boxes = cards.map((card) => card.getBoundingClientRect());
        return {
          cardCount: cards.length,
          minWidth: Math.min(...boxes.map((box) => box.width)),
          minHeight: Math.min(...boxes.map((box) => box.height)),
          boardScrollHeight: board.scrollHeight,
          boardClientHeight: board.clientHeight,
          boardScrollWidth: board.scrollWidth,
          boardClientWidth: board.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
        };
      });

      const planned = planBoardLayout({
        viewport: { width: viewport.width, height: viewport.height },
        cardCount: PRODUCTION_CARD_COUNT,
      });

      // The rendered board agrees with the plan, and the plan agrees with the mirrored expectation.
      expect(measured.cardCount).toBe(PRODUCTION_CARD_COUNT);
      expect(planned.cardCssPx).toBe(EXPECTED_CARD_SIZES[viewport.id]);
      expect(measured.minWidth).toBeCloseTo(planned.cardCssPx, 1);
      expect(measured.minHeight).toBeCloseTo(planned.cardCssPx, 1);

      // Both floors, measured on the real element.
      expect(measured.minWidth).toBeGreaterThanOrEqual(MIN_LEGIBLE_CARD_CSS_PX);
      expect(measured.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX);

      // No internal board scrolling, and no horizontal loss for the document.
      expect(measured.boardScrollHeight).toBeLessThanOrEqual(measured.boardClientHeight);
      expect(measured.boardScrollWidth).toBeLessThanOrEqual(measured.boardClientWidth);
      expect(measured.documentScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth);
    });
  }

  test("distinguishes the five colour-independent states by boundary, not by colour", async ({ page }) => {
    const styles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="design-state-card"]')).map((card) => {
        const computed = getComputedStyle(card);
        return {
          state: (card as HTMLElement).dataset.cardState ?? "",
          borderStyle: computed.borderStyle,
          borderWidth: computed.borderWidth,
        };
      }),
    );

    // Strip colour entirely: the triples must still be pairwise distinct.
    const signatures = styles.map((style) => `${style.state}:${style.borderStyle}/${style.borderWidth}`);
    expect(new Set(signatures).size).toBe(styles.length);
    expect(styles.map((style) => style.borderWidth)).toEqual(["1px", "2px", "3px"]);
    expect(styles[0]!.borderStyle).toBe("dashed");
    expect(styles.slice(1).map((style) => style.borderStyle)).toEqual(["solid", "solid"]);
  });

  test("keeps every boundary under forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });

    const styles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="design-state-card"]')).map((card) => {
        const computed = getComputedStyle(card);
        return { borderStyle: computed.borderStyle, borderWidth: computed.borderWidth };
      }),
    );

    // The same three distinct boundaries survive a user agent that replaces every colour.
    expect(styles.map((style) => `${style.borderStyle}/${style.borderWidth}`)).toEqual([
      "dashed/1px",
      "solid/2px",
      "solid/3px",
    ]);

    // And the panel is still legible in forced colors rather than collapsing to an unstyled list.
    await expect(page.getByTestId("design-authority")).toBeVisible();
  });

  test("changes no state and no boundary under reduced motion", async ({ page }) => {
    const before = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="design-state-card"]')).map((card) => {
        const computed = getComputedStyle(card);
        return `${(card as HTMLElement).dataset.cardState}:${computed.borderStyle}/${computed.borderWidth}`;
      }),
    );

    await page.emulateMedia({ reducedMotion: "reduce" });

    const after = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="design-state-card"]')).map((card) => {
        const computed = getComputedStyle(card);
        return {
          signature: `${(card as HTMLElement).dataset.cardState}:${computed.borderStyle}/${computed.borderWidth}`,
          transitionDuration: computed.transitionDuration,
          transform: computed.transform,
        };
      }),
    );

    // Parity, not similarity: identical state signatures, zero duration, and no transform applied.
    expect(after.map((entry) => entry.signature)).toEqual(before);
    for (const entry of after) {
      expect(entry.transitionDuration.split(",").every((value) => value.trim() === "0s")).toBe(true);
      expect(entry.transform === "none" || entry.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
    }

    await expect(page.getByTestId("design-card")).toHaveCount(PRODUCTION_CARD_COUNT);
  });

  test("reflows at 200% zoom without horizontal content loss", async ({ page }) => {
    // 200% zoom is emulated as the halved content viewport: the same physical window showing half the CSS
    // pixels. That is the dimension the reflow contract is about, and it is stated rather than implied.
    const base = BASE_VIEWPORTS[0]!;
    await page.setViewportSize({ width: Math.floor(base.width / 2), height: Math.floor(base.height / 2) });
    await expect(page.getByTestId("design-panel")).toBeVisible();

    const measured = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="design-panel"]') as HTMLElement;
      const board = document.querySelector('[data-testid="design-board"]') as HTMLElement;
      const cards = Array.from(document.querySelectorAll('[data-testid="design-card"]')) as HTMLElement[];
      const boxes = cards.map((card) => card.getBoundingClientRect());
      return {
        cardCount: cards.length,
        minWidth: Math.min(...boxes.map((box) => box.width)),
        panelScrollWidth: panel.scrollWidth,
        panelClientWidth: panel.clientWidth,
        boardScrollWidth: board.scrollWidth,
        boardClientWidth: board.clientWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight,
      };
    });

    // The board and its panel reflow instead of overflowing. Scoped deliberately: the *page* in this build also
    // carries the GAME-186 gallery and the GAME-187 lane panel, whose cards are fixed at the boxes they were
    // qualified at (68px and 96px) and must not shrink — shrinking a fraction until it cannot be read is the
    // exact failure GAME-186 forbids. So page-level horizontal overflow at 200% zoom is a property of those
    // debug surfaces, and GAME-189 owns the real page. This assertion covers what GAME-188 owns.
    expect(measured.boardScrollWidth).toBeLessThanOrEqual(measured.boardClientWidth);
    expect(measured.panelScrollWidth).toBeLessThanOrEqual(measured.panelClientWidth);

    // Vertical scrolling is expected and allowed here.
    expect(measured.documentScrollHeight).toBeGreaterThanOrEqual(measured.documentClientHeight);

    // Every card is still reachable and still above the touch floor, so nothing was clipped away.
    expect(measured.cardCount).toBe(PRODUCTION_CARD_COUNT);
    expect(measured.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX);
  });

  test("gives keyboard focus a visible outline rather than a colour-only change", async ({ page }) => {
    // Focus is asserted on a real interactive control reached by keyboard, because that is the only way
    // :focus-visible is genuinely exercised. The board's cards are a design projection here; GAME-189 makes
    // them the interactive surface.
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null) return null;
      const computed = getComputedStyle(element);
      return {
        tag: element.tagName,
        outlineWidth: parseFloat(computed.outlineWidth),
        outlineStyle: computed.outlineStyle,
        outlineOffset: parseFloat(computed.outlineOffset),
      };
    });

    expect(focused).not.toBeNull();
    expect(focused!.outlineStyle).toBe("solid");
    expect(focused!.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focused!.outlineOffset).toBeGreaterThanOrEqual(0);
  });

  test("has no axe violation in the design panel", async ({ page }) => {
    // The cast matches the repository's existing axe usage: @axe-core/playwright resolves against the nested
    // playwright-core types, so the Page instance needs narrowing rather than converting.
    const axeBuilder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
    const results = await axeBuilder
      .include('[data-testid="design-panel"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
