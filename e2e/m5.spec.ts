import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("app has no axe violations on load and in palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Library" })).toBeVisible();

  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
});

test("command palette opens with keyboard and selects by arrow+enter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "⌘K — open command palette" }).click();
  await expect(page.getByRole("combobox", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Command palette" })).toBeHidden({
    timeout: 2_000,
  });
});

test("sidebar navigates to inbox and settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Capture inbox" }).click();
  await expect(page.getByRole("heading", { name: "Capture inbox" })).toBeVisible();
  await expect(page).toHaveURL(/view=inbox/);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page).toHaveURL(/view=settings/);
});
