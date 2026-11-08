import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { FluidDeckDatabase, SCHEMA_V1 } from "./db.ts";

/** DB-004 — an additive v2 (new index on `resources.title`) must preserve data. */
class V2Database extends FluidDeckDatabase {
  constructor(name: string) {
    super(name);
    this.version(2).stores({
      ...SCHEMA_V1,
      resources: `${SCHEMA_V1.resources}, title`,
    });
  }
}

const databases: FluidDeckDatabase[] = [];

function track(database: FluidDeckDatabase): FluidDeckDatabase {
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await database.delete();
  }
});

const resource = {
  id: crypto.randomUUID(),
  url: "https://example.com/migrate",
  canonicalUrl: "https://example.com/migrate",
  title: "Migrate me",
  description: "",
  thumbnailUrl: "",
  faviconUrl: "",
  domain: "example.com",
  type: "article" as const,
  source: "import" as const,
  notes: "",
  extractionStatus: "complete" as const,
  extractionNotes: [],
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: null,
  deletedAt: null,
};

describe("DB-004 migrations", () => {
  it("upgrades v1 → v2 additively without losing rows", async () => {
    const name = `fluid-deck-migration-${crypto.randomUUID()}`;

    const v1 = track(new FluidDeckDatabase(name));
    await v1.open();
    expect(v1.verno).toBe(1);
    await v1.resources.add({ ...resource });
    await v1.collections.add({
      id: crypto.randomUUID(),
      name: "Kept",
      parentId: null,
      orderIndex: 1024,
      createdAt: 1,
      updatedAt: 1,
    });
    v1.close();

    const v2 = track(new V2Database(name));
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(await v2.resources.count()).toBe(1);
    expect(await v2.collections.count()).toBe(1);

    // The new index is usable…
    expect(await v2.resources.where("title").equals("Migrate me").count()).toBe(1);
    // …and writes still work after the upgrade.
    const second = { ...resource, id: crypto.randomUUID(), url: "https://example.com/2" };
    second.canonicalUrl = "https://example.com/2";
    await v2.resources.add(second);
    expect(await v2.resources.count()).toBe(2);
  });

  it("keeps the v1 stores untouched when no migration is required", async () => {
    const name = `fluid-deck-migration-${crypto.randomUUID()}`;
    const first = track(new FluidDeckDatabase(name));
    await first.open();
    await first.resources.add({ ...resource });
    first.close();

    const reopened = track(new FluidDeckDatabase(name));
    await reopened.open();
    expect(reopened.verno).toBe(1);
    expect(await reopened.resources.count()).toBe(1);
  });
});
