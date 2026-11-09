/**
 * UI-001/UI-002 - library service: browse filters, sort, 500 cap, windowing.
 * Runs on fake-indexeddb via the shared test fixture (simulated, not a browser).
 */
import { describe, expect, it } from "vitest";
import { EMPTY_VIEW_STATE } from "@fluid-deck/core";
import type { ViewState } from "@fluid-deck/core";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createResource } from "../repositories/resources.ts";
import { createCollection } from "../repositories/collections.ts";
import { createTag } from "../repositories/tags.ts";
import { addResourceToCollection, addTagToResource } from "../repositories/relationships.ts";
import {
  getLibraryResources,
  nextWindowSize,
  windowedResources,
  GRID_WINDOW_SIZE,
  RESOURCE_GRID_CAP,
} from "./library.ts";

const fixture = useTestDatabase();

function input(url: string, title: string) {
  return {
    url,
    title,
    description: "",
    thumbnailUrl: "",
    faviconUrl: "",
    type: "article" as const,
    source: "other" as const,
    notes: "",
    extractionStatus: "complete" as const,
    extractionNotes: [],
  };
}

describe("getLibraryResources", () => {
  it("returns live resources newest-first and excludes trashed", async () => {
    const first = await createResource(fixture.db, input("https://example.com/a", "First"));
    await createResource(fixture.db, input("https://example.com/b", "Second"));
    const view = await getLibraryResources(fixture.db, EMPTY_VIEW_STATE);
    expect(view.map((r) => r.title)).toEqual(["Second", "First"]);
    expect(view.map((r) => r.id)).toContain(first.resource.id);
  });

  it("filters by type, collection and tag (tags OR together)", async () => {
    const { collection } = await createCollection(fixture.db, { name: "Reading", parentId: null });
    const { tag: react } = await createTag(fixture.db, "react");
    const { tag: css } = await createTag(fixture.db, "css");
    const inCollection = await createResource(
      fixture.db,
      input("https://example.com/c", "In collection"),
    );
    const tagged = await createResource(fixture.db, input("https://example.com/d", "Tagged"));
    await createResource(fixture.db, input("https://example.com/e", "Plain"));
    await addResourceToCollection(fixture.db, inCollection.resource.id, collection.id);
    await addTagToResource(fixture.db, tagged.resource.id, react.id);
    await addTagToResource(fixture.db, tagged.resource.id, css.id);

    const byCollection = await getLibraryResources(fixture.db, {
      ...EMPTY_VIEW_STATE,
      collection: collection.id,
    });
    expect(byCollection.map((r) => r.id)).toEqual([inCollection.resource.id]);

    const byTags = await getLibraryResources(fixture.db, {
      ...EMPTY_VIEW_STATE,
      tags: ["react", "css"],
    });
    expect(byTags.map((r) => r.id)).toEqual([tagged.resource.id]);

    const byType: ViewState = { ...EMPTY_VIEW_STATE, type: "video" };
    expect(await getLibraryResources(fixture.db, byType)).toEqual([]);
  });

  it("sorts by title and caps at 500", async () => {
    await createResource(fixture.db, input("https://example.com/z", "Zebra"));
    await createResource(fixture.db, input("https://example.com/a", "Apple"));
    const sorted = await getLibraryResources(fixture.db, {
      ...EMPTY_VIEW_STATE,
      sort: "title-asc",
    });
    expect(sorted.map((r) => r.title)).toEqual(["Apple", "Zebra"]);
    expect(RESOURCE_GRID_CAP).toBe(500);
  });
});

describe("windowing", () => {
  it("renders a 50-card window that grows to the cap", () => {
    const items = Array.from({ length: 600 }, (_, i) => i);
    expect(windowedResources(items, GRID_WINDOW_SIZE)).toHaveLength(50);
    expect(nextWindowSize(50)).toBe(100);
    expect(nextWindowSize(490)).toBe(500);
    expect(windowedResources(items, 500)).toHaveLength(500);
  });
});
