/**
 * Canonical Playwright configuration.
 *
 * One acceptance matrix, three browsers, and an explicit list of what is NOT
 * acceptance:
 *
 * - the extension specs (`bridge`, `capture-triggers`, `popup`) launch a real
 *   Chromium with `--load-extension`, so they exist only in the chromium
 *   project; Firefox and Edge run the web-app specs only;
 * - the built-worker spec asserts on the production build, so it needs the
 *   preview server and lives in `playwright.preview.config.ts`;
 * - the benchmarks are measurement runs, not acceptance, and live in
 *   `playwright.benchmark.config.ts`.
 *
 * Scripts (root package.json):
 *   pnpm test:e2e             - the acceptance matrix (chromium, firefox, edge)
 *   pnpm test:e2e:preview     - the built-worker suite against `vite preview`
 *   pnpm test:e2e:benchmark   - optional measurement runs (slow; they overwrite
 *                               the Sprint 6 benchmark artifacts)
 */
import { defineConfig, devices } from "@playwright/test";

/** Specs that need a real Chromium with the built extension loaded. */
export const EXTENSION_SPECS = ["bridge.spec.ts", "capture-triggers.spec.ts", "popup.spec.ts"];
/** Specs that are measurement runs rather than acceptance. */
export const BENCHMARK_SPECS = ["search-benchmark.spec.ts", "search-benchmark-worker.spec.ts"];
/** Specs that need the production build served by `vite preview`. */
export const PREVIEW_SPECS = ["search-worker-built.spec.ts"];
/** Everything that is not part of the acceptance matrix. */
export const NON_ACCEPTANCE_SPECS = [...BENCHMARK_SPECS, ...PREVIEW_SPECS];

/** Dev-server URL shared by the acceptance and benchmark suites. */
export const APP_URL = "http://127.0.0.1:5199";

export default defineConfig({
  testDir: "./e2e",
  // Benchmarks and the built-worker spec are excluded from acceptance.
  testIgnore: NON_ACCEPTANCE_SPECS,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: APP_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], browserName: "chromium" } },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], browserName: "firefox" },
      // A project-level testIgnore replaces the config-level one, so the
      // non-acceptance specs have to be repeated here.
      testIgnore: [...NON_ACCEPTANCE_SPECS, ...EXTENSION_SPECS],
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], browserName: "chromium", channel: "msedge" },
      testIgnore: [...NON_ACCEPTANCE_SPECS, ...EXTENSION_SPECS],
    },
  ],
  webServer: {
    command: "pnpm --filter @fluid-deck/web dev",
    url: APP_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
