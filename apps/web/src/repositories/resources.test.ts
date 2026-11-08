import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { createCollection } from "./collections.ts";
import { createTag } from "./tags.ts";
import { RepositoryError } from "./errors.ts";
import {
  createResource,
  createResourceWithMembers,
  getResource,
  getResourceByCanonicalUrl,
  listResources,
  listTrashedResources,
  markResourceOpened,
  purgeDeletedResources,
  restoreResource,
  softDeleteResource,
  updateResource,
} from "./resources.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

const DAY = 24 * 60 * 60 * 1000;

describe("resource repository", () => {
  it("derives canonicalUrl, domain and timestamps on create", async () => {
    const { resource, duplicate } = await createResource(db, {
      url: "https://www.Example.com/Path?utm_source=x&b=2&a=1#frag",
      title: "Example",
      type: "article",
      source: "extension",
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      notes: "",
      extractionStatus: "complete",
      extractionNotes: [],
    });

    expect(duplicate).toBe(false);
    expect(resource.url).toBe("https://www.Example.com/Path?utm_source=x&b=2&a=1#frag");
    expect(resource.canonicalUrl).toBe("https://example.com/Path?a=1&b=2");
    expect(resource.domain).toBe("example.com");
    expect(resource.createdAt).toBe(resource.updatedAt);
    expect(resource.deletedAt).toBeNull();
    expect(resource.lastOpenedAt).toBeNull();
    expect(await db.resources.count()).toBe(1);
  });

  it("returns the existing resource for a duplicate canonical URL (approved policy)", async () => {
    const first = await createResource(db, { url: "https://example.com/a?utm_source=one" });
    const second = await createResource(db, { url: "https://www.example.com/a?utm_source=two" });
    expect(second.duplicate).toBe(true);
    expect(second.resource.id).toBe(first.resource.id);
    expect(await db.resources.count()).toBe(1);
  });

  it("resolves a concurrent duplicate capture to a single row", async () => {
    const results = await Promise.all([
      createResource(db, { url: "https://example.com/race?utm_source=a" }),
      createResource(db, { url: "https://www.example.com/race?utm_source=b" }),
    ]);
    expect(await db.resources.count()).toBe(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(new Set(results.map((result) => result.resource.id)).size).toBe(1);
  });

  it("rejects an invalid URL scheme with a VALIDATION error", async () => {
    await expect(createResource(db, { url: "javascript:alert(1)" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(createResource(db, { url: "/relative" })).rejects.toBeInstanceOf(RepositoryError);
    expect(await db.resources.count()).toBe(0);
  });

  it("reads by id and canonical URL, excluding soft-deleted resources", async () => {
    const { resource } = await createResource(db, { url: "https://example.com/read" });
    expect((await getResource(db, resource.id))?.id).toBe(resource.id);
    expect((await getResourceByCanonicalUrl(db, "https://www.example.com/read"))?.id).toBe(
      resource.id,
    );

    await softDeleteResource(db, resource.id);
    expect(await getResource(db, resource.id)).toBeNull();
    expect((await getResource(db, resource.id, { includeDeleted: true }))?.id).toBe(resource.id);
    await expect(getResource(db, crypto.randomUUID())).resolves.toBeNull();
  });

  it("soft deletes idempotently, keeps membership, and restores losslessly", async () => {
    const { collection } = await createCollection(db, { name: "Inbox" });
    const { tag } = await createTag(db, "react");
    const { resource } = await createResourceWithMembers(
      db,
      { url: "https://example.com/soft" },
      { collectionIds: [collection.id], tagIds: [tag.id] },
    );

    const deleted = await softDeleteResource(db, resource.id);
    expect(deleted.deletedAt).toBeTypeOf("number");
    expect(await db.resourceCollections.count()).toBe(1);
    expect(await db.resourceTags.count()).toBe(1);

    const again = await softDeleteResource(db, resource.id);
    expect(again.deletedAt).toBe(deleted.deletedAt);

    expect(await listResources(db)).toHaveLength(0);
    expect(await listTrashedResources(db)).toHaveLength(1);

    const restored = await restoreResource(db, resource.id);
    expect(restored.deletedAt).toBeNull();
    expect(await listResources(db)).toHaveLength(1);
    expect(await db.resourceTags.count()).toBe(1);
  });

  it("bumps updatedAt on edit and rejects a URL that clashes with another resource", async () => {
    const a = await createResource(db, { url: "https://example.com/a", title: "A" });
    const b = await createResource(db, { url: "https://example.com/b", title: "B" });

    const updated = await updateResource(db, a.resource.id, { title: "A2" });
    expect(updated.title).toBe("A2");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(a.resource.updatedAt);

    await expect(
      updateResource(db, b.resource.id, { url: "https://www.example.com/a" }),
    ).rejects.toMatchObject({ code: "CONSTRAINT" });

    const moved = await updateResource(db, b.resource.id, { url: "https://example.com/c" });
    expect(moved.canonicalUrl).toBe("https://example.com/c");
    expect(moved.domain).toBe("example.com");
  });

  it("tracks lastOpenedAt without touching updatedAt", async () => {
    const { resource } = await createResource(db, { url: "https://example.com/open" });
    await markResourceOpened(db, resource.id, 1234);
    const stored = await db.resources.get(resource.id);
    expect(stored?.lastOpenedAt).toBe(1234);
    expect(stored?.updatedAt).toBe(resource.updatedAt);
  });

  it("purges only resources past the retention window, and only when confirmed", async () => {
    const { collection } = await createCollection(db, { name: "Trash test" });
    const old = await createResourceWithMembers(
      db,
      { url: "https://example.com/old" },
      { collectionIds: [collection.id] },
    );
    await createResource(db, { url: "https://example.com/live" });
    await softDeleteResource(db, old.resource.id);

    const now = Date.now();
    await expect(
      // @ts-expect-error confirm is required
      purgeDeletedResources(db, { retentionDays: 30, now }),
    ).rejects.toMatchObject({ code: "CONSTRAINT" });

    const early = await purgeDeletedResources(db, { confirm: true, retentionDays: 30, now });
    expect(early.purged).toBe(0);

    const later = await purgeDeletedResources(db, {
      confirm: true,
      retentionDays: 30,
      now: now + 31 * DAY,
    });
    expect(later.purged).toBe(1);
    expect(await db.resources.count()).toBe(1);
    expect(await db.resourceCollections.count()).toBe(0);
  });

  it("creates resource + memberships + usage counts atomically, rolling back on failure", async () => {
    const { collection } = await createCollection(db, { name: "Atomic" });
    const { tag } = await createTag(db, "atomic");

    const ok = await createResourceWithMembers(
      db,
      { url: "https://example.com/atomic" },
      { collectionIds: [collection.id], tagIds: [tag.id] },
    );
    expect(await db.resourceCollections.count()).toBe(1);
    expect(await db.resourceTags.count()).toBe(1);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(1);
    expect(ok.duplicate).toBe(false);

    const before = await db.resources.count();
    await expect(
      createResourceWithMembers(
        db,
        { url: "https://example.com/rollback" },
        { collectionIds: [crypto.randomUUID()] },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });

    expect(await db.resources.count()).toBe(before);
    expect(await db.resourceCollections.count()).toBe(1);
    expect(
      await db.resources.where("canonicalUrl").equals("https://example.com/rollback").count(),
    ).toBe(0);
  });
});
