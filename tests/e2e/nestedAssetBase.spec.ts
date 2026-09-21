import { NESTED_BASE_PATH } from "../../scripts/lib/nestedHostPath.mjs";
import { expect, test } from "../browserErrorFixture";

/**
 * The games-site-compatible artifact journey.
 *
 * A release is served from `/game-assets/fraction-match/<version>/index.html` with its assets
 * beneath the same versioned prefix. Testing only `/index.html` would not catch a build that
 * assumes domain-root hosting, so this journey asserts that every HTML/JS/CSS response came from
 * the nested prefix and that the root path the artifact must not depend on does not exist.
 */
const EXPECTED_CARD_COUNT = 16;

test.describe("GAME-185 nested versioned asset base", () => {
  test("loads from the nested prefix with every asset beneath it", async ({ page }) => {
    const responsePaths: string[] = [];
    page.on("response", (response) => responsePaths.push(new URL(response.url()).pathname));

    const response = await page.goto(`${NESTED_BASE_PATH}/`);
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle("Fraction Match");
    await expect(page.getByRole("heading", { level: 1, name: "Fraction Match" })).toBeVisible();
    await expect(page.getByTestId("board").getByTestId("card")).toHaveCount(EXPECTED_CARD_COUNT);

    // Every single response the document produced resolves beneath the versioned prefix. A build
    // that assumed domain-root hosting would emit `/assets/...` and fail here.
    expect(responsePaths).toContain(`${NESTED_BASE_PATH}/`);
    expect(responsePaths.length).toBeGreaterThanOrEqual(3);
    for (const path of responsePaths) {
      expect(path.startsWith(`${NESTED_BASE_PATH}/`), `${path} must be served beneath ${NESTED_BASE_PATH}/`).toBe(
        true,
      );
    }
    expect(responsePaths.some((path) => path.endsWith(".js"))).toBe(true);
    expect(responsePaths.some((path) => path.endsWith(".css"))).toBe(true);
  });

  test("plays from the nested index document itself", async ({ page }) => {
    const response = await page.goto(`${NESTED_BASE_PATH}/index.html`);
    expect(response?.status()).toBe(200);

    await expect(page.getByTestId("board").getByTestId("card")).toHaveCount(EXPECTED_CARD_COUNT);
    await page.getByTestId("card").nth(0).click();
    await expect(page.getByTestId("moves")).toHaveText("0");
    await page.getByTestId("card").nth(1).click();
    await expect(page.getByTestId("moves")).toHaveText("1");
  });

  test("resolves the versioned directory to its index document", async ({ page }) => {
    const response = await page.request.get(NESTED_BASE_PATH);
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe(`${NESTED_BASE_PATH}/`);
  });

  test("does not expose the artifact at the domain root", async ({ page }) => {
    for (const path of ["/", "/index.html", "/assets/", `${NESTED_BASE_PATH}/missing-file.js`]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} must not be served by the harness`).toBe(404);
    }
  });
});
