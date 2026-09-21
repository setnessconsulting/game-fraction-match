import type { Page } from "@playwright/test";

import { expect, test } from "../browserErrorFixture";

/**
 * Browser qualification for GAME-191's session arc.
 *
 * The unit tests prove the bounds at the exact millisecond; this journey proves the *rendered* arc: that a session
 * can be finished and reported, that the report is made of facts rather than a score, that nothing survives a
 * refresh, and that finishing never starts anything.
 */

async function startWarmUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-grade-band="grade-4"]').click();
  await page.getByTestId("game-begin").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
}


test.describe("GAME-191 session arc — shipped build", () => {
  test("reports the session as facts when it is finished", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-end-session").click();

    const summary = page.getByTestId("game-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveAttribute("data-screen", "session-summary");

    const lines = await page.getByTestId("game-summary-lines").innerText();
    expect(lines).toMatch(/Boards finished: \d+/);
    expect(lines).toMatch(/Pairs matched: \d+/);
    expect(lines).toMatch(/Moves: \d+/);
    expect(lines).toMatch(/Forms practised: /);

    // Facts only: no percentage, no score, no level, no comparison to anything.
    const text = (await summary.innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text.toLowerCase()).not.toMatch(/master|level|score|streak|improve|best|grade up/);

    // And the summary says where its numbers come from.
    await expect(page.getByTestId("game-summary-note")).toContainText("Nothing is saved");
  });

  test("offers two equally weighted ways on, and neither is styled as the right answer", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();

    const playAgain = page.getByTestId("game-play-again");
    const changeGrade = page.getByTestId("game-change-grade");
    await expect(playAgain).toBeEnabled();
    await expect(changeGrade).toBeEnabled();

    // Equal weight is asserted as a property rather than as a promise: same element type, same classes.
    const [againTag, changeTag, againClass, changeClass] = [
      await playAgain.evaluate((element) => element.tagName),
      await changeGrade.evaluate((element) => element.tagName),
      await playAgain.getAttribute("class"),
      await changeGrade.getAttribute("class"),
    ];
    expect(againTag).toBe(changeTag);
    expect(againClass).toBe(changeClass);

    // Playing on starts a fresh session at the same grade, and does not start a board on its own.
    await playAgain.click();
    await expect(page.getByTestId("game-instruction")).toBeVisible();
    await expect(page.getByTestId("game-card")).toHaveCount(0);
  });

  test("changing grade returns to setup with nothing carried over", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-end-session").click();
    await page.getByTestId("game-change-grade").click();

    await expect(page.getByTestId("game-setup")).toBeVisible();
    await expect(page.getByTestId("game-summary")).toHaveCount(0);
  });

  test("never starts the next board by itself", async ({ page }) => {
    await startWarmUp(page);

    // The warm-up is the first board and a new one only appears behind an explicit choice.
    await page.getByTestId("game-new-board").click();
    await expect(page.getByTestId("game-instruction")).toBeVisible();
    await expect(page.getByTestId("game-card")).toHaveCount(0);

    // Which is also true of finishing a session.
    await page.getByTestId("game-begin").click();
    await expect(page.getByTestId("game-card")).not.toHaveCount(0);
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();
    await expect(page.getByTestId("game-card")).toHaveCount(0);
  });

  test("writes nothing to storage and keeps the session in memory only", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-card").first().click();
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();

    const stored = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookie: document.cookie,
    }));
    expect(stored.local).toBe(0);
    expect(stored.session).toBe(0);
    expect(stored.cookie).toBe("");

    // A refresh discards the session: the game comes back at setup rather than restoring anything.
    await page.reload();
    await expect(page.getByTestId("game-setup")).toBeVisible();
    await expect(page.getByTestId("game-summary")).toHaveCount(0);
  });

  test("publishes the bounds it is working to, and does not trip them in a short session", async ({ page }) => {
    await startWarmUp(page);

    const shell = page.getByTestId("game-shell");
    await expect(shell).toHaveAttribute("data-bounds-soft", "false");
    await expect(shell).toHaveAttribute("data-bounds-hard", "false");
    await expect(shell).toHaveAttribute("data-idle", "false");

    // Active play accrues only while a board is in play, and the shell says how much it has counted.
    const before = Number(await shell.getAttribute("data-active-ms"));
    await page.waitForTimeout(2200);
    const after = Number(await shell.getAttribute("data-active-ms"));
    expect(after).toBeGreaterThan(before);

    // And it never offers to end anything while the learner is working.
    await expect(page.getByTestId("game-idle-offer")).toHaveCount(0);
  });

  test("stops counting active play once the board is over", async ({ page }) => {
    await startWarmUp(page);
    await page.getByTestId("game-end-session").click();
    await expect(page.getByTestId("game-summary")).toBeVisible();

    const shell = page.getByTestId("game-shell");

    // Give the tick a moment to publish the interval that ran up to the moment the board ended, then sample
    // twice: from here on the counter must not move at all.
    await page.waitForTimeout(1400);
    const settled = Number(await shell.getAttribute("data-active-ms"));
    await page.waitForTimeout(2200);
    expect(Number(await shell.getAttribute("data-active-ms"))).toBe(settled);
  });
});

