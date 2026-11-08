import { expect, test } from "@playwright/test";

test("web shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
  await expect(page.getByTestId("env-status")).toContainText("Development environment OK");
});
