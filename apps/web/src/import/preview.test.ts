// @vitest-environment jsdom
/**
 * IMPORT-005 - read-only preview and HTML folder-membership carry-forward.
 *
 * DOMPurify needs a DOM (HTML validation); Dexie runs on fake-indexeddb. Every
 * preview assertion is made against real committed state, so "preview counts match
 * commit" is observed rather than assumed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listSiblings } from "../repositories/collections.ts";
import { createResource, softDeleteResource } from "../repositories/resources.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { commitImport } from "./commit.ts";
import { previewImport } from "./preview.ts";
import { validateHtmlImport, validateRaindropImport } from "./validate.ts";

const IMPORTS_DIR = path.resolve("e2e/fixtures/import");
const read = (...parts: string[]) => fs.readFileSync(path.join(IMPORTS_DIR, ...parts), "utf8");

const smallJson = read("raindrop", "small.json");
const chromeHtml = read("html", "chrome-bookmarks.html");

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

async function tableCounts(database: FluidDeckDatabase) {
  return {
    resources: await database.resources.count(),
    collections: await database.collections.count(),
    resourceCollections: await database.resourceCollections.count(),
    tags: await database.tags.count(),
    resourceTags: await database.resourceTags.count(),
  };
}

describe("IMPORT-005: preview counts", () => {
  it("counts a fresh Raindrop import without writing anything", async () => {
    const validated = validateRaindropImport(smallJson);
    const before = await tableCounts(db);

    const preview = await previewImport(db, validated);

    expect(preview.counts.resources).toBe(validated.resources.length);
    expect(preview.counts.newResources).toBe(validated.resources.length);
    expect(preview.counts.duplicates).toBe(0);
    expect(preview.counts.collections).toBe(validated.collections.length);
    expect(preview.counts.skipped).toBe(validated.warnings.length);
    expect(preview.counts.tags).toBeGreaterThan(0);
    expect(preview.collectionCounts).toHaveLength(validated.collections.length);
    expect(await tableCounts(db)).toEqual(before);
  });

  it("is deterministic across repeated previews", async () => {
    const validated = validateRaindropImport(smallJson);

    const first = await previewImport(db, validated);
    const second = await previewImport(db, validated);

    expect(second).toEqual(first);
  });

  it("reports duplicates as conflicts and keeps new + duplicate = resources", async () => {
    const validated = validateRaindropImport(smallJson);
    const target = validated.resources[0];
    if (!target) throw new Error("fixture has no resources");
    const existing = await createResource(db, { url: target.input.url, title: "Stored title" });

    const preview = await previewImport(db, validated);

    expect(preview.counts.duplicates).toBe(1);
    expect(preview.counts.newResources).toBe(validated.resources.length - 1);
    expect(preview.counts.newResources + preview.counts.duplicates).toBe(preview.counts.resources);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]).toMatchObject({
      canonicalUrl: existing.resource.canonicalUrl,
      incoming: { url: target.input.url },
      existing: { id: existing.resource.id, title: "Stored title" },
    });
  });

  it("treats a soft-deleted row as a conflict, matching the unique index", async () => {
    const validated = validateRaindropImport(smallJson);
    const target = validated.resources[0];
    if (!target) throw new Error("fixture has no resources");
    const existing = await createResource(db, { url: target.input.url, title: "Deleted" });
    await softDeleteResource(db, existing.resource.id);

    const preview = await previewImport(db, validated);

    expect(preview.counts.duplicates).toBe(1);
    expect(preview.conflicts[0]?.canonicalUrl).toBe(existing.resource.canonicalUrl);
  });

  it("preview counts match the committed result for the real fixture", async () => {
    const validated = validateRaindropImport(smallJson);

    const preview = await previewImport(db, validated);
    const result = await commitImport(db, validated, { defaultResolution: "skip" });

    expect(result.created).toBe(preview.counts.newResources);
    expect(result.duplicates).toBe(preview.counts.duplicates);
    expect(await db.resources.count()).toBe(preview.counts.resources);
    expect(await db.collections.count()).toBe(preview.counts.collections);
  });
});

describe("IMPORT-005: HTML folder membership", () => {
  it("carries exported folders into collections and per-bookmark memberships", async () => {
    const validated = validateHtmlImport(chromeHtml);
    const preview = await previewImport(db, validated);

    expect(preview.counts.resources).toBe(10);
    expect(preview.counts.collections).toBe(3);
    expect(preview.collectionCounts).toEqual([
      { name: "Unorganized", count: 5 },
      { name: "Development", count: 3 },
      { name: "Design", count: 2 },
    ]);

    const result = await commitImport(db, validated);

    expect(result.created).toBe(10);
    expect(await db.collections.count()).toBe(3);
    expect(await db.resourceCollections.count()).toBe(10);

    const react = await db.resources.where("canonicalUrl").equals("https://reactjs.org/").first();
    expect(react).toBeDefined();
    const joins = await db.resourceCollections
      .where("resourceId")
      .equals(react?.id ?? "")
      .toArray();
    expect(joins).toHaveLength(1);
    const folder = await db.collections.get(joins[0]?.collectionId ?? "");
    expect(folder?.name).toBe("Development");
  });

  it("preserves nested folders as a real tree", async () => {
    const nested =
      "<DL><p><DT><H3>Dev</H3><DL><p>" +
      '<DT><A HREF="https://nested.example/a">A</A>' +
      "<DT><H3>Tools</H3><DL><p>" +
      '<DT><A HREF="https://nested.example/b">B</A>' +
      "</DL></DL></DL>";

    const validated = validateHtmlImport(nested);
    expect(validated.collections.map((collection) => collection.name)).toEqual(["Dev", "Tools"]);
    expect(validated.collections[1]?.parentSourceId).toBe(validated.collections[0]?.sourceId);

    const preview = await previewImport(db, validated);
    expect(preview.collectionCounts).toEqual([
      { name: "Dev", count: 1 },
      { name: "Tools", count: 1 },
    ]);

    await commitImport(db, validated);

    const roots = await listSiblings(db, null);
    expect(roots.map((collection) => collection.name)).toEqual(["Dev"]);
    const children = await listSiblings(db, roots[0]?.id ?? "");
    expect(children.map((collection) => collection.name)).toEqual(["Tools"]);
  });
});
