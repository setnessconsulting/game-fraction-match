import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for the playable board (GAME-189).
 *
 * The unit tests prove the session model and the focus arithmetic; this journey proves the *rendered* game
 * agrees with them, which is where a shell that quietly began computing its own answers would show up.
 *
 * SEEDS ARE RANDOM, ASSERTIONS ARE NOT
 * Production seeds come from `crypto`, so nothing here depends on which cards were dealt. Where a test needs the
 * same board twice it uses **reset**, which re-deals the identical seed by design — and that is also what makes
 * the pointer/touch/keyboard convergence check a real comparison rather than three different boards.
 */

const WARM_UP_CARD_COUNT = 8;
/** Grade 4 publishes the production shape, so its warm-up is 4 pairs and its board is 8. */
async function startWarmUp(page: Page): Promise<void> {
  await page.locator('[data-grade-band="grade-4"]').click();
  await expect(page.getByTestId("game-instruction")).toBeVisible();
  await page.getByTestId("game-begin").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
  await expect(page.getByTestId("game-card")).toHaveCount(WARM_UP_CARD_COUNT);
}

/** The state signature of the board: engine facts, read from the DOM rather than recomputed. */
async function boardSignature(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="game-card"]'))
      .map((card) => `${(card as HTMLElement).dataset.cardIndex}:${(card as HTMLElement).dataset.cardState}`)
      .join(","),
  );
}

/** The board's own card count: the deal is viewport-dependent, so the plan is the authority. */
async function productionCardCount(page: Page): Promise<number> {
  const value = await page.getByTestId("game-board").getAttribute("data-card-count");
  expect(value).not.toBeNull();
  return Number(value);
}

async function fractions(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="game-card"]')).map(
      (card) => (card as HTMLElement).dataset.fraction ?? "",
    ),
  );
}

test.describe("GAME-189 board — shipped build", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("serves the game at the root and keeps the debug shell behind its own hash", async ({ page }) => {
    await expect(page.getByTestId("game-shell")).toBeVisible();
    await expect(page.getByTestId("game-setup")).toBeVisible();
    await expect(page.getByTestId("debug-shell")).toHaveCount(0);

    await page.goto("/#debug");
    await expect(page.getByTestId("debug-shell")).toBeVisible();
    await expect(page.getByTestId("game-shell")).toHaveCount(0);
  });

  test("deals a warm-up with every face showing, then a production board with none", async ({ page }) => {
    await startWarmUp(page);
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-board-kind", "warm-up");
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-faces-visible", "true");

    // The warm-up shows every value, so every card carries its authored fraction as data.
    for (const value of await fractions(page)) expect(value).toMatch(/^\d+\/\d+$/);

    // Only an explicit choice starts the next board.
    await expect(page.getByTestId("game-next-board")).toHaveCount(0);
    await page.getByTestId("game-new-board").click();
    await expect(page.getByTestId("game-instruction")).toBeVisible();
    await page.getByTestId("game-begin").click();

    await expect(page.getByTestId("game-board")).toHaveAttribute("data-board-kind", "production-board");

    // The board size follows the viewport: the card keeps its qualified 96px box and the deal shrinks until the
    // whole board fits, so the count is asserted as a rule rather than as a magic number.
    const cards = await productionCardCount(page);
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-card-size", "96");
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-fits-without-scrolling", "true");
    await expect(page.getByTestId("game-card")).toHaveCount(cards);
  });

  test("never leaks a hidden value through the DOM or an accessible name", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-new-board").click();
    await page.getByTestId("game-begin").click();
    const expectedCards = await productionCardCount(page);
    await expect(page.getByTestId("game-card")).toHaveCount(expectedCards);

    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="game-card"]')).map((card) => ({
        state: (card as HTMLElement).dataset.cardState,
        valueVisible: (card as HTMLElement).dataset.valueVisible,
        fraction: (card as HTMLElement).dataset.fraction ?? null,
        name: card.getAttribute("aria-label"),
        text: card.textContent ?? "",
        html: card.innerHTML,
      })),
    );

    expect(hidden).toHaveLength(expectedCards);
    for (const card of hidden) {
      expect(card.state).toBe("hidden");
      expect(card.valueVisible).toBe("false");
      expect(card.fraction).toBeNull();
      expect(card.name).toBe("Hidden card");
      // No fraction-shaped text, and no representation markup smuggled in behind the card back.
      expect(card.text).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(card.html).not.toContain("<svg");
    }

    // The whole board's rendered text carries no authored fraction either.
    const boardText = (await page.getByTestId("game-board").innerText()).replace(/\s+/g, " ");
    expect(boardText).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  test("keeps exactly one card in the tab order and walks the grid with the arrow keys", async ({ page }) => {
    await startWarmUp(page);

    const tabIndexes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="game-card"]')).map((card) =>
        card.getAttribute("tabindex"),
      ),
    );
    expect(tabIndexes.filter((value) => value === "0")).toHaveLength(1);
    expect(tabIndexes.filter((value) => value === "-1")).toHaveLength(WARM_UP_CARD_COUNT - 1);

    // Tab reaches exactly one card; the arrows move the anchor from there.
    await page.keyboard.press("Tab");
    const before = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.cardIndex ?? null);

    await page.keyboard.press("ArrowRight");
    const afterRight = await page.evaluate(
      () => (document.activeElement as HTMLElement).dataset.cardIndex ?? null,
    );
    expect(afterRight).not.toBe(before);

    await page.keyboard.press("ArrowLeft");
    const backAgain = await page.evaluate(
      () => (document.activeElement as HTMLElement).dataset.cardIndex ?? null,
    );
    expect(backAgain).toBe(before);
  });

  test("converges pointer, keyboard and touch on the same intents", async ({ page }) => {
    const withTouch = test.info().project.name === "mobile-webkit";
    await startWarmUp(page);
    const cards = page.getByTestId("game-card");

    type Modality = "pointer" | "keyboard" | "touch";

    async function reset(): Promise<void> {
      await page.getByTestId("game-reset").click();
      await expect(cards).toHaveCount(WARM_UP_CARD_COUNT);
    }

    async function activate(index: number, modality: Modality): Promise<void> {
      const card = cards.nth(index);
      if (modality === "keyboard") {
        await card.focus();
        await page.keyboard.press("Enter");
        return;
      }
      if (modality === "touch") {
        await card.tap();
        return;
      }
      await card.click();
    }

    /**
     * Play a pair and report the *engine's* verdict, read from the board.
     *
     * Deliberately not derived from the cards' values: two cards showing different fractions may still be the
     * same amount (that is the game), and two cards showing the same fraction may be different amounts across
     * different wholes. Only the engine knows, so the test asks it rather than computing an answer of its own.
     */
    async function playPair(a: number, b: number, modality: Modality): Promise<"match" | "mismatch" | "none"> {
      await reset();
      await activate(a, modality);
      await activate(b, modality);
      await expect(page.getByTestId("game-moves")).toHaveText("1");
      if ((await page.getByTestId("game-board").getAttribute("data-comparison")) === "pending") return "mismatch";
      return (await cards.nth(a).getAttribute("data-card-state")) === "matched" ? "match" : "none";
    }

    // Discover one pair of each kind by observing the engine, then replay both under every modality.
    let mismatching = -1;
    let matching = -1;
    for (let index = 1; index < WARM_UP_CARD_COUNT; index += 1) {
      if (mismatching !== -1 && matching !== -1) break;
      const verdict = await playPair(0, index, "pointer");
      if (verdict === "mismatch" && mismatching === -1) mismatching = index;
      if (verdict === "match" && matching === -1) matching = index;
    }
    expect(mismatching, "every board has a mismatching partner for card 0").toBeGreaterThan(0);
    expect(matching, "every board has exactly one matching partner for card 0").toBeGreaterThan(0);

    const signatures = new Map<Modality, string>();
    const modalities: readonly Modality[] = withTouch
      ? ["pointer", "keyboard", "touch"]
      : ["pointer", "keyboard"];

    for (const modality of modalities) {
      expect(await playPair(0, mismatching, modality), `mismatch under ${modality}`).toBe("mismatch");
      signatures.set(modality, await boardSignature(page));
    }

    const byPointer = signatures.get("pointer")!;
    for (const modality of modalities) {
      expect(signatures.get(modality), `${modality} must reach the state pointer input reaches`).toBe(byPointer);
    }

    // The matching pair converges too, and takes the same path to a different, engine-decided end.
    for (const modality of modalities) {
      expect(await playPair(0, matching, modality), `match under ${modality}`).toBe("match");
      await expect(cards.nth(0)).toHaveAttribute("data-card-state", "matched");
      await expect(cards.nth(matching)).toHaveAttribute("data-card-state", "matched");
      await expect(page.getByTestId("game-explanation")).toHaveCount(0);
    }
  });

  test("cannot be made to double-count a move or expose a third card by input speed", async ({ page }) => {
    await startWarmUp(page);
    const cards = page.getByTestId("game-card");

    // Find a partner that mismatches with card 0 by asking the engine, not by comparing what the cards show.
    let mismatching = -1;
    for (let index = 1; index < WARM_UP_CARD_COUNT; index += 1) {
      await page.getByTestId("game-reset").click();
      await cards.nth(0).click();
      await cards.nth(index).click();
      if ((await page.getByTestId("game-board").getAttribute("data-comparison")) === "pending") {
        mismatching = index;
        break;
      }
    }
    expect(mismatching).toBeGreaterThan(0);

    // Re-activating the same card is the engine's refusal, not a second move.
    await page.getByTestId("game-reset").click();
    await cards.nth(0).click();
    const afterFirst = await boardSignature(page);
    await cards.nth(0).dispatchEvent("click");
    expect(await boardSignature(page)).toBe(afterFirst);
    await expect(page.getByTestId("game-moves")).toHaveText("0");

    await cards.nth(mismatching).click();
    await expect(page.getByTestId("game-moves")).toHaveText("1");
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-comparison", "pending");

    // While the comparison is on screen every card is disabled, and a click that reaches the handler anyway is
    // refused by the engine — the shell holds no second opinion about who may be picked.
    const before = await boardSignature(page);
    for (let index = 0; index < WARM_UP_CARD_COUNT; index += 1) {
      await expect(cards.nth(index)).toBeDisabled();
    }

    const third = Array.from({ length: WARM_UP_CARD_COUNT }, (_, index) => index).find(
      (index) => index !== 0 && index !== mismatching,
    );
    expect(third).toBeDefined();
    await cards.nth(third!).dispatchEvent("click");
    expect(await boardSignature(page)).toBe(before);
    await expect(page.getByTestId("game-moves")).toHaveText("1");
  });

  test("re-deals the identical board on reset and clears progress", async ({ page }) => {
    await startWarmUp(page);
    const cards = page.getByTestId("game-card");
    const seed = await page.getByTestId("game-board").getAttribute("data-seed");
    const original = await boardSignature(page);

    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute("data-card-state", "revealed");

    await page.getByTestId("game-reset").click();
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-seed", seed!);
    expect(await boardSignature(page)).toBe(original);
    await expect(page.getByTestId("game-moves")).toHaveText("0");
  });
});

test.describe("GAME-189 board — calm recovery", () => {
  /*
   * This journey deliberately makes the board throw, and a *caught* error is supposed to reach the console — React
   * logs it with the component stack. The patterns are anchored and declared here, next to the failure that causes
   * them, and they cannot excuse an uncaught error: that would arrive as a `pageerror` and fail regardless.
   */
  test.use({
    expectedConsoleErrors:
      /board render failure injected by the recovery qualification|^console\.error: Error$/,
  });

  test("reaches the calm recovery surface instead of a stack trace", async ({ page }) => {
    await page.goto("/#board-error-qualification");
    await page.locator('[data-grade-band="grade-4"]').click();
    await page.getByTestId("game-begin").click();

    await expect(page.getByTestId("game-recovery")).toBeVisible();
    await expect(page.getByTestId("game-recovery")).toHaveAttribute("data-screen", "calm-recovery");

    const text = (await page.getByTestId("game-recovery").innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(/Error|stack|at \w|undefined is not/);

    // Recovery is a real action, not a reload instruction.
    await page.getByTestId("game-recovery-restart").click();
    await expect(page.getByTestId("game-setup")).toBeVisible();
  });
});

test.describe("GAME-189 board — host boundary", () => {
  test("never navigates out of its own document", async ({ page }) => {
    await page.goto("/");
    await startWarmUp(page);
    const urlBefore = page.url();

    await page.getByTestId("game-end-session").click();
    // Ending reports the session (GAME-191) rather than throwing the learner back to setup.
    await expect(page.getByTestId("game-summary")).toBeVisible();
    expect(page.url()).toBe(urlBefore);
  });
});
