/**
 * UI-004 - the Search Service contract the UI depends on: canonical
 * ViewState sorts, the 500-result cap + truncation metadata, and the facet
 * semantics the filter bar exposes (tags OR, unorganized, domain).
 * fake-indexeddb fixture; no worker, so the main-thread index is used.
 */
import { describe, expect, it } from "vitest";
import { resourceSchema } from "@fluid-deck/core";
import type { Resource } from "@fluid-deck/core";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createResource, listResources } from "../repositories/resources.ts";
import { createCollection } from "../repositories/collections.ts";
import { createTag } from "../repositories/tags.ts";
import { addResourceToCollection, addTagToResource } from "../repositories/relationships.ts";
import { createSearchIndex, SEARCH_RESULT_CAP, searchFaceted } from "./search.ts";

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

async function ids(result: { resources: Resource[] }): Promise<string[]> {
  return result.resources.map((resource) => resource.id);
}

async function indexForCurrentDb() {
  return createSearchIndex(await listResources(fixture.db));
}

describe("faceted search sort vocabulary (UI-004)", () => {
  it("maps newest/oldest to createdAt, not updatedAt", async () => {
    const first = await createResource(fixture.db, input("https://example.com/one", "One"));
    const second = await createResource(fixture.db, input("https://example.com/two", "Two"));
    // Touch the older resource so createdAt and updatedAt disagree.
    await fixture.db.resources.update(first.resource.id, { updatedAt: Date.now() + 1000 });

    const newest = await searchFaceted(fixture.db, { q: "", sort: "newest" });
    expect(await ids(newest)).toEqual([second.resource.id, first.resource.id]);

    const oldest = await searchFaceted(fixture.db, { q: "", sort: "oldest" });
    expect(await ids(oldest)).toEqual([first.resource.id, second.resource.id]);
  });

  it("supports title asc/desc, most-tagged and recently-opened", async () => {
    const zebra = await createResource(fixture.db, input("https://example.com/z", "Zebra"));
    const apple = await createResource(fixture.db, input("https://example.com/a", "Apple"));
    const mango = await createResource(fixture.db, input("https://example.com/m", "Mango"));

    const { tag: react } = await createTag(fixture.db, "react");
    const { tag: css } = await createTag(fixture.db, "css");
    await addTagToResource(fixture.db, mango.resource.id, react.id);
    await addTagToResource(fixture.db, mango.resource.id, css.id);
    await addTagToResource(fixture.db, apple.resource.id, react.id);
    await fixture.db.resources.update(apple.resource.id, { lastOpenedAt: 9000 });
    await fixture.db.resources.update(zebra.resource.id, { lastOpenedAt: 5000 });

    const asc = await searchFaceted(fixture.db, { q: "", sort: "title-asc" });
    expect(asc.resources.map((r) => r.title)).toEqual(["Apple", "Mango", "Zebra"]);

    const desc = await searchFaceted(fixture.db, { q: "", sort: "title-desc" });
    expect(desc.resources.map((r) => r.title)).toEqual(["Zebra", "Mango", "Apple"]);

    const tagged = await searchFaceted(fixture.db, { q: "", sort: "most-tagged" });
    expect(tagged.resources[0]?.id).toBe(mango.resource.id);

    const opened = await searchFaceted(fixture.db, { q: "", sort: "recently-opened" });
    expect(opened.resources[0]?.id).toBe(apple.resource.id);
    expect(opened.resources[1]?.id).toBe(zebra.resource.id);
  });

  it("ranks keyword hits by relevance and keeps the explicit sort when asked", async () => {
    await createResource(fixture.db, input("https://example.com/patterns", "React patterns"));
    await createResource(fixture.db, input("https://cooking.example.com/recipes", "Cooking"));
    const index = await indexForCurrentDb();

    const relevance = await searchFaceted(index, fixture.db, { q: "react", sort: "relevance" });
    expect(relevance.resources).toHaveLength(1);
    expect(relevance.resources[0]?.title).toBe("React patterns");

    const byTitle = await searchFaceted(index, fixture.db, { q: "react", sort: "title-asc" });
    expect(byTitle.resources[0]?.title).toBe("React patterns");
  });
});

describe("faceted search filters (UI-004)", () => {
  it("ORs tags and filters by domain and unorganized", async () => {
    const { collection } = await createCollection(fixture.db, { name: "Reading", parentId: null });
    const { tag: react } = await createTag(fixture.db, "react");
    const { tag: css } = await createTag(fixture.db, "css");

    const inCollection = await createResource(
      fixture.db,
      input("https://example.com/collected", "Collected"),
    );
    const reactOnly = await createResource(
      fixture.db,
      input("https://other.org/react", "React only"),
    );
    const loose = await createResource(fixture.db, input("https://third.net/loose", "Loose"));

    await addResourceToCollection(fixture.db, inCollection.resource.id, collection.id);
    await addTagToResource(fixture.db, inCollection.resource.id, react.id);
    await addTagToResource(fixture.db, reactOnly.resource.id, css.id);

    const orTags = await searchFaceted(fixture.db, { q: "", tags: ["react", "css"] });
    expect(new Set(await ids(orTags))).toEqual(
      new Set([inCollection.resource.id, reactOnly.resource.id]),
    );

    const byDomain = await searchFaceted(fixture.db, { q: "", domain: "other.org" });
    expect(await ids(byDomain)).toEqual([reactOnly.resource.id]);

    const unorganized = await searchFaceted(fixture.db, { q: "", unorganized: true });
    expect(new Set(await ids(unorganized))).toEqual(
      new Set([reactOnly.resource.id, loose.resource.id]),
    );
  });
});

describe("faceted search cap (UI-004)", () => {
  it("caps at 500 and reports the truncation honestly", async () => {
    const now = Date.now();
    const rows = Array.from({ length: SEARCH_RESULT_CAP + 1 }, (_, index) =>
      resourceSchema.parse({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        url: `https://bulk.example.com/${index}`,
        canonicalUrl: `https://bulk.example.com/${index}`,
        title: `Bulk ${index}`,
        description: "",
        thumbnailUrl: "",
        faviconUrl: "",
        domain: "bulk.example.com",
        type: "article",
        source: "other",
        notes: "",
        extractionStatus: "complete",
        extractionNotes: [],
        createdAt: now - index,
        updatedAt: now - index,
        lastOpenedAt: null,
        deletedAt: null,
      }),
    );
    await fixture.db.resources.bulkPut(rows);

    const result = await searchFaceted(fixture.db, { q: "" });
    expect(result.resources).toHaveLength(SEARCH_RESULT_CAP);
    expect(result.total).toBe(SEARCH_RESULT_CAP + 1);
    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBe(1);
    expect(result.cap).toBe(SEARCH_RESULT_CAP);
  });

  it("honours a smaller explicit cap without claiming completeness", async () => {
    await createResource(fixture.db, input("https://cap.example.com/1", "Cap one"));
    await createResource(fixture.db, input("https://cap.example.com/2", "Cap two"));
    await createResource(fixture.db, input("https://cap.example.com/3", "Cap three"));

    const result = await searchFaceted(fixture.db, { q: "", cap: 2 });
    expect(result.resources).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.omittedCount).toBe(1);
  });
});
