/**
 * Optional measurement runs (SEARCH-006). These are NOT acceptance tests:
 * they emulate a 4x CPU throttle, they can run for up to 30 minutes each, and
 * they overwrite `docs/SPRINT_6_BENCHMARK_RESULTS.json` and
 * `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json` with the new measurement.
 *
 * Run with `pnpm test:e2e:benchmark` when a fresh measurement is wanted, and
 * commit the regenerated artifacts deliberately - they are evidence, not noise.
 */
import { defineConfig, devices } from "@playwright/test";

/** Dev-server URL, shared with the acceptance suite. */
export const APP_URL = "http://127.0.0.1:5199";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /search-benchmark(-worker)?\.spec\.ts/,
  timeout: 1_800_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: APP_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], browserName: "chromium" } }],
  webServer: {
    command: "pnpm --filter @fluid-deck/web dev",
    url: APP_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
