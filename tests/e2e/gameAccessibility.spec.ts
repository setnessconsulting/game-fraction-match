import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Accessibility qualification for the finished game (GAME-192).
 *
 * The story asks for a *qualification*, not a unit test: every required state is put in front of a real browser and
 * measured. Where a check cannot be automated — a real screen reader — the record in `docs/game/ACCESSIBILITY.md`
 * says so plainly rather than inferring a pass.
 */

/** A bounded axe scan of one state, failing on anything serious or critical. */
async function axeProblems(page: Page, label: string): Promise<string[]> {
  // The cast matches the repository's existing axe usage: @axe-core/playwright resolves against the nested
  // playwright-core types, so the Page instance needs narrowing rather than converting.
  const builder = new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
  const results = await builder.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${label}: ${violation.id} — ${violation.help}`);
}

async function chooseGrade(page: Page, grade = "grade-4"): Promise<void> {
  await page.locator(`[data-grade-band="${grade}"]`).click();
}

async function beginBoard(page: Page): Promise<void> {
  await page.getByTestId("game-begin").click();
  await expect(page.getByTestId("game-card").first()).toBeVisible();
}

/** Reveal one card without resolving a pair, which is the "comparing" state. */
async function revealOneCard(page: Page): Promise<void> {
  await page.getByTestId("game-card").first().click();
  await expect(page.getByTestId("game-card").first()).toHaveAttribute("data-card-state", "revealed");
}

test.describe("GAME-192 accessibility qualification — shipped build", () => {
  test("axe finds nothing serious or critical in any required state", async ({ page }) => {
    const problems: string[] = [];

    await page.goto("/");
    await expect(page.getByTestId("game-setup")).toBeVisible();
    problems.push(...(await axeProblems(page, "grade setup")));

    await chooseGrade(page);
    await expect(page.getByTestId("game-instruction")).toBeVisible();
    problems.push(...(await axeProblems(page, "instruction")));

    await beginBoard(page);
    problems.push(...(await axeProblems(page, "warm-up board, nothing revealed")));

    await revealOneCard(page);
    problems.push(...(await axeProblems(page, "comparing")));

    // Resolve the revealed card: either a match (a demonstration strip) or a mismatch (an explanation window).
    await page.getByTestId("game-card").nth(1).click();
    const mismatch = (await page.getByTestId("game-explanation").count()) > 0;
    problems.push(...(await axeProblems(page, mismatch ? "mismatch" : "match")));

    // And the summary, which is its own surface with its own actions.
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();
    problems.push(...(await axeProblems(page, "session summary")));

    expect(problems).toEqual([]);
  });

  test("every interactive control clears the minimum touch target", async ({ page }) => {
    await page.goto("/");
    await chooseGrade(page);
    await beginBoard(page);

    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="game-card"]')).map((card) => {
        const box = card.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(cards.length).toBeGreaterThan(0);
    for (const box of cards) {
      // The card is drawn at the box its lane was qualified at, so this is a floor rather than a target.
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // The controls are measured as well: the board's own actions and the shell's, at their real size.
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();

    const controls = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter((button) => button.offsetParent !== null)
        .map((button) => {
          const box = button.getBoundingClientRect();
          return { text: (button.textContent ?? "").trim(), width: box.width, height: box.height };
        }),
    );
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.width, `${control.text} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.text} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("stays usable under forced colors, where no state depends on hue", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await chooseGrade(page);
    await beginBoard(page);

    // Reveal one and match it, so three different card states are on screen at once.
    const cards = page.getByTestId("game-card");
    await cards.nth(0).click();
    await cards.nth(1).click();

    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="game-card"]')).map((card) => {
        const computed = getComputedStyle(card);
        return {
          state: (card as HTMLElement).dataset.cardState ?? "",
          borderStyle: computed.borderStyle,
          borderWidth: computed.borderWidth,
          ink: computed.color,
        };
      }),
    );

    // Every card still has a real boundary and readable ink once the palette is replaced, and the states are still
    // told apart by boundary rather than by colour.
    for (const card of measured) {
      expect(Number.parseFloat(card.borderWidth), card.state).toBeGreaterThanOrEqual(1);
      expect(card.borderStyle, card.state).not.toBe("none");
    }

    const revealed = measured.find((card) => card.state === "revealed");
    const hidden = measured.filter((card) => card.state === "hidden");
    if (revealed !== undefined && hidden.length > 0) {
      // A revealed card is told apart from a hidden one by boundary weight, not only by ink.
      expect(Number.parseFloat(revealed.borderWidth)).toBeGreaterThan(Number.parseFloat(hidden[0]!.borderWidth));
    }

    // And the game is still operable: axe finds nothing serious with the palette replaced.
    expect(await axeProblems(page, "forced colors")).toEqual([]);
  });

  test("loses no content horizontally at 200% zoom", async ({ page }) => {
    // 200% zoom is emulated as the halved content viewport, the same dimension the design system qualifies.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await chooseGrade(page);
    await beginBoard(page);

    const measured = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
      const board = document.querySelector('[data-testid="game-board"]') as HTMLElement;
      const cards = Array.from(document.querySelectorAll('[data-testid="game-card"]')) as HTMLElement[];
      return {
        cardCount: cards.length,
        minCardWidth: Math.min(...cards.map((card) => card.getBoundingClientRect().width)),
        shellScrollWidth: shell.scrollWidth,
        shellClientWidth: shell.clientWidth,
        boardScrollWidth: board.scrollWidth,
        boardClientWidth: board.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      };
    });

    // The board and the shell reflow instead of overflowing. Page-level vertical scrolling is allowed; horizontal
    // loss is not — and at this viewport the *game* is the only surface on the page.
    expect(measured.shellScrollWidth).toBeLessThanOrEqual(measured.shellClientWidth);
    expect(measured.boardScrollWidth).toBeLessThanOrEqual(measured.boardClientWidth);
    expect(measured.documentScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth);

    // Nothing was clipped away to achieve that: every card is still there and still tappable.
    expect(measured.cardCount).toBeGreaterThanOrEqual(4);
    expect(measured.minCardWidth).toBeGreaterThanOrEqual(44);
  });

  test("keeps the roving tab order on a playable card as the engine moves", async ({ page }) => {
    await page.goto("/");
    await chooseGrade(page);
    await beginBoard(page);

    async function anchorIndex(): Promise<number> {
      return page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="game-card"]')) as HTMLElement[];
        return cards.findIndex((card) => card.getAttribute("tabindex") === "0");
      });
    }

    expect(await anchorIndex()).toBe(0);

    // Reveal the anchor card: it leaves the tab order, and the anchor must move to a card that is still playable.
    await page.getByTestId("game-card").nth(0).click();
    await expect(page.getByTestId("game-card").nth(0)).toHaveAttribute("data-card-state", "revealed");
    const afterReveal = await anchorIndex();
    expect(afterReveal).not.toBe(0);
    expect(afterReveal).toBeGreaterThan(0);

    // And that card is genuinely selectable, so the anchor is somewhere useful rather than merely elsewhere.
    const anchorDisabled = await page.evaluate((index) => {
      const cards = Array.from(document.querySelectorAll('[data-testid="game-card"]')) as HTMLElement[];
      return cards[index]?.getAttribute("aria-disabled") ?? "true";
    }, afterReveal);
    expect(anchorDisabled).toBe("false");
  });
});
