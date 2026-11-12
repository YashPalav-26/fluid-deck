/**
 * IMPORT-008 only: keeps the round-trip spec out of the default 15-minute
 * search-benchmark suite and runs it in the three approved browsers.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /import-(export|screens)\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5199",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @fluid-deck/web dev",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "edge", use: { browserName: "chromium", channel: "msedge" } },
  ],
});
