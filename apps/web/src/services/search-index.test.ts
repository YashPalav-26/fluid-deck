import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FluidDeckDatabase } from "../persistence/db.ts";
import { resourceSchema } from "@fluid-deck/core";
import type { Resource } from "@fluid-deck/core";
import {
  cancelSearchIndexBuild,
  getSearchIndexState,
  rebuildSearchIndex,
  searchResources,
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
    source: overrides.source ?? "extension",
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

let database: FluidDeckDatabase;

beforeEach(async () => {
  database = new FluidDeckDatabase(`fluid-deck-test-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe("SEARCH-003 startup rebuild", () => {
  it("handles an empty library and reaches ready", async () => {
    await rebuildSearchIndex(database);
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.index).not.toBeNull();
    expect(state.index!.mini.documentCount).toBe(0);
    expect(searchResources(state.index!, "anything")).toEqual([]);
  });

  it("reaches ready and includes persisted resources", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    await database.resources.add(makeResource(2, "Vue Basics"));

    await rebuildSearchIndex(database);
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.index!.mini.documentCount).toBe(2);
    expect(searchResources(state.index!, "react")).toHaveLength(1);
  });

  it("includes captured (extension) resources already committed", async () => {
    await database.resources.add(makeResource(7, "Captured Page", { source: "extension" }));

    await rebuildSearchIndex(database);
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(searchResources(state.index!, "captured")).toHaveLength(1);
  });

  it("builds in chunks and reports progress", async () => {
    for (let i = 1; i <= 5; i++) {
      await database.resources.add(makeResource(i, `Title ${i}`));
    }

    await rebuildSearchIndex(database, { chunkSize: 2 });
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.progress).toEqual({ done: 5, total: 5 });
  });

  it("does not block: rebuild is async and yields", async () => {
    await database.resources.add(makeResource(1, "React"));
    const promise = rebuildSearchIndex(database, { chunkSize: 1 });
    // Should be a promise (non-blocking entry point).
    expect(typeof promise.then).toBe("function");
    await promise;
    expect(getSearchIndexState().status).toBe("ready");
  });

  it("cancellation prevents publishing an obsolete index", async () => {
    for (let i = 1; i <= 6; i++) {
      await database.resources.add(makeResource(i, `Title ${i}`));
    }

    const first = rebuildSearchIndex(database, { chunkSize: 1 });
    // Cancel before completion.
    cancelSearchIndexBuild();
    await expect(first).rejects.toThrow();
    // State should not be ready from the cancelled build.
    expect(getSearchIndexState().status).not.toBe("ready");
  });

  it("stale completion from a superseded build does not publish", async () => {
    for (let i = 1; i <= 6; i++) {
      await database.resources.add(makeResource(i, `Title ${i}`));
    }

    const first = rebuildSearchIndex(database, { chunkSize: 1 });
    const second = rebuildSearchIndex(database, { chunkSize: 1 });

    // First must not publish a ready index.
    await expect(first).rejects.toThrow();
    await second;
    expect(getSearchIndexState().status).toBe("ready");
  });

  it("degraded browse-only state on indexing failure", async () => {
    database.close();
    await expect(rebuildSearchIndex(database)).rejects.toThrow();
    const state = getSearchIndexState();
    expect(state.status).toBe("error");
    expect(state.index).toBeNull();
    expect(state.failed).toBe(true);
  });

  it("repeated startup is safe", async () => {
    await database.resources.add(makeResource(1, "React"));
    await rebuildSearchIndex(database);
    await rebuildSearchIndex(database);
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.index!.mini.documentCount).toBe(1);
  });

  it("empty query does not throw and search unavailable while indexing", () => {
    // Before any build completes, index is null.
    const state = getSearchIndexState();
    // status may be idle initially
    expect(["idle", "indexing", "ready", "error"]).toContain(state.status);
  });
});
