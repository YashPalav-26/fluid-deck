/**
 * IMPORT-008 - import/export round-trip against a real browser and real IndexedDB.
 *
 * The UI is driven exactly as a user would: Settings -> Import -> preview -> commit,
 * then Settings -> Export -> download, then a fresh browser context imports the
 * downloaded file. Comparisons use normalized semantic data (collection names, tag
 * names, URLs) so database ids and timestamps do not make the result flaky.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";

interface Row {
  [key: string]: unknown;
}

interface LibraryRows {
  resources: Row[];
  collections: Row[];
  tags: Row[];
  resourceCollections: Row[];
  resourceTags: Row[];
}

/** Reads the app's real IndexedDB - not fake-indexeddb, not jsdom. */
async function readLibrary(page: Page): Promise<LibraryRows> {
  return page.evaluate(async () => {
    const open = indexedDB.open("fluid-deck");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const readAll = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = database.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
    const names = ["resources", "collections", "tags", "resourceCollections", "resourceTags"];
    const entries = await Promise.all(names.map(async (name) => [name, await readAll(name)]));
    database.close();
    return Object.fromEntries(entries) as unknown as Record<string, unknown[]>;
  }) as Promise<LibraryRows>;
}

function semantic(rows: LibraryRows) {
  const collectionById = new Map(
    rows.collections.map((collection) => [collection["id"], collection]),
  );
  const tagNameById = new Map(rows.tags.map((tag) => [tag["id"], tag["name"]]));

  const collectionsByResource = new Map<string, string[]>();
  for (const join of rows.resourceCollections) {
    const name = collectionById.get(join["collectionId"] as string)?.["name"] as string | undefined;
    if (!name) continue;
    const list = collectionsByResource.get(join["resourceId"] as string) ?? [];
    list.push(name);
    collectionsByResource.set(join["resourceId"] as string, list);
  }
  const tagsByResource = new Map<string, string[]>();
  for (const join of rows.resourceTags) {
    const name = tagNameById.get(join["tagId"] as string);
    if (!name) continue;
    const list = tagsByResource.get(join["resourceId"] as string) ?? [];
    list.push(name);
    tagsByResource.set(join["resourceId"] as string, list);
  }

  return {
    resources: rows.resources
      .filter((resource) => resource["deletedAt"] === null)
      .map((resource) => ({
        url: resource["url"],
        title: resource["title"],
        description: resource["description"],
        notes: resource["notes"],
        type: resource["type"],
        faviconUrl: resource["faviconUrl"],
        thumbnailUrl: resource["thumbnailUrl"],
        tags: (tagsByResource.get(resource["id"] as string) ?? []).sort(),
        collections: (collectionsByResource.get(resource["id"] as string) ?? []).sort(),
      }))
      .sort((a, b) => String(a.url).localeCompare(String(b.url))),
    collections: rows.collections
      .map((collection) => ({
        name: collection["name"],
        parent:
          collection["parentId"] === null
            ? null
            : (collectionById.get(collection["parentId"] as string)?.["name"] ?? "?"),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

const HTML_FIXTURE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Fluid Deck round-trip</TITLE>
<H1>Fluid Deck round-trip</H1>
<DL><p>
    <DT><H3>Dev</H3>
    <DL><p>
        <DT><H3>Tools</H3>
        <DL><p>
            <DT><A HREF="https://alpha.example/one?a=1&amp;b=2" TAGS="reading, AI Tools">Alpha &amp; &lt;Beta&gt;</A>
            <DD>Line one &amp; more
        </DL><p>
    </DL><p>
    <DT><H3>Reading</H3>
    <DL><p>
        <DT><A HREF="https://beta.example/two" TAGS="reading">Beta</A>
    </DL><p>
</DL><p>
`;

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function importFile(page: Page, path: string, expectedNew: number) {
  await openSettings(page);
  await page.getByRole("button", { name: "Import bookmarks" }).click();
  const dialog = page.getByRole("dialog", { name: "Import bookmarks" });
  await dialog.getByLabel("Bookmark file").setInputFiles(path);
  await expect(dialog.getByText("New resources")).toBeVisible();
  await expect(dialog.locator("dd").first()).toHaveText(String(expectedNew));
  await dialog.getByRole("button", { name: "Import now" }).click();
  await expect(
    dialog.getByText(new RegExp(`Imported ${expectedNew} new resources\\.`)),
  ).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Done" }).click();
}

async function downloadExport(
  page: Page,
  format: "json" | "html",
  destination: string,
): Promise<string> {
  await openSettings(page);
  await page.getByRole("button", { name: "Export JSON" }).click();
  const dialog = page.getByRole("dialog", { name: "Export library" });
  await dialog.getByLabel("Format").selectOption(format);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export file" }).click();
  const download = await downloadPromise;
  await download.saveAs(destination);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  return destination;
}

/** A fresh context starts with an empty IndexedDB, so re-import is not a no-op. */
async function newAppPage(browser: Browser, url: string) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

test.describe("IMPORT-008 round-trip", () => {
  test("HTML import -> JSON export -> fresh import keeps the library identical", async ({
    page,
    browser,
  }, testInfo) => {
    const appUrl = testInfo.project.use.baseURL ?? "http://127.0.0.1:5199";
    const htmlPath = testInfo.outputPath("bookmarks.html");
    const jsonPath = testInfo.outputPath("fluid-deck-export.json");
    await fs.writeFile(htmlPath, HTML_FIXTURE, "utf8");

    await page.goto(appUrl);
    await importFile(page, htmlPath, 2);

    await page.getByRole("button", { name: "All resources" }).click();
    await expect(page.getByText("Showing 2 of 2 resources")).toBeVisible();

    const before = semantic(await readLibrary(page));
    expect(before.resources[0]?.url).toBe("https://alpha.example/one?a=1&b=2");
    expect(before.resources[0]?.tags).toEqual(["AI Tools", "reading"]);
    expect(before.resources[0]?.collections).toEqual(["Tools"]);

    await downloadExport(page, "json", jsonPath);

    const { context, page: fresh } = await newAppPage(browser, appUrl);
    try {
      await importFile(fresh, jsonPath, 2);
      await fresh.getByRole("button", { name: "All resources" }).click();
      await expect(fresh.getByText("Showing 2 of 2 resources")).toBeVisible();
      expect(semantic(await readLibrary(fresh))).toEqual(before);
    } finally {
      await context.close();
    }
  });

  test("HTML export -> fresh import keeps every representable field", async ({
    page,
    browser,
  }, testInfo) => {
    const appUrl = testInfo.project.use.baseURL ?? "http://127.0.0.1:5199";
    const htmlPath = testInfo.outputPath("bookmarks.html");
    const exportedPath = testInfo.outputPath("fluid-deck-export.html");
    await fs.writeFile(htmlPath, HTML_FIXTURE, "utf8");

    await page.goto(appUrl);
    await importFile(page, htmlPath, 2);
    const before = semantic(await readLibrary(page));

    await downloadExport(page, "html", exportedPath);
    const exported = await fs.readFile(exportedPath, "utf8");
    expect(exported).toContain("Alpha &amp; &lt;Beta&gt;");
    expect(exported).toContain('TAGS="AI Tools,reading"');
    expect(exported).toContain("<DD>Line one &amp; more");

    const { context, page: fresh } = await newAppPage(browser, appUrl);
    try {
      await importFile(fresh, exportedPath, 2);
      const after = semantic(await readLibrary(fresh));
      const representable = (rows: ReturnType<typeof semantic>) => ({
        resources: rows.resources.map((resource) => ({
          url: resource.url,
          title: resource.title,
          description: resource.description,
          tags: resource.tags,
          collections: resource.collections,
        })),
        collections: rows.collections,
      });
      expect(representable(after)).toEqual(representable(before));
    } finally {
      await context.close();
    }
  });

  test("imports and exports a 1200-item file across three batches", async ({ page }, testInfo) => {
    const appUrl = testInfo.project.use.baseURL ?? "http://127.0.0.1:5199";
    const jsonPath = testInfo.outputPath("large.json");
    const exportedPath = testInfo.outputPath("large-export.json");

    const items = Array.from({ length: 1200 }, (_, index) => ({
      _id: `item-${index}`,
      link: `https://bulk.example/item-${index}`,
      title: `Bulk item ${index}`,
      created: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
      tags: index % 10 === 0 ? [`group-${index % 30}`] : [],
      collection: { $id: "bulk" },
      collectionIds: ["bulk"],
    }));
    await fs.writeFile(
      jsonPath,
      JSON.stringify({
        result: true,
        version: 1,
        collections: [{ _id: "bulk", title: "Bulk", parent: null, sort: 0 }],
        tags: [],
        items,
      }),
      "utf8",
    );

    await page.goto(appUrl);
    const importStarted = Date.now();
    await importFile(page, jsonPath, 1200);
    const importMs = Date.now() - importStarted;

    const exportStarted = Date.now();
    await downloadExport(page, "json", exportedPath);
    const exportMs = Date.now() - exportStarted;

    const library = await readLibrary(page);
    expect(library.resources).toHaveLength(1200);
    const data = JSON.parse(await fs.readFile(exportedPath, "utf8")) as { items: unknown[] };
    expect(data.items).toHaveLength(1200);
    // Reported as wall-clock UI time on this machine, not an extrapolation.
    console.log(`IMPORT-008 large flow: import ${importMs} ms, export ${exportMs} ms`);
  });

  test("rejects malformed JSON and writes nothing", async ({ page }, testInfo) => {
    const appUrl = testInfo.project.use.baseURL ?? "http://127.0.0.1:5199";
    const badPath = testInfo.outputPath("broken.json");
    await fs.writeFile(badPath, '{"items": [{"link": "https://ok.example/"', "utf8");

    await page.goto(appUrl);
    await openSettings(page);
    await page.getByRole("button", { name: "Import bookmarks" }).click();
    const dialog = page.getByRole("dialog", { name: "Import bookmarks" });
    await dialog.getByLabel("Bookmark file").setInputFiles(badPath);
    await expect(dialog.getByRole("alert")).toContainText("not valid JSON");
    await dialog.getByRole("button", { name: "Close" }).click();

    const library = await readLibrary(page);
    expect(library.resources).toHaveLength(0);
  });
});
