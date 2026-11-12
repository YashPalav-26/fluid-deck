/**
 * IMPORT-004 — batch persistence + checkpoint resume, against fake-indexeddb.
 * Transaction boundaries are observed through committed rows, not mocks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { resourceInputSchema, resourceSchema } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { createCollection, listSiblings } from "../repositories/collections.ts";
import { createResource } from "../repositories/resources.ts";
import { createTag } from "../repositories/tags.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { getSearchIndexState, rebuildSearchIndex, searchResources } from "../services/search.ts";
import {
  commitImport,
  IMPORT_BATCH_SIZE,
  ImportCommitError,
  memoryCheckpointStore,
  type ImportCheckpoint,
} from "./commit.ts";
import type { ImportConflictResolution } from "./preview.ts";
import { validateRaindropImport } from "./validate.ts";
import type {
  ImportResourceMeta,
  ValidatedImport,
  ValidatedImportCollection,
  ValidatedImportResource,
} from "./validate.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

function row(url: string, meta: Partial<ImportResourceMeta> = {}): ValidatedImportResource {
  return {
    input: resourceInputSchema.parse({ url, title: url }),
    meta: { collectionSourceIds: [], tags: [], ...meta },
  };
}

function titled(
  url: string,
  title: string,
  meta: Partial<ImportResourceMeta> = {},
  input: Record<string, unknown> = {},
): ValidatedImportResource {
  return {
    input: resourceInputSchema.parse({ url, title, ...input }),
    meta: { collectionSourceIds: [], tags: [], ...meta },
  };
}

function makeImport(
  resources: ValidatedImportResource[],
  options: {
    format?: ValidatedImport["format"];
    collections?: ValidatedImportCollection[];
    tags?: ValidatedImport["tags"];
  } = {},
): ValidatedImport {
  return {
    format: options.format ?? "raindrop",
    resources,
    collections: options.collections ?? [],
    tags: options.tags ?? [],
    warnings: [],
  };
}

const rows = (count: number, prefix = "https://example.com/r") =>
  Array.from({ length: count }, (_, index) => row(`${prefix}${index}`));

describe("IMPORT-004: batch persistence", () => {
  it("persists resources with memberships, tags and source timestamps", async () => {
    const imported = makeImport(
      [
        row("https://a.example/one", {
          createdAt: 1_600_000_000_000,
          collectionSourceIds: ["1"],
          tags: ["Reading", "ai"],
        }),
        row("https://a.example/two", { collectionSourceIds: ["2"], tags: ["reading"] }),
      ],
      {
        collections: [
          { name: "Reading", sourceId: "1", parentSourceId: null, orderIndex: 0 },
          { name: "Deep", sourceId: "2", parentSourceId: "1", orderIndex: 1 },
        ],
        tags: [
          { name: "Reading", normalizedName: "reading", usageCount: 2 },
          { name: "ai", normalizedName: "ai", usageCount: 1 },
        ],
      },
    );

    const result = await commitImport(db, imported);

    expect(result).toMatchObject({
      resumedFrom: 0,
      created: 2,
      duplicates: 0,
      batches: 1,
      collectionsCreated: 2,
      collectionsReused: 0,
      warnings: [],
    });

    expect(await db.resources.count()).toBe(2);
    expect(await db.resourceCollections.count()).toBe(2);
    expect(await db.resourceTags.count()).toBe(3);

    const stored = await db.resources.where("canonicalUrl").equals("https://a.example/one").first();
    expect(stored?.createdAt).toBe(1_600_000_000_000);

    const reading = await db.tags.where("normalizedName").equals("reading").first();
    expect(reading?.usageCount).toBe(2);
  });

  it("keeps import-only metadata out of the persisted resource row", async () => {
    const imported = makeImport([
      row("https://meta.example/", { collectionSourceIds: [], tags: ["imported-tag"] }),
    ]);
    await commitImport(db, imported);

    const stored = await db.resources.toCollection().first();
    expect(stored).toBeDefined();
    expect(resourceSchema.safeParse(stored).success).toBe(true);
    expect(stored).not.toHaveProperty("meta");
    expect(stored).not.toHaveProperty("collectionSourceIds");
    expect(stored).not.toHaveProperty("tags");
  });

  it("uses one batch for 500 rows and two batches for 501", async () => {
    const exact = await commitImport(
      db,
      makeImport(rows(IMPORT_BATCH_SIZE, "https://exact.example/")),
    );
    expect(exact.batches).toBe(1);
    expect(exact.created).toBe(500);

    const progress: number[] = [];
    const oneMore = await commitImport(db, makeImport(rows(501, "https://over.example/")), {
      onProgress: (update) => progress.push(update.batch),
    });
    expect(oneMore.batches).toBe(2);
    expect(oneMore.created).toBe(501);
    expect(progress).toEqual([1, 2]);
    expect(await db.resources.count()).toBe(1001);
  });

  it("reconstructs nested collections and preserves sibling order", async () => {
    await commitImport(
      db,
      makeImport([], {
        collections: [
          { name: "Second", sourceId: "b", parentSourceId: null, orderIndex: 2 },
          { name: "Child", sourceId: "c", parentSourceId: "a", orderIndex: 0 },
          { name: "First", sourceId: "a", parentSourceId: null, orderIndex: 1 },
        ],
      }),
    );

    const roots = await listSiblings(db, null);
    expect(roots.map((collection) => collection.name)).toEqual(["First", "Second"]);
    const child = await db.collections.where("name").equals("Child").first();
    expect(child?.parentId).toBe(roots[0]?.id);
  });

  it("reuses an existing collection with the same normalized name", async () => {
    const existing = await createCollection(db, { name: "Reading  List" });

    const result = await commitImport(
      db,
      makeImport([], {
        collections: [
          { name: " reading list ", sourceId: "1", parentSourceId: null, orderIndex: 0 },
          { name: "New", sourceId: "2", parentSourceId: "1", orderIndex: 1 },
        ],
      }),
    );

    expect(result.collectionsReused).toBe(1);
    expect(result.collectionsCreated).toBe(1);
    expect(await db.collections.count()).toBe(2);
    const child = await db.collections.where("name").equals("New").first();
    expect(child?.parentId).toBe(existing.collection.id);
  });

  it("reports a dangling parent and a parent cycle instead of failing", async () => {
    const result = await commitImport(
      db,
      makeImport([], {
        collections: [
          { name: "Orphan", sourceId: "o", parentSourceId: "missing", orderIndex: 0 },
          { name: "Loop A", sourceId: "x", parentSourceId: "y", orderIndex: 1 },
          { name: "Loop B", sourceId: "y", parentSourceId: "x", orderIndex: 2 },
        ],
      }),
    );

    expect(result.collectionsCreated).toBe(3);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("not imported");
    expect(result.warnings.join(" ")).toContain("cycle");
    expect(await db.collections.count()).toBe(3);
    expect((await listSiblings(db, null)).map((collection) => collection.name).sort()).toEqual([
      "Loop A",
      "Loop B",
      "Orphan",
    ]);
  });

  it("skips existing canonical URLs without touching the existing resource", async () => {
    const existing = await createResource(db, {
      url: "https://keep.example/",
      title: "Original",
    });

    const result = await commitImport(
      db,
      makeImport([row("https://keep.example/?utm_source=import", { tags: ["new-tag"] })]),
    );

    expect(result.duplicates).toBe(1);
    expect(result.created).toBe(0);
    const stored = await db.resources.where("canonicalUrl").equals("https://keep.example/").first();
    expect(stored?.id).toBe(existing.resource.id);
    expect(stored?.title).toBe("Original");
    expect(await db.resourceTags.count()).toBe(0);
  });

  it("applies a past source timestamp and ignores a future one", async () => {
    await commitImport(
      db,
      makeImport([
        row("https://time.example/past", { createdAt: 1_500_000_000_000 }),
        row("https://time.example/future", { createdAt: Date.now() + 86_400_000 }),
        row("https://time.example/none"),
      ]),
    );

    const past = await db.resources
      .where("canonicalUrl")
      .equals("https://time.example/past")
      .first();
    const future = await db.resources
      .where("canonicalUrl")
      .equals("https://time.example/future")
      .first();
    expect(past?.createdAt).toBe(1_500_000_000_000);
    expect(future?.createdAt).not.toBe(Date.now() + 86_400_000);
    expect(future?.createdAt).toBeLessThan(Date.now() + 86_400_000);
  });
});

describe("IMPORT-004: checkpoints and idempotency", () => {
  it("is idempotent when the same import is committed twice", async () => {
    const imported = makeImport([
      row("https://twice.example/a", { tags: ["shared"] }),
      row("https://twice.example/b", { tags: ["shared"] }),
    ]);
    const store = memoryCheckpointStore();

    const first = await commitImport(db, imported, { checkpointStore: store });
    const second = await commitImport(db, imported, { checkpointStore: store });

    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(await db.resources.count()).toBe(2);
    expect(await db.resourceTags.count()).toBe(2);
    const tag = await db.tags.where("normalizedName").equals("shared").first();
    expect(tag?.usageCount).toBe(2);
  });

  it("resumes after an interruption that happened after a committed batch", async () => {
    const imported = makeImport(rows(1000, "https://resume.example/"));
    const store = memoryCheckpointStore();

    await expect(
      commitImport(db, imported, {
        checkpointStore: store,
        onProgress: (update) => {
          if (update.batch === 1) throw new Error("simulated tab kill");
        },
      }),
    ).rejects.toThrow("simulated tab kill");

    expect(await db.resources.count()).toBe(500);
    expect((store.load() as ImportCheckpoint).nextIndex).toBe(500);

    const resumed = await commitImport(db, imported, { checkpointStore: store });
    expect(resumed.resumedFrom).toBe(500);
    expect(resumed.created).toBe(1000);
    expect(await db.resources.count()).toBe(1000);
    expect((store.load() as ImportCheckpoint).completed).toBe(true);
  });

  it("rolls back the failing batch, keeps earlier batches and can retry", async () => {
    const imported = rows(1000, "https://rollback.example/");
    const broken = [
      ...imported.slice(0, 500),
      {
        input: { url: "https://rollback.example/500", title: 123 },
        meta: { collectionSourceIds: [], tags: [] },
      } as unknown as ValidatedImportResource,
      ...imported.slice(501),
    ];
    const store = memoryCheckpointStore();

    const failure = await commitImport(db, makeImport(broken), { checkpointStore: store }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ImportCommitError);
    expect(failure).toMatchObject({ code: "batch_failed", committed: 500 });
    expect(await db.resources.count()).toBe(500);
    expect((store.load() as ImportCheckpoint).nextIndex).toBe(500);

    const retried = await commitImport(db, makeImport(imported), { checkpointStore: store });
    expect(retried.resumedFrom).toBe(500);
    expect(await db.resources.count()).toBe(1000);
  });

  it("ignores an invalid, foreign or completed checkpoint", async () => {
    const store = memoryCheckpointStore();

    const garbage = { load: () => ({ nextIndex: "later" }), save: () => {}, clear: () => {} };
    const first = await commitImport(db, makeImport(rows(3, "https://cp.example/")), {
      checkpointStore: garbage,
    });
    expect(first.resumedFrom).toBe(0);
    expect(first.created).toBe(3);

    store.save({
      fingerprint: "other:1:0000",
      format: "raindrop",
      totalResources: 1,
      nextIndex: 1,
      created: 1,
      duplicates: 0,
      completed: false,
      updatedAt: 1,
    });
    const foreign = await commitImport(db, makeImport(rows(3, "https://cp2.example/")), {
      checkpointStore: store,
    });
    expect(foreign.resumedFrom).toBe(0);

    const completed = {
      load: () => ({
        fingerprint: foreign.fingerprint,
        format: "raindrop",
        totalResources: 3,
        nextIndex: 3,
        created: 3,
        duplicates: 0,
        completed: true,
        updatedAt: 1,
      }),
      save: () => {},
      clear: () => {},
    };
    const again = await commitImport(db, makeImport(rows(3, "https://cp2.example/")), {
      checkpointStore: completed,
    });
    expect(again.resumedFrom).toBe(0);
    expect(again.duplicates).toBe(3);
  });

  it("rejects unvalidated input before writing anything", async () => {
    const failure = await commitImport(db, { format: "html" } as unknown as ValidatedImport).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ImportCommitError);
    expect((failure as ImportCommitError).code).toBe("invalid_import");
    expect(await db.resources.count()).toBe(0);
  });

  it("rejects a concurrent commit in the same context", async () => {
    const first = commitImport(db, makeImport(rows(600, "https://concurrent.example/")));
    const second = await commitImport(db, makeImport(rows(1, "https://other.example/"))).catch(
      (error: unknown) => error,
    );

    expect((second as ImportCommitError).code).toBe("concurrent_import");
    const result = await first;
    expect(result.created).toBe(600);
  });
});

describe("IMPORT-005: conflict resolution", () => {
  it("updates metadata on request and never wipes existing values with empty imports", async () => {
    const existing = await createResource(db, {
      url: "https://update.example/",
      title: "Original",
      description: "Original description",
      thumbnailUrl: "https://img.example/original.png",
    });
    const imported = makeImport([
      titled(
        "https://update.example/",
        "Imported title",
        {},
        { description: "Imported description", type: "article", notes: "imported note" },
      ),
    ]);

    const result = await commitImport(db, imported, {
      resolutions: new Map([["https://update.example/", "update"]]),
    });

    expect(result).toMatchObject({
      created: 0,
      duplicates: 1,
      updated: 1,
      addedToCollections: 0,
    });
    const stored = await db.resources.get(existing.resource.id);
    expect(stored).toMatchObject({
      title: "Imported title",
      description: "Imported description",
      type: "article",
      notes: "imported note",
      thumbnailUrl: "https://img.example/original.png",
    });
    expect(await db.resources.count()).toBe(1);
  });

  it("keeps the existing row untouched when the resolution is skip", async () => {
    const existing = await createResource(db, {
      url: "https://skip.example/",
      title: "Original",
    });
    const imported = makeImport([titled("https://skip.example/", "Imported", { tags: ["x"] })]);

    const result = await commitImport(db, imported, {
      resolutions: new Map([["https://skip.example/", "skip"]]),
    });

    expect(result).toMatchObject({
      created: 0,
      duplicates: 1,
      updated: 0,
      addedToCollections: 0,
    });
    const stored = await db.resources.get(existing.resource.id);
    expect(stored?.title).toBe("Original");
    expect(stored?.updatedAt).toBe(existing.resource.updatedAt);
    expect(await db.resourceTags.count()).toBe(0);
  });

  it("adds only the collection memberships on request", async () => {
    const existing = await createResource(db, {
      url: "https://membership.example/",
      title: "Original",
    });
    const imported = makeImport(
      [
        titled("https://membership.example/", "Imported", {
          collectionSourceIds: ["c1"],
          tags: ["nope"],
        }),
      ],
      { collections: [{ name: "Reading", sourceId: "c1", parentSourceId: null, orderIndex: 0 }] },
    );

    const result = await commitImport(db, imported, {
      resolutions: new Map([["https://membership.example/", "add-to-collections"]]),
    });

    expect(result).toMatchObject({
      created: 0,
      duplicates: 1,
      updated: 0,
      addedToCollections: 1,
    });
    const stored = await db.resources.get(existing.resource.id);
    expect(stored?.title).toBe("Original");
    const collection = await db.collections.where("name").equals("Reading").first();
    const joins = await db.resourceCollections
      .where("resourceId")
      .equals(existing.resource.id)
      .toArray();
    expect(joins.map((join) => join.collectionId)).toEqual([collection?.id]);
    expect(await db.resourceTags.count()).toBe(0);
  });

  it("applies a mixed resolution map in one import", async () => {
    const updating = await createResource(db, {
      url: "https://mixed.example/update",
      title: "Old",
    });
    const skipping = await createResource(db, {
      url: "https://mixed.example/skip",
      title: "Keep",
    });
    const adding = await createResource(db, {
      url: "https://mixed.example/add",
      title: "Keep",
    });
    const imported = makeImport(
      [
        titled("https://mixed.example/new", "New"),
        titled("https://mixed.example/update", "Refreshed"),
        titled("https://mixed.example/skip", "Ignored"),
        titled("https://mixed.example/add", "Ignored", { collectionSourceIds: ["c"] }),
      ],
      { collections: [{ name: "Mixed", sourceId: "c", parentSourceId: null, orderIndex: 0 }] },
    );

    const result = await commitImport(db, imported, {
      resolutions: new Map([
        ["https://mixed.example/update", "update"],
        ["https://mixed.example/add", "add-to-collections"],
      ]),
      defaultResolution: "skip",
    });

    expect(result).toMatchObject({
      created: 1,
      duplicates: 3,
      updated: 1,
      addedToCollections: 1,
    });
    expect(await db.resources.count()).toBe(4);
    expect((await db.resources.get(updating.resource.id))?.title).toBe("Refreshed");
    expect((await db.resources.get(skipping.resource.id))?.title).toBe("Keep");
    expect((await db.resources.get(adding.resource.id))?.title).toBe("Keep");
    expect(await db.resourceCollections.count()).toBe(1);
  });

  it("revalidates conflicts inside the commit transaction when the preview is stale", async () => {
    const imported = makeImport([
      titled("https://stale.example/appeared", "Imported"),
      titled("https://stale.example/disappeared", "Imported"),
    ]);
    // The preview saw this one as a conflict; it is gone by commit time.
    const disappeared = await createResource(db, {
      url: "https://stale.example/disappeared",
      title: "Previewed",
    });
    await db.resources.delete(disappeared.resource.id);
    // The preview saw this one as new; a row exists by commit time.
    await createResource(db, {
      url: "https://stale.example/appeared",
      title: "Appeared later",
    });

    const result = await commitImport(db, imported, { defaultResolution: "update" });

    expect(result).toMatchObject({ created: 1, duplicates: 1, updated: 1 });
    const appeared = await db.resources
      .where("canonicalUrl")
      .equals("https://stale.example/appeared")
      .toArray();
    expect(appeared).toHaveLength(1);
    expect(appeared[0]?.title).toBe("Imported");
  });

  it("is idempotent for update and add-to-collections on a repeated commit", async () => {
    await createResource(db, { url: "https://repeat.example/update", title: "Old" });
    await createResource(db, { url: "https://repeat.example/add", title: "Old" });
    const imported = makeImport(
      [
        titled("https://repeat.example/update", "New"),
        titled("https://repeat.example/add", "New", { collectionSourceIds: ["c"] }),
      ],
      { collections: [{ name: "Repeat", sourceId: "c", parentSourceId: null, orderIndex: 0 }] },
    );
    const resolutions = new Map<string, ImportConflictResolution>([
      ["https://repeat.example/update", "update"],
      ["https://repeat.example/add", "add-to-collections"],
    ]);
    const store = memoryCheckpointStore();

    const first = await commitImport(db, imported, { checkpointStore: store, resolutions });
    const second = await commitImport(db, imported, { checkpointStore: store, resolutions });

    expect(first).toMatchObject({ created: 0, duplicates: 2, updated: 1, addedToCollections: 1 });
    expect(second).toMatchObject({ created: 0, duplicates: 2, updated: 1, addedToCollections: 1 });
    expect(await db.resources.count()).toBe(2);
    expect(await db.resourceCollections.count()).toBe(1);
  });
});

describe("IMPORT-004: IMPORT-003 boundary", () => {
  it("commits the real validated Raindrop fixture", async () => {
    const json = fs.readFileSync(path.resolve("e2e/fixtures/import/raindrop/small.json"), "utf8");
    const validated = validateRaindropImport(json);

    const result = await commitImport(db, validated);

    expect(result.created).toBe(validated.resources.length);
    expect(await db.resources.count()).toBe(validated.resources.length);
    expect(await db.collections.count()).toBe(validated.collections.length);
    expect(await db.resourceCollections.count()).toBeGreaterThan(0);

    const tag = await createTag(db, "reading");
    expect(tag.created).toBe(false);
  });
});

describe("IMPORT-004: import-to-search synchronization", () => {
  it("makes an imported resource searchable without a rebuild", async () => {
    await rebuildSearchIndex(db);

    await commitImport(
      db,
      makeImport([titled("https://search.example/one", "Zeppelin Release Notes")]),
    );

    const row = await db.resources
      .where("canonicalUrl")
      .equals("https://search.example/one")
      .first();
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(searchResources(state.index!, "zeppelin").map((r) => r.id)).toContain(row?.id);
  });

  it("never indexes a rolled-back batch", async () => {
    await rebuildSearchIndex(db);

    const committed = rows(500, "https://rollback-search.example/");
    const broken = [
      ...committed,
      {
        input: { url: "https://rollback-search.example/500", title: 123 },
        meta: { collectionSourceIds: [], tags: [] },
      } as unknown as ValidatedImportResource,
    ];

    await expect(commitImport(db, makeImport(broken))).rejects.toBeInstanceOf(ImportCommitError);
    expect(await db.resources.count()).toBe(500);

    const state = getSearchIndexState();
    const indexed = searchResources(state.index!, "rollback-search");
    // The committed batch is indexed...
    expect(indexed).toHaveLength(500);
    // ...and the row whose batch rolled back is not.
    expect(indexed.some((r) => r.url.endsWith("/500"))).toBe(false);
  });

  it("re-indexes an updated resource under its new title", async () => {
    await commitImport(db, makeImport([titled("https://update.example/one", "Original Heading")]));
    await rebuildSearchIndex(db);

    const resolutions = new Map<string, ImportConflictResolution>([
      ["https://update.example/one", "update"],
    ]);
    await commitImport(db, makeImport([titled("https://update.example/one", "Renamed Heading")]), {
      resolutions,
    });

    const row = await db.resources
      .where("canonicalUrl")
      .equals("https://update.example/one")
      .first();
    const state = getSearchIndexState();
    expect(searchResources(state.index!, "renamed").map((r) => r.id)).toContain(row?.id);
    expect(searchResources(state.index!, "original").map((r) => r.id)).not.toContain(row?.id);
  });

  it("syncs every committed batch of a multi-batch import", async () => {
    await rebuildSearchIndex(db);

    await commitImport(db, makeImport(rows(600, "https://multi.example/")));

    const last = await db.resources
      .where("canonicalUrl")
      .equals("https://multi.example/599")
      .first();
    const state = getSearchIndexState();
    // Both batches are in the index; the search result cap applies to hits,
    // not to the indexed document count.
    expect(state.index!.mini.documentCount).toBe(600);
    expect(searchResources(state.index!, "599").map((r) => r.id)).toContain(last?.id);
  });
});
