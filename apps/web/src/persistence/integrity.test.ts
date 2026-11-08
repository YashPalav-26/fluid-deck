import { beforeEach, describe, expect, it } from "vitest";
import type { Resource } from "@fluid-deck/core";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createCollection } from "../repositories/collections.ts";
import { createResource, listResources } from "../repositories/resources.ts";
import { addTagToResource } from "../repositories/relationships.ts";
import { createTag } from "../repositories/tags.ts";
import { checkIntegrity } from "./integrity.ts";
import { listQuarantined } from "./quarantine.ts";
import type { FluidDeckDatabase } from "./db.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

describe("DB-004 boot integrity check (FR-STO-008)", () => {
  it("reports a healthy database with per-store counts", async () => {
    const { collection } = await createCollection(db, { name: "Inbox" });
    const { tag } = await createTag(db, "react");
    const { resource } = await createResource(db, { url: "https://example.com/ok" });
    await addTagToResource(db, resource.id, tag.id);

    const report = await checkIntegrity(db);
    expect(report.ok).toBe(true);
    expect(report.invalid).toEqual([]);
    expect(report.orphanJoins).toEqual([]);
    expect(report.usageMismatches).toEqual([]);
    expect(report.counts).toEqual({
      resources: 1,
      collections: 1,
      tags: 1,
      resourceCollections: 0,
      resourceTags: 1,
      savedSearches: 0,
      preferences: 0,
    });
    expect(report.checkedAt).toBeGreaterThan(0);
    expect(collection.id).toBeTypeOf("string");
  });

  it("quarantines a corrupt row without deleting or rewriting it", async () => {
    const { resource } = await createResource(db, { url: "https://example.com/valid" });
    const corruptId = crypto.randomUUID();
    await db.resources.add({ id: corruptId, url: "not-a-url" } as unknown as Resource);

    const report = await checkIntegrity(db);

    expect(report.ok).toBe(false);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0]?.id).toBe(corruptId);
    // Never auto-deleted:
    expect(await db.resources.count()).toBe(2);
    expect(await db.resources.get(corruptId)).toBeDefined();
    // Excluded from reads and recorded as quarantined:
    expect((await listResources(db)).map((row) => row.id)).toEqual([resource.id]);
    expect(listQuarantined().map((row) => row.id)).toContain(corruptId);

    // Repeated checks do not duplicate quarantine entries.
    await checkIntegrity(db);
    expect(listQuarantined().filter((row) => row.id === corruptId)).toHaveLength(1);
  });

  it("reports join rows that point at missing parents", async () => {
    const missingResource = crypto.randomUUID();
    const missingCollection = crypto.randomUUID();
    await db.resourceCollections.add({
      resourceId: missingResource,
      collectionId: missingCollection,
      addedAt: 1,
    });

    const report = await checkIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.orphanJoins).toHaveLength(2);
    expect(report.orphanJoins.map((issue) => issue.message).sort()).toEqual([
      "Collection does not exist",
      "Resource does not exist",
    ]);
    // Orphan rows are reported, not removed.
    expect(await db.resourceCollections.count()).toBe(1);
  });

  it("reports drifted tag usage counts", async () => {
    const { tag } = await createTag(db, "drift");
    await db.tags.update(tag.id, { usageCount: 7 });

    const report = await checkIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.usageMismatches).toEqual([{ tagId: tag.id, stored: 7, actual: 0 }]);
  });
});
