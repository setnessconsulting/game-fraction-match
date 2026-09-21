import { defineConfig, devices } from "@playwright/test";

import { NESTED_BASE_PATH } from "./scripts/lib/nestedHostPath.mjs";

const port = process.env.FM_HOST_PORT ?? "4183";
const externalBaseUrl = process.env.FM_HOST_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;

/**
 * Nested versioned asset-base journey.
 *
 * This is the qualification that matters for games-site: the production artifact must load from a
 * nested prefix such as `/game-assets/fraction-match/<version>/`, resolve every asset beneath that
 * same base, and never assume domain-root hosting.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*nestedAssetBase\.spec\.ts/,
  outputDir: "test-results/host",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-host", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "node scripts/nested-host-server.mjs",
        env: { FM_NESTED_HOST_PORT: port },
        url: `${baseURL}${NESTED_BASE_PATH}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
