import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5199" },
  webServer: {
    command: "pnpm --filter @fluid-deck/web dev",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
