import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@fluid-deck/core";
import {
  DatabaseInitializationError,
  FluidDeckDatabase,
  getDbLifecycle,
  resetDatabase,
  SCHEMA_V1,
  STORE_NAMES,
  subscribeDbLifecycle,
} from "./db.ts";

let database: FluidDeckDatabase;

beforeEach(async () => {
  database = new FluidDeckDatabase(`fluid-deck-test-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

const resource = {
  id: crypto.randomUUID(),
  url: "https://example.com/a",
  canonicalUrl: "https://example.com/a",
  title: "A",
  description: "",
  thumbnailUrl: "",
  faviconUrl: "",
  domain: "example.com",
  type: "article" as const,
  source: "extension" as const,
  notes: "",
  extractionStatus: "complete" as const,
  extractionNotes: [],
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: null,
  deletedAt: null,
};

describe("DB-001 database schema", () => {
  it("opens at version 1 with all seven approved stores", async () => {
    expect(database.verno).toBe(SCHEMA_VERSION);
    expect(database.isOpen()).toBe(true);
    expect([...STORE_NAMES].sort()).toEqual([
      "collections",
      "preferences",
      "resourceCollections",
      "resourceTags",
      "resources",
      "savedSearches",
      "tags",
    ]);
    expect(database.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
  });

  it("matches the approved v1 schema snapshot", () => {
    // Dexie's unique marker is `&` and compound indexes need brackets; the design
    // doc's `!` / `type+createdAt` are not valid Dexie syntax (see implementation report).
    expect(SCHEMA_V1).toEqual({
      resources:
        "id, &canonicalUrl, type, source, domain, [deletedAt+createdAt], createdAt, updatedAt, lastOpenedAt, [type+createdAt], [source+createdAt]",
      collections: "id, parentId, [parentId+orderIndex], name",
      tags: "id, &normalizedName, [usageCount+name]",
      resourceCollections: "[resourceId+collectionId], resourceId, collectionId",
      resourceTags: "[resourceId+tagId], resourceId, tagId",
      savedSearches: "id, name",
      preferences: "key",
    });
  });

  it("declares the approved indexes and only the approved uniques", () => {
    const indexesOf = (name: keyof typeof SCHEMA_V1) =>
      database
        .table(name)
        .schema.indexes.map((index) => index.name)
        .sort();
    const uniquesOf = (name: keyof typeof SCHEMA_V1) =>
      database
        .table(name)
        .schema.indexes.filter((index) => index.unique)
        .map((index) => index.name)
        .sort();

    expect(indexesOf("resources")).toEqual(
      [
        "canonicalUrl",
        "type",
        "source",
        "domain",
        "[deletedAt+createdAt]",
        "createdAt",
        "updatedAt",
        "lastOpenedAt",
        "[type+createdAt]",
        "[source+createdAt]",
      ].sort(),
    );
    expect(indexesOf("collections")).toEqual(["parentId", "[parentId+orderIndex]", "name"].sort());
    expect(indexesOf("tags")).toEqual(["[usageCount+name]", "normalizedName"].sort());
    expect(indexesOf("resourceCollections")).toEqual(["resourceId", "collectionId"].sort());
    expect(indexesOf("resourceTags")).toEqual(["resourceId", "tagId"].sort());

    expect(uniquesOf("resources")).toEqual(["canonicalUrl"]);
    expect(uniquesOf("tags")).toEqual(["normalizedName"]);
    expect(uniquesOf("collections")).toEqual([]);
  });

  it("reports a named error when the database cannot open", async () => {
    const { openDatabase } = await import("./db.ts");
    const failing = new FluidDeckDatabase(`fluid-deck-test-${crypto.randomUUID()}`);
    Object.defineProperty(failing, "open", { value: () => Promise.reject(new Error("quota")) });
    await expect(openDatabase(failing)).rejects.toBeInstanceOf(DatabaseInitializationError);
  });
});

describe("DB-003 uniqueness", () => {
  it("rejects a duplicate canonicalUrl at the database level", async () => {
    await database.resources.add({ ...resource });
    await expect(database.resources.add({ ...resource, id: crypto.randomUUID() })).rejects.toThrow(
      /constraint/i,
    );
    expect(await database.resources.count()).toBe(1);
  });

  it("rejects a duplicate normalized tag name", async () => {
    const tag = {
      id: crypto.randomUUID(),
      name: "React",
      normalizedName: "react",
      usageCount: 0,
      createdAt: 1,
    };
    await database.tags.add(tag);
    await expect(
      database.tags.add({ ...tag, id: crypto.randomUUID(), name: "REACT" }),
    ).rejects.toThrow(/constraint/i);
  });

  it("rejects duplicate membership rows via the compound primary key", async () => {
    const join = { resourceId: resource.id, collectionId: crypto.randomUUID(), addedAt: 1 };
    await database.resourceCollections.add(join);
    await expect(database.resourceCollections.add({ ...join, addedAt: 2 })).rejects.toThrow(
      /constraint/i,
    );

    const tagJoin = { resourceId: resource.id, tagId: crypto.randomUUID() };
    await database.resourceTags.add(tagJoin);
    await expect(database.resourceTags.add(tagJoin)).rejects.toThrow(/constraint/i);
  });
});

describe("DB-005 guarded full delete", () => {
  it("refuses to delete without the exact confirmation string", async () => {
    await database.resources.add({ ...resource });
    await expect(resetDatabase(database, { confirmation: "yes" })).rejects.toBeInstanceOf(
      DatabaseInitializationError,
    );
    expect(await database.resources.count()).toBe(1);
  });

  it("deletes everything and recreates the v1 schema when confirmed", async () => {
    await database.resources.add({ ...resource });
    await resetDatabase(database, { confirmation: "delete-all-data" });
    expect(database.verno).toBe(1);
    expect(await database.resources.count()).toBe(0);
    expect(database.tables.length).toBe(7);
  });
});

/** Dexie exposes event subscribers as `db.on.<event>.fire(...)` at runtime. */
function fireDexieEvent(eventName: "blocked" | "versionchange", payload: unknown): void {
  const event = (database.on as unknown as Record<string, { fire: (value: unknown) => void }>)[
    eventName
  ];
  event?.fire(payload);
}

describe("DB-006 multi-tab upgrade lifecycle", () => {
  it("closes the connection on versionchange so another tab can upgrade", () => {
    const states: string[] = [];
    const unsubscribe = subscribeDbLifecycle((state) => states.push(state.status));

    fireDexieEvent("versionchange", { oldVersion: 1, newVersion: 2 });

    expect(states).toContain("versionchange");
    expect(database.isOpen()).toBe(false);
    unsubscribe();
  });

  it("surfaces a blocked upgrade with a message instead of hanging silently", () => {
    const states: string[] = [];
    const unsubscribe = subscribeDbLifecycle((state) => states.push(state.status));
    fireDexieEvent("blocked", { oldVersion: 2, newVersion: 1 });
    expect(states).toContain("blocked");
    expect(getDbLifecycle().message).toMatch(/another Fluid Deck tab/i);
    unsubscribe();
  });
});
