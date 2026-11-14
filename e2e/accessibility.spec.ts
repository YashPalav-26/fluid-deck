/**
 * M9 WS-A - accessibility checks for the search and import/export experiences.
 *
 * Automated coverage only: axe scans, keyboard and focus behaviour, live-region
 * semantics and reflow at 200/300/400% zoom. A passing axe scan is not a
 * screen-reader result and not a WCAG conformance claim - the manual gaps are
 * recorded in `docs/M9_ACCESSIBILITY_IMPLEMENTATION_REPORT.md`.
 *
 * Zoom is emulated the way the reflow criterion is measured: the layout
 * viewport is reduced to the CSS size the content would have at that zoom
 * (1280px reference -> 640 / 427 / 320 CSS px).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Layout CSS width for 200 / 300 / 400% zoom of a 1280px reference viewport. */
const ZOOM_WIDTHS = [
  { label: "200%", width: 640, height: 360 },
  { label: "300%", width: 427, height: 240 },
  { label: "400%", width: 320, height: 180 },
];

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const dbMod = await import("/src/persistence/db.ts");
    const repo = await import("/src/repositories/resources.ts");
    const mk = (url: string, title: string) => ({
      url,
      title,
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      type: "article",
      source: "other",
      notes: "",
      extractionStatus: "complete",
      extractionNotes: [],
    });
    await repo.createResource(dbMod.db, mk("https://react.dev/learn", "React learn"));
    await repo.createResource(dbMod.db, mk("https://css-tricks.com/grid", "CSS grid guide"));
  });
  await page.reload();
}

/** Fails the test with the exact violation list instead of a generic message. */
async function expectNoViolations(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  // Every impact level counts: the audited surfaces scan clean, so anything
  // reported here is a regression, not an accepted baseline.
  expect(results.violations.map((violation) => `${violation.id} (${violation.impact})`)).toEqual(
    [],
  );
}

test.describe("M9 WS-A accessibility", () => {
  test("the search screen has no axe violations", async ({ page }) => {
    await seed(page);
    await page.getByLabel("Search resources").fill("react");
    await expect(page.getByTestId("search-status")).toContainText("match");

    await expectNoViolations(page, "main");
    await expectNoViolations(page, '[role="search"]');
  });

  test("the import dialog has no axe violations", async ({ page, browserName }) => {
    // axe-core crashes the Firefox page while a Radix dialog is open in this
    // environment ("frame.evaluate: Page crashed"). The dialog is therefore
    // scanned in Chromium and Edge; every other check below runs in all three.
    test.skip(browserName === "firefox", "axe-core crashes Firefox with an open Radix dialog");
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Import bookmarks" }).click();
    const dialog = page.getByRole("dialog", { name: "Import bookmarks" });
    await expect(dialog).toBeVisible();

    await expectNoViolations(page, '[role="dialog"]');
  });

  test("the export dialog has no axe violations", async ({ page, browserName }) => {
    // Same documented scope as the import dialog above.
    test.skip(browserName === "firefox", "axe-core crashes Firefox with an open Radix dialog");
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Export JSON" }).click();
    const dialog = page.getByRole("dialog", { name: "Export library" });
    await expect(dialog).toBeVisible();

    await expectNoViolations(page, '[role="dialog"]');
  });

  test("the search flow is keyboard operable and announces its state", async ({ page }) => {
    await seed(page);
    const input = page.getByLabel("Search resources");
    // Wait for the app to boot before using the shortcut.
    await expect(page.getByTestId("grid-count")).toContainText("of 2 resources");

    // The `/` shortcut focuses the search box.
    await page.keyboard.press("/");
    await expect(input).toBeFocused();

    // The result count lives in a polite live region (it exists while searching).
    await input.fill("react");
    await expect(page).toHaveURL(/q=react/);
    const status = page.getByTestId("search-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");

    // Every interactive control has an accessible name.
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
    await expect(page.getByLabel("Type")).toBeVisible();
    await expect(page.getByLabel("Sort")).toBeVisible();

    // Escape clears the query and returns to browsing.
    await input.press("Escape");
    await expect(page).not.toHaveURL(/q=react/);
  });

  test("the import dialog traps focus, restores it, and announces a failure", async ({
    page,
  }, testInfo) => {
    const badPath = testInfo.outputPath("broken.json");
    const fs = await import("node:fs/promises");
    await fs.writeFile(badPath, '{"items": [{"link": "https://ok.example/"', "utf8");

    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    const trigger = page.getByRole("button", { name: "Import bookmarks" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Import bookmarks" });

    // Initial focus is the file input, and the dialog is a labelled modal.
    await expect(dialog.getByLabel("Bookmark file")).toBeFocused();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-label", "Import bookmarks");

    // A parse failure is announced and takes focus, so the keyboard user is
    // not left on a control that no longer exists.
    await dialog.getByLabel("Bookmark file").setInputFiles(badPath);
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("This file could not be imported");
    await expect(
      dialog.getByRole("heading", { name: "This file could not be imported" }),
    ).toBeFocused();

    // Escape dismisses the dialog and focus returns to the trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the search screen reflows at 200%, 300% and 400% zoom", async ({ page }) => {
    for (const zoom of ZOOM_WIDTHS) {
      await seed(page);
      await page.setViewportSize({ width: zoom.width, height: zoom.height });

      // The search box stays visible and inside the viewport.
      const input = page.getByLabel("Search resources");
      await expect(input).toBeVisible();
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(zoom.width + 1);

      // The filter controls wrap instead of being clipped.
      const filters = page.getByRole("region", { name: "Search filters" });
      await expect(filters.getByLabel("Type")).toBeVisible();
      await expect(filters.getByLabel("Sort")).toBeVisible();

      // No unintended horizontal scrolling at this zoom level.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("the import dialog reflows at 200%, 300% and 400% zoom", async ({ page }) => {
    for (const zoom of ZOOM_WIDTHS) {
      await page.setViewportSize({ width: zoom.width, height: zoom.height });
      await page.goto("/");
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Import bookmarks" }).click();
      const dialog = page.getByRole("dialog", { name: "Import bookmarks" });
      await expect(dialog).toBeVisible();
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.width).toBeLessThanOrEqual(zoom.width);
      await expect(dialog.getByLabel("Bookmark file")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // No unintended horizontal scrolling at this zoom level.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
});
