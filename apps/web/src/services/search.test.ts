import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { resourceSchema } from "@fluid-deck/core";
import type { Resource } from "@fluid-deck/core";
import { FluidDeckDatabase } from "../persistence/db.ts";
import {
  createSearchIndex,
  getSearchIndexState,
  rebuildSearchIndex,
  searchIndex,
  searchResources,
  syncResource,
} from "./search.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeResource(id: number, title: string, overrides: Partial<Resource> = {}): Resource {
  const now = 1000 + id;
  return resourceSchema.parse({
    id: UUID(id),
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title,
    description: overrides.description ?? "",
    thumbnailUrl: "",
    faviconUrl: "",
    domain: "example.com",
    type: overrides.type ?? "article",
    source: "extension",
    notes: "",
    extractionStatus: "complete",
    extractionNotes: [],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    lastOpenedAt: null,
    deletedAt: null,
    ...overrides,
  });
}

describe("search (SEARCH-002)", () => {
  it("returns [] for an empty query", () => {
    const r1 = makeResource(1, "React Hooks");
    const index = createSearchIndex([r1]);
    expect(searchIndex(index, "").hits).toEqual([]);
    expect(searchIndex(index, "   ").hits).toEqual([]);
  });

  it("AND semantics: multi-term query requires all terms", () => {
    const a = makeResource(1, "React Hooks Guide");
    const b = makeResource(2, "React Basics");
    const c = makeResource(3, "Vue Hooks");
    const index = createSearchIndex([a, b, c]);
    const ids = searchResources(index, "react hooks").map((r) => r.id);
    expect(ids).toEqual([UUID(1)]);
  });

  it("degrades to OR when AND yields no results, marks partial", () => {
    const a = makeResource(1, "React Guide");
    const b = makeResource(2, "Vue Hooks");
    const index = createSearchIndex([a, b]);
    const { hits, partial } = searchIndex(index, "react hooks");
    expect(partial).toBe(true);
    expect(hits.map((h) => h.resource.id).sort()).toEqual([UUID(1), UUID(2)].sort());
  });

  it("pins an exact title match above all others", () => {
    const exact = makeResource(1, "react", { updatedAt: 5000 });
    const other = makeResource(2, "React Hooks", { updatedAt: 9999 });
    const index = createSearchIndex([exact, other]);
    const hits = searchIndex(index, "react").hits;
    expect(hits[0]!.resource.id).toBe(UUID(1));
  });

  it("supports prefix search", () => {
    const r = makeResource(1, "Motorcycle Maintenance");
    const index = createSearchIndex([r]);
    expect(searchResources(index, "moto").map((r) => r.id)).toEqual([UUID(1)]);
  });

  it("supports fuzzy search for typos", () => {
    const r = makeResource(1, "Ishmael");
    const index = createSearchIndex([r]);
    expect(searchResources(index, "ismael").map((r) => r.id)).toEqual([UUID(1)]);
  });

  it("ranks title matches above description matches", () => {
    const titleHit = makeResource(1, "React", { description: "" });
    const descHit = makeResource(2, "Vue", { description: "mentions react" });
    const index = createSearchIndex([titleHit, descHit]);
    const hits = searchIndex(index, "react").hits;
    expect(hits[0]!.resource.id).toBe(UUID(1));
  });

  it("applies deterministic tie-breaks (updatedAt desc, title, id)", () => {
    const older = makeResource(1, "Same Title", { updatedAt: 5000 });
    const newer = makeResource(2, "Same Title", { updatedAt: 6000 });
    const index = createSearchIndex([older, newer]);
    const hits = searchIndex(index, "same").hits;
    expect(hits[0]!.resource.id).toBe(UUID(2));
  });

  it("excludes soft-deleted resources", () => {
    const live = makeResource(1, "React");
    const trashed = makeResource(2, "React Trashed", { deletedAt: 5 } as Partial<Resource>);
    const index = createSearchIndex([live, trashed]);
    const ids = searchResources(index, "react").map((r) => r.id);
    expect(ids).toEqual([UUID(1)]);
  });

  it("searches tagsText via context", () => {
    const r = makeResource(1, "Unrelated Title");
    const ctx = { tagNamesByResourceId: new Map([[UUID(1), ["react", "hooks"]]]) };
    const index = createSearchIndex([r], ctx);
    expect(searchResources(index, "react").map((r) => r.id)).toEqual([UUID(1)]);
  });

  it("searches urlText", () => {
    const r = makeResource(1, "Unrelated", {
      url: "https://github.com/foo/react-hooks",
    } as Partial<Resource>);
    // rebuild canonicalUrl/domain to match
    const fixed = {
      ...r,
      canonicalUrl: "https://github.com/foo/react-hooks",
      domain: "github.com",
    };
    const index = createSearchIndex([fixed as Resource]);
    expect(searchResources(index, "react").map((r) => r.id)).toEqual([UUID(1)]);
  });

  it("invalid/empty queries do not throw", () => {
    const r = makeResource(1, "React");
    const index = createSearchIndex([r]);
    expect(() => searchIndex(index, "")).not.toThrow();
    expect(() => searchIndex(index, "!!!")).not.toThrow();
  });

  // SEARCH-004: Incremental update on write — after a resource's searchable
  // fields are updated via Dexie commit, the in-memory MiniSearch index is
  // synchronised through applyUpsert, so a subsequent query reflects the change.
  it("resource edit becomes searchable after Dexie commit", async () => {
    const database = new FluidDeckDatabase(`fluid-deck-sr-test-${crypto.randomUUID()}`);
    await database.open();
    try {
      const id = UUID(1);
      await database.resources.add(
        makeResource(1, "React Hooks Guide", { description: "Learn React hooks" }),
      );

      // Initial index + query.
      await rebuildSearchIndex(database);
      const state = getSearchIndexState();
      expect(state.status).toBe("ready");
      expect(searchResources(state.index!, "react").map((r) => r.id)).toContain(id);

      // Update the title through a Dexie write (the commit).
      await database.resources.update(id, { title: "React Hooks Complete" });
      const stored = await database.resources.get(id);
      expect(stored?.title).toBe("React Hooks Complete");

      // Production mirrors this with syncResource after the commit: the live
      // index is updated in place through applyUpsert, without a rebuild.
      await syncResource(database, id);

      // The updated resource is findable under its new title.
      const live = getSearchIndexState();
      expect(searchResources(live.index!, "complete").map((r) => r.id)).toContain(id);
      // The document was replaced, not dropped: the old term still matches.
      expect(searchResources(live.index!, "react").map((r) => r.id)).toContain(id);
      // And the index was updated in place, not rebuilt behind our back.
      expect(live.index!.mini.documentCount).toBe(1);
    } finally {
      database.close();
      await database.delete();
    }
  });
});
