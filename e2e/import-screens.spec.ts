/**
 * IMPORT-009 - import screens against a real browser and real IndexedDB.
 *
 * Covers the acceptance contract from the M8 plan: the picker opens and focuses,
 * per-batch progress is shown, validation warnings surface, a parse failure shows
 * a dismissible error summary with a working "Re-run", dismissal writes nothing,
 * "Import another file" returns to the picker, and the dialog survives a phone
 * viewport.
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function countResources(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const open = indexedDB.open("fluid-deck");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = database.transaction("resources", "readonly").objectStore("resources").count();
    const total = await new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return total;
  });
}

async function openImport(page: Page) {
  await page.goto("http://127.0.0.1:5199");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Import bookmarks" }).click();
  return page.getByRole("dialog", { name: "Import bookmarks" });
}

test.describe("IMPORT-009 import screens", () => {
  test("parse failure shows a dismissible error summary and re-run returns to the picker", async ({
    page,
  }, testInfo) => {
    const badPath = testInfo.outputPath("broken.json");
    await fs.writeFile(badPath, '{"items": [{"link": "https://ok.example/"', "utf8");

    const dialog = await openImport(page);
    const picker = dialog.getByLabel("Bookmark file");
    await expect(picker).toBeFocused();

    await picker.setInputFiles(badPath);

    const summary = dialog.getByRole("alert");
    await expect(summary).toContainText("This file could not be imported");
    await expect(summary).toContainText("not valid JSON");
    await expect(summary).toContainText("File corrupted. Re-export from source.");
    await expect(picker).toBeHidden();

    await dialog.getByRole("button", { name: "Re-run" }).click();
    await expect(picker).toBeVisible();
    await expect(picker).toBeFocused();
    expect(await countResources(page)).toBe(0);

    await picker.setInputFiles(badPath);
    await dialog.getByRole("button", { name: "Dismiss" }).click();
    await expect(dialog).toBeHidden();
    expect(await countResources(page)).toBe(0);
  });

  test("reports batch progress, completes, and offers another file", async ({ page }, testInfo) => {
    const jsonPath = testInfo.outputPath("bulk.json");
    const items = Array.from({ length: 1200 }, (_, index) => ({
      _id: `item-${index}`,
      link: `https://screens.example/item-${index}`,
      title: `Screen item ${index}`,
    }));
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ result: true, collections: [], tags: [], items }),
      "utf8",
    );

    const dialog = await openImport(page);
    await dialog.getByLabel("Bookmark file").setInputFiles(jsonPath);
    await expect(dialog.getByText("New resources")).toBeVisible();
    await dialog.getByRole("button", { name: "Import now" }).click();

    const progress = dialog.getByRole("progressbar", { name: "Import progress" });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("max", "1200");
    await expect(dialog.getByText(/Batch \d+: \d+ of 1200 resources/)).toBeVisible();

    await expect(dialog.getByText(/Imported 1200 new resources/)).toBeVisible({ timeout: 60_000 });
    expect(await countResources(page)).toBe(1200);

    await dialog.getByRole("button", { name: "Import another file" }).click();
    await expect(dialog.getByLabel("Bookmark file")).toBeVisible();
    expect(await countResources(page)).toBe(1200);
  });

  test("surfaces partial validation warnings without blocking the import", async ({
    page,
  }, testInfo) => {
    const jsonPath = testInfo.outputPath("partial.json");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({
        result: true,
        collections: [],
        tags: [],
        items: [
          { _id: 1, link: "https://partial.example/kept", title: "Kept" },
          { _id: 2, link: null, title: "Broken" },
        ],
      }),
      "utf8",
    );

    const dialog = await openImport(page);
    await dialog.getByLabel("Bookmark file").setInputFiles(jsonPath);

    const warnings = dialog.getByText(/skipped or adjusted during validation/);
    await expect(warnings).toBeVisible();
    await warnings.click();
    await expect(dialog.getByText(/resource #2: /)).toBeVisible();
    await expect(dialog.getByText("Skipped during validation")).toBeVisible();
  });

  test("closes on Escape without writing when idle", async ({ page }) => {
    const dialog = await openImport(page);
    await expect(dialog.getByLabel("Bookmark file")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await countResources(page)).toBe(0);
  });

  test("stays inside a 375px viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const jsonPath = testInfo.outputPath("small.json");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({
        result: true,
        collections: [{ _id: 1, title: "Mobile" }],
        tags: [],
        items: [{ _id: 1, link: "https://mobile.example/one", title: "Mobile one" }],
      }),
      "utf8",
    );

    const dialog = await openImport(page);
    await dialog.getByLabel("Bookmark file").setInputFiles(jsonPath);
    await expect(dialog.getByRole("button", { name: "Import now" })).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeLessThanOrEqual(375);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
