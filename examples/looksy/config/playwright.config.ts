/**
 * Playwright config for the Looksy test framework.
 *
 * The framework runs against the Looksy app's dev server. Before running
 * tests, start Looksy in another terminal:
 *
 *   cd /path/to/looksy-shop
 *   npm run dev    # serves http://localhost:5173
 *
 * If you set `webServer` to auto-start Looksy from this config, Playwright
 * will boot the dev server for you. We've left it commented out by default
 * because most teams prefer to control the dev server independently.
 */

import { defineConfig, devices } from "@playwright/test";
import { fa } from "zod/v4/locales";

export default defineConfig({
  testDir: "../tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    /** Run tests in headed mode by default; set PLAYWRIGHT_HEADLESS=1 or adjust for CI. */
    headless: false,
    /** Looksy's dev server URL. Override via PLAYWRIGHT_BASE_URL env if needed. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    /** Trace on first retry — gives us a debug bundle when a flake appears. */
    trace: "on-first-retry",
    /** Screenshot only when something failed; keeps artefacts small. */
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Add firefox/webkit projects when needed. Most CI pipelines use
    // chromium-only for speed and add cross-browser as a separate stage.
  ],
  // Uncomment to auto-start the Looksy dev server before tests:
  // webServer: {
  //   command: "npm run dev",
  //   cwd: "../looksy-shop",
  //   url: "http://localhost:5173",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
