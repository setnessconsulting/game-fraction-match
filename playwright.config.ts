import { defineConfig, devices } from "@playwright/test";

const port = process.env.FM_E2E_PORT ?? "4173";
const externalBaseUrl = process.env.FM_E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;

/**
 * Direct/root browser smoke for the production build.
 *
 * The nested versioned asset-base journey has its own configuration
 * (`playwright.host.config.ts`) because it needs a harness that serves `dist/` beneath
 * `/game-assets/fraction-match/<version>/`.
 *
 * Chromium only: GAME-185 proves the artifact boots. Cross-engine and accessibility qualification
 * belong to GAME-192.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  testIgnore: ["**/nestedAssetBase.spec.ts"],
  outputDir: "test-results/e2e",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: `${baseURL}/`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
