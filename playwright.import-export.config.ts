/**
 * Historical alias: the import/export specs used to own a configuration so they
 * could run the three-browser matrix while the default suite ran Chromium only.
 * M9-040 folded that coverage into the canonical configuration (the
 * chromium / firefox / edge projects), so this file only narrows the spec
 * selection and inherits everything else - projects, timeouts and the dev
 * server - from `playwright.config.ts`.
 *
 * Prefer `pnpm test:e2e` (the full acceptance matrix).
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /import-(export|screens)\.spec\.ts/,
});
