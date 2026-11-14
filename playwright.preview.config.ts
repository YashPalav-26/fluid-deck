/**
 * Built-worker suite: the production build served by `vite preview`.
 *
 * This is a separate configuration on purpose. `search-worker-built.spec.ts`
 * reads the built entry chunk and asserts that it references the hashed
 * `search.worker-*.js` asset, which only exists in a production build - the dev
 * server never emits that reference, so the spec cannot run against it. The
 * preview server also needs its own port and must never reuse a running dev
 * server, otherwise the spec would silently test the wrong runtime.
 *
 * Run with `pnpm test:e2e:preview` (it builds the web app first).
 */
import { defineConfig, devices } from "@playwright/test";

/** Preview-server URL; deliberately different from the dev-server port. */
export const PREVIEW_URL = "http://127.0.0.1:5200";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /search-worker-built\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: PREVIEW_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], browserName: "chromium" } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" } },
  ],
  webServer: {
    command: "pnpm --filter @fluid-deck/web preview --host 127.0.0.1 --port 5200 --strictPort",
    url: PREVIEW_URL,
    // Never reuse an existing server: a dev server on this port would serve
    // source modules instead of the production bundle this suite asserts on.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
