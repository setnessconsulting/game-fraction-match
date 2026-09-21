import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Direct/root browser smoke for the built artifact.
 *
 * The literals here intentionally mirror the foundation fixture instead of importing the source
 * under test: this journey validates the shipped bundle, not the modules it was built from.
 */
const FOUNDATION_DEBUG_SEED = "20260921";
const EXPECTED_CARD_COUNT = 16;
const EXPECTED_PAIR_COUNT = 8;

async function cardLabel(page: Page, index: number): Promise<string> {
  return (await page.getByTestId("card").nth(index).innerText()).trim();
}

/**
 * The foundation board, scoped to its own container.
 *
 * `data-card-state` is deliberately *shared* vocabulary: GAME-188's design inventory names the same states the
 * engine produces, and its reference board renders them. A page-wide selector for that attribute would
 * therefore also match the design panel, so this journey scopes the attribute to the board it is asserting
 * about rather than relying on being the only board on the page.
 */
function foundationBoard(page: Page) {
  return page.getByTestId("board");
}

test.describe("GAME-185 foundation shell — direct build", () => {
  test("boots the standalone artifact at the domain root", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle("Fraction Match");
    await expect(page.getByRole("heading", { level: 1, name: "Fraction Match" })).toBeVisible();
    await expect(page.getByTestId("seed")).toHaveText(FOUNDATION_DEBUG_SEED);
    await expect(page.getByTestId("card-count")).toHaveText(String(EXPECTED_CARD_COUNT));
    await expect(page.getByTestId("board").getByTestId("card")).toHaveCount(EXPECTED_CARD_COUNT);
    await expect(page.getByTestId("moves")).toHaveText("0");
    await expect(page.getByTestId("matched-pairs")).toHaveText("0");
    await expect(page.getByTestId("pairs-remaining")).toHaveText(String(EXPECTED_PAIR_COUNT));
    await expect(page.getByTestId("game-status")).toHaveText("active");
  });

  test("never leaks a hidden card value into the DOM", async ({ page }) => {
    await page.goto("/");

    const labelValues = await page.getByTestId("card").allInnerTexts();
    expect(labelValues).toHaveLength(EXPECTED_CARD_COUNT);
    expect(labelValues.map((value) => value.trim())).toEqual(Array(EXPECTED_CARD_COUNT).fill("?"));
    await expect(foundationBoard(page).locator('[data-card-state="hidden"]')).toHaveCount(EXPECTED_CARD_COUNT);
  });

  test("counts the first selection as no move and the second as exactly one", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("card").nth(0).click();
    await expect(page.getByTestId("card").nth(0)).toHaveAttribute("data-card-state", "revealed");
    await expect(page.getByTestId("moves")).toHaveText("0");

    await page.getByTestId("card").nth(1).click();
    await expect(page.getByTestId("moves")).toHaveText("1");

    const first = await cardLabel(page, 0);
    const second = await cardLabel(page, 1);

    if (first === second) {
      await expect(page.getByTestId("matched-pairs")).toHaveText("1");
      await expect(page.getByTestId("acknowledge")).toHaveCount(0);
    } else {
      // A mismatch stays visible until the presenter acknowledges it — engine state, not a timer.
      await expect(page.getByTestId("acknowledge")).toBeVisible();
      await expect(page.getByTestId("card").nth(0)).toHaveAttribute("data-card-state", "revealed");
      await page.getByTestId("acknowledge").click();
      await expect(page.getByTestId("acknowledge")).toHaveCount(0);
      await expect(page.getByTestId("moves")).toHaveText("1");
      await expect(foundationBoard(page).locator('[data-card-state="hidden"]')).toHaveCount(EXPECTED_CARD_COUNT);
    }
  });

  test("replays the identical board from the same seed", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("card").nth(0).click();
    await page.getByTestId("card").nth(1).click();
    const before = [await cardLabel(page, 0), await cardLabel(page, 1)];

    const seedBefore = await page.getByTestId("seed").innerText();
    await page.getByRole("button", { name: "Reset board (same seed)" }).click();

    await expect(page.getByTestId("moves")).toHaveText("0");
    await expect(page.getByTestId("seed")).toHaveText(seedBefore);
    await expect(foundationBoard(page).locator('[data-card-state="hidden"]')).toHaveCount(EXPECTED_CARD_COUNT);

    await page.getByTestId("card").nth(0).click();
    await page.getByTestId("card").nth(1).click();
    const after = [await cardLabel(page, 0), await cardLabel(page, 1)];

    expect(after).toEqual(before);
  });

  test("issues no network request during play after the initial static load", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("board")).toBeVisible();

    const duringPlay: string[] = [];
    page.on("request", (request) => duringPlay.push(request.url()));

    await page.getByTestId("card").nth(0).click();
    await page.getByTestId("card").nth(1).click();
    if ((await page.getByTestId("acknowledge").count()) > 0) {
      await page.getByTestId("acknowledge").click();
    }
    await page.getByRole("button", { name: "Reset board (same seed)" }).click();
    await page.waitForLoadState("networkidle");

    expect(duringPlay).toEqual([]);
  });

  test("keeps gameplay state in memory only", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("card").nth(0).click();
    await page.getByTestId("card").nth(1).click();

    const storage = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookie: document.cookie,
    }));

    expect(storage).toEqual({ local: 0, session: 0, cookie: "" });
  });
});
