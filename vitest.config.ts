import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Domain/database suites only. React component tests arrive with UI-001+.
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    environment: "node",
  },
});
