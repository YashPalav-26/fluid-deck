/**
 * UI-004 - search interface end-to-end: debounced input, `/` shortcut,
 * facet + sort URL state (refresh / back / forward), the disabled-in-trash
 * rule, and a mobile-width smoke check. Seeds the real Dexie database and
 * reloads so boot builds the search index from it.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const dbMod = await import("/src/persistence/db.ts");
    const repo = await import("/src/repositories/resources.ts");
    const mk = (url: string, title: string, type: "article" | "video" = "article") => ({
      url,
      title,
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      type,
      source: "other" as const,
      notes: "",
      extractionStatus: "complete" as const,
      extractionNotes: [],
    });
    await repo.createResource(dbMod.db, mk("https://react.dev/learn", "React learn"));
    await repo.createResource(dbMod.db, mk("https://css-tricks.com/grid", "CSS grid guide"));
    await repo.createResource(
      dbMod.db,
      mk("https://youtube.com/watch?v=1", "React conf talk", "video"),
    );
  });
  await page.reload();
}

test("search filters the grid, `/` focuses, and clearing restores browsing", async ({ page }) => {
  await seed(page);
  const input = page.getByLabel("Search resources");
  await expect(page.getByTestId("grid-count")).toContainText("of 3 resources");

  await page.keyboard.press("/");
  await expect(input).toBeFocused();

  await input.fill("react");
  await expect(page).toHaveURL(/q=react/);
  await expect(page).toHaveURL(/sort=relevance/);
  await expect(page.getByTestId("search-status")).toContainText("2 matches");
  await expect(page.getByTestId("grid-count")).toContainText("of 2 resources");

  await input.fill("zzzz");
  await expect(page.getByTestId("grid-empty")).toContainText("No matches for");

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.getByTestId("grid-count")).toContainText("of 3 resources");
  await expect(page.getByTestId("search-status")).toHaveCount(0);
});

test("facets and sort live in the URL and survive refresh, back and forward", async ({ page }) => {
  await seed(page);
  const input = page.getByLabel("Search resources");

  await input.fill("react");
  // A real click on a facet control moves focus, which commits the draft.
  await input.blur();
  await page.getByLabel("Domain").selectOption("react.dev");
  await expect(page).toHaveURL(/domain=react.dev/);
  await expect(page.getByTestId("grid-count")).toContainText("of 1 resources");

  await page.getByLabel("Sort").selectOption("title-desc");
  await expect(page).toHaveURL(/sort=title-desc/);

  const filteredUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(filteredUrl);
  await expect(input).toHaveValue("react");
  await expect(page.getByLabel("Domain")).toHaveValue("react.dev");
  await expect(page.getByLabel("Sort")).toHaveValue("title-desc");
  await expect(page.getByTestId("grid-count")).toContainText("of 1 resources");

  await page.goBack();
  await expect(page).toHaveURL(/domain=react\.dev/);
  await expect(page).not.toHaveURL(/sort=title-desc/);
  await expect(page.getByLabel("Sort")).not.toHaveValue("title-desc");
  await expect(page.getByTestId("grid-count")).toContainText("of 1 resources");

  await page.goBack();
  await expect(page).not.toHaveURL(/domain=/);
  await expect(page.getByLabel("Domain")).toHaveValue("");
  await expect(page.getByTestId("grid-count")).toContainText("of 2 resources");

  await page.goForward();
  await expect(page).toHaveURL(/domain=react.dev/);
  await expect(page.getByTestId("grid-count")).toContainText("of 1 resources");

  await page.goForward();
  await expect(page).toHaveURL(/sort=title-desc/);
  await expect(page.getByLabel("Sort")).toHaveValue("title-desc");
  await expect(page.getByTestId("grid-count")).toContainText("of 1 resources");
});

test("trash disables search and drops the query, and back restores it", async ({ page }) => {
  await seed(page);
  const input = page.getByLabel("Search resources");

  await input.fill("react");
  await expect(page).toHaveURL(/q=react/);

  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page).toHaveURL(/view=trash/);
  await expect(page).not.toHaveURL(/q=/);
  await expect(input).toBeDisabled();
  await expect(page.getByTestId("grid-empty")).toContainText("Trash is empty");

  await page.goBack();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("react");
  await expect(page.getByTestId("grid-count")).toContainText("of 2 resources");
});

test("search input is reachable on a phone-width viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await seed(page);
  const input = page.getByLabel("Search resources");
  await expect(input).toBeVisible();
  await input.fill("css");
  await expect(page.getByTestId("search-status")).toContainText("1 match");
});
