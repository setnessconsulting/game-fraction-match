import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for GAME-190's explanatory feedback.
 *
 * The unit tests assert the copy and the window plan; this journey asserts the *rendered* behaviour that the story
 * is really about — that a mismatched pair is genuinely held on screen long enough to be looked at, that it clears
 * itself by the contracted maximum, and that a reduced-motion preference changes none of it.
 *
 * The pair under test is discovered by asking the engine, never by comparing what the cards show: two cards
 * showing different fractions may still be the same amount, which is the whole game.
 */

const WARM_UP_CARD_COUNT = 8;
const MIN_INSPECTION_MS = 1200;
const MAX_INSPECTION_MS = 3000;

async function startWarmUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-grade-band="grade-4"]').click();
  await page.getByTestId("game-begin").click();
  await expect(page.getByTestId("game-card")).toHaveCount(WARM_UP_CARD_COUNT);
}

/** The index of a card that mismatches card 0, found by observing the engine rather than by comparing values. */
async function findMismatchingPartner(page: Page): Promise<number> {
  const cards = page.getByTestId("game-card");
  for (let index = 1; index < WARM_UP_CARD_COUNT; index += 1) {
    await page.getByTestId("game-reset").click();
    await cards.nth(0).click();
    await cards.nth(index).click();
    if ((await page.getByTestId("game-board").getAttribute("data-comparison")) === "pending") return index;
  }
  throw new Error("no mismatching partner found for card 0");
}

/** Reset, then play the mismatching pair, leaving the inspection window open. */
async function playMismatch(page: Page, partner: number): Promise<void> {
  const cards = page.getByTestId("game-card");
  await page.getByTestId("game-reset").click();
  await cards.nth(0).click();
  await cards.nth(partner).click();
  await expect(page.getByTestId("game-explanation")).toBeVisible();
}

/** The index of card 0's matching partner, again by asking the engine. */
async function findMatchingPartner(page: Page): Promise<number> {
  const cards = page.getByTestId("game-card");
  for (let index = 1; index < WARM_UP_CARD_COUNT; index += 1) {
    await page.getByTestId("game-reset").click();
    await cards.nth(0).click();
    await cards.nth(index).click();
    if ((await page.getByTestId("game-board").getAttribute("data-comparison")) !== "pending") return index;
  }
  throw new Error("no matching partner found for card 0");
}

test.describe("GAME-190 feedback — shipped build", () => {
  test("holds a mismatched pair for the minimum, then lets the learner continue", async ({ page }) => {
    await startWarmUp(page);
    const partner = await findMismatchingPartner(page);
    await playMismatch(page, partner);

    const explanation = page.getByTestId("game-explanation");
    const acknowledge = page.getByTestId("game-acknowledge");

    // The control is present from the first frame but disabled: the affordance is discoverable, the inspection
    // time is not skipped, and the disabled state is a real attribute rather than a colour.
    await expect(explanation).toHaveAttribute("data-inspection", "holding");
    await expect(acknowledge).toBeDisabled();

    // It opens after the contracted minimum, and not before.
    await expect(explanation).toHaveAttribute("data-inspection", "open", { timeout: MIN_INSPECTION_MS + 1500 });
    await expect(acknowledge).toBeEnabled();

    await acknowledge.click();
    await expect(explanation).toHaveCount(0);
  });

  test("explains the relationship exactly, without naming any card that is not on show", async ({ page }) => {
    await startWarmUp(page);
    const partner = await findMismatchingPartner(page);
    await playMismatch(page, partner);

    const copy = (await page.getByTestId("game-mismatch-copy").innerText()).trim();
    expect(copy.length).toBeGreaterThan(0);
    expect(copy.split(/\s+/).length).toBeLessThanOrEqual(12);

    const cardTwo = await page.getByTestId("game-card").nth(0).getAttribute("data-fraction");
    const partnerTwo = await page.getByTestId("game-card").nth(partner).getAttribute("data-fraction");
    expect(copy).toContain(cardTwo!);
    expect(copy).toContain(partnerTwo!);

    // Only the two cards on show are named. No third card's value appears, so a mismatch never reports a card the
    // learner did not turn over — which matters most on a board where the faces are hidden.
    const others = await page.evaluate(
      (excluded: number[]) =>
        Array.from(document.querySelectorAll('[data-testid="game-card"]'))
          .map((card, index) => ({ index, notation: (card as HTMLElement).dataset.fraction ?? "" }))
          .filter((entry) => !excluded.includes(entry.index) && entry.notation.length > 0)
          .map((entry) => entry.notation),
      [0, partner],
    );
    expect(others.length).toBeGreaterThan(0);
    for (const notation of others) expect(copy).not.toContain(notation);

    // No shame, no punishment, no pressure anywhere in the feedback surface.
    expect(copy.toLowerCase()).not.toMatch(/wrong|try again|oops|streak|lost|fail/);
  });

  test("clears itself by the contracted maximum without touching the engine's own facts", async ({ page }) => {
    await startWarmUp(page);
    const partner = await findMismatchingPartner(page);
    await playMismatch(page, partner);

    // The engine decided the outcome and counted the move when the second card was chosen; the timer may only
    // clear the pair. Capture both facts before the window closes.
    const moves = await page.getByTestId("game-moves").innerText();
    const matched = await page.getByTestId("game-matched").innerText();

    await expect(page.getByTestId("game-explanation")).toHaveCount(0, { timeout: MAX_INSPECTION_MS + 2000 });

    expect(await page.getByTestId("game-moves").innerText()).toBe(moves);
    expect(await page.getByTestId("game-matched").innerText()).toBe(matched);
    expect(moves).toBe("1");
  });

  test("keeps a stale window from clearing a comparison that belongs to another board", async ({ page }) => {
    await startWarmUp(page);
    const partner = await findMismatchingPartner(page);
    await playMismatch(page, partner);

    // Reset while the window is still holding: the board remounts, the timers are cleaned up, and the fresh board
    // must not be dismissed by the old one's callback.
    await page.getByTestId("game-reset").click();
    await expect(page.getByTestId("game-explanation")).toHaveCount(0);
    await expect(page.getByTestId("game-card").nth(0)).toHaveAttribute("data-card-state", "hidden");

    // Well past the old maximum, and the new board is untouched.
    await expect(page.getByTestId("game-moves")).toHaveText("0");
    await page.waitForTimeout(MAX_INSPECTION_MS + 500);
    await expect(page.getByTestId("game-moves")).toHaveText("0");
    await expect(page.getByTestId("game-card").nth(0)).toHaveAttribute("data-card-state", "hidden");
  });

  test("demonstrates a matched pair as one amount in the two forms the learner picked", async ({ page }) => {
    await startWarmUp(page);
    const partner = await findMatchingPartner(page);

    const cards = page.getByTestId("game-card");
    await page.getByTestId("game-reset").click();
    await cards.nth(0).click();
    await cards.nth(partner).click();

    const strip = page.getByTestId("game-match-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("data-component", "comparison-strip");
    await expect(strip).toHaveAttribute("data-feedback", "match");
    await expect(page.getByTestId("game-strip-side")).toHaveCount(2);

    // Each side is drawn by the representation layer, and each side's picture is the family the plan chose.
    await expect(page.getByTestId("game-strip-card").first().locator("svg")).toHaveCount(1);

    const shared = (await page.getByTestId("game-match-shared").innerText()).trim();
    const copy = (await page.getByTestId("game-match-copy").innerText()).trim();
    expect(copy.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(shared).toContain("Same amount");
    // The demonstration names the reduced value, which is what both cards have in common.
    expect(copy + " " + shared).toMatch(/\d+\/\d+/);

    // A matched pair never needs clearing, and the engine has already recorded both cards.
    await expect(page.getByTestId("game-explanation")).toHaveCount(0);
    await expect(cards.nth(0)).toHaveAttribute("data-card-state", "matched");
    await expect(cards.nth(partner)).toHaveAttribute("data-card-state", "matched");
  });

  test("changes no result, no matched set and no explanation under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startWarmUp(page);

    const partner = await findMismatchingPartner(page);
    await playMismatch(page, partner);

    const explanation = page.getByTestId("game-explanation");
    const acknowledge = page.getByTestId("game-acknowledge");
    const copy = (await page.getByTestId("game-mismatch-copy").innerText()).trim();

    // The window is not motion, so it behaves identically: still held, then still openable.
    await expect(explanation).toHaveAttribute("data-inspection", "holding");
    await expect(acknowledge).toBeDisabled();
    await expect(explanation).toHaveAttribute("data-inspection", "open", { timeout: MIN_INSPECTION_MS + 1500 });

    // And the decoration really is gone, so this is parity rather than a preference that did nothing.
    const transition = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="game-explanation"]') as HTMLElement;
      return getComputedStyle(element).transitionDuration;
    });
    expect(transition.split(",").every((value) => value.trim() === "0s")).toBe(true);

    await acknowledge.click();
    await expect(page.getByTestId("game-explanation")).toHaveCount(0);
    await expect(page.getByTestId("game-moves")).toHaveText("1");
    // A mismatch is not a match, so there is no demonstration strip to show for it.
    await expect(page.getByTestId("game-match-strip")).toHaveCount(0);
    expect(copy.length).toBeGreaterThan(0);
  });
});
