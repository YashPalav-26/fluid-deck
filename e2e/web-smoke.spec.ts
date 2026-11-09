import { expect, test } from "@playwright/test";

test("web shell renders with sidebar and grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Library" })).toBeVisible();
  await expect(page.getByTestId("grid-empty")).toContainText("No resources yet");
});

test("sidebar navigation sets URL state and back/forward works", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Trash" }).click();
  await expect(page).toHaveURL(/view=trash/);
  await expect(page.getByTestId("grid-empty")).toContainText("Trash is empty");

  await page.goBack();
  await expect(page).not.toHaveURL(/view=trash/);
  await expect(page.getByTestId("grid-empty")).toContainText("No resources yet");

  await page.goForward();
  await expect(page).toHaveURL(/view=trash/);
});

test("boot opens the real IndexedDB database", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
  const databases = await page.evaluate(async () => {
    const list = await indexedDB.databases();
    return list.map((entry) => entry.name).sort();
  });
  expect(databases).toContain("fluid-deck");
});
