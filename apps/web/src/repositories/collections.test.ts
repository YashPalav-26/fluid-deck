import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import {
  createCollection,
  deleteCollection,
  getCollectionDepth,
  listCollections,
  listSiblings,
  renameCollection,
  reorderCollection,
  reparentCollection,
} from "./collections.ts";
import { addResourceToCollection } from "./relationships.ts";
import { createResource } from "./resources.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

describe("collection repository", () => {
  it("creates top-level collections with fractional spacing", async () => {
    const first = await createCollection(db, { name: "Reading" });
    const second = await createCollection(db, { name: "Tools" });

    expect(first.collection.parentId).toBeNull();
    expect(first.collection.orderIndex).toBe(1024);
    expect(second.collection.orderIndex).toBe(2048);
    expect(first.depth).toBe(1);
    expect(first.depthWarning).toBe(false);
    expect((await listSiblings(db, null)).map((c) => c.name)).toEqual(["Reading", "Tools"]);
  });

  it("rejects an unknown parent and a duplicate sibling name", async () => {
    await expect(
      createCollection(db, { name: "Child", parentId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });

    await createCollection(db, { name: "Reading" });
    await expect(createCollection(db, { name: "  reading " })).rejects.toMatchObject({
      code: "CONSTRAINT",
    });

    const parent = await createCollection(db, { name: "Parent" });
    await expect(
      createCollection(db, { name: "Reading", parentId: parent.collection.id }),
    ).resolves.toBeDefined();
  });

  it("renames a collection and keeps sibling names unique", async () => {
    const a = await createCollection(db, { name: "A" });
    await createCollection(db, { name: "B" });

    const renamed = await renameCollection(db, a.collection.id, "C");
    expect(renamed.name).toBe("C");
    await expect(renameCollection(db, a.collection.id, "B")).rejects.toMatchObject({
      code: "CONSTRAINT",
    });
  });

  it("prevents self-parenting and cycles", async () => {
    const root = await createCollection(db, { name: "Root" });
    const child = await createCollection(db, {
      name: "Child",
      parentId: root.collection.id,
    });
    const grandchild = await createCollection(db, {
      name: "Grandchild",
      parentId: child.collection.id,
    });

    await expect(
      reparentCollection(db, root.collection.id, root.collection.id),
    ).rejects.toMatchObject({ code: "CYCLE" });
    await expect(
      reparentCollection(db, root.collection.id, grandchild.collection.id),
    ).rejects.toMatchObject({ code: "CYCLE" });

    const moved = await reparentCollection(db, grandchild.collection.id, root.collection.id);
    expect(moved.collection.parentId).toBe(root.collection.id);
    expect(moved.depth).toBe(2);
  });

  it("warns at four levels but still allows five", async () => {
    let parentId: string | null = null;
    const depths: number[] = [];
    for (let level = 1; level <= 5; level += 1) {
      const created = await createCollection(db, { name: `Level ${level}`, parentId });
      depths.push(created.depth);
      if (level === 4) expect(created.depthWarning).toBe(true);
      if (level === 3) expect(created.depthWarning).toBe(false);
      parentId = created.collection.id;
    }
    expect(depths).toEqual([1, 2, 3, 4, 5]);
    expect(await getCollectionDepth(db, parentId as string)).toBe(5);
    expect(await db.collections.count()).toBe(5);
  });

  it("reorders between siblings and at the ends", async () => {
    const a = await createCollection(db, { name: "A" });
    const b = await createCollection(db, { name: "B" });
    const c = await createCollection(db, { name: "C" });

    const between = await reorderCollection(db, c.collection.id, {
      previousId: a.collection.id,
      nextId: b.collection.id,
    });
    expect(between.orderIndex).toBeGreaterThan(a.collection.orderIndex);
    expect(between.orderIndex).toBeLessThan(b.collection.orderIndex);

    await reorderCollection(db, c.collection.id, { previousId: null, nextId: a.collection.id });
    expect((await listSiblings(db, null))[0]?.id).toBe(c.collection.id);

    await expect(
      reorderCollection(db, c.collection.id, { previousId: crypto.randomUUID(), nextId: null }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });

  it("resequences siblings when the fractional gap is exhausted", async () => {
    const a = await createCollection(db, { name: "A" });
    const b = await createCollection(db, { name: "B" });
    const target = await createCollection(db, { name: "Target" });

    // Simulate a dense subtree: neighbours 1e-7 apart.
    await db.collections.update(a.collection.id, { orderIndex: 1 });
    await db.collections.update(b.collection.id, { orderIndex: 1 + 1e-7 });

    const moved = await reorderCollection(db, target.collection.id, {
      previousId: a.collection.id,
      nextId: b.collection.id,
    });

    const siblings = await listSiblings(db, null);
    expect(siblings.map((sibling) => sibling.id)).toEqual([
      a.collection.id,
      target.collection.id,
      b.collection.id,
    ]);
    expect(siblings[0]?.orderIndex).toBe(1024);
    expect(siblings[2]?.orderIndex).toBe(2048);
    expect(moved.orderIndex).toBeGreaterThan(siblings[0]?.orderIndex ?? 0);
    expect(moved.orderIndex).toBeLessThan(siblings[2]?.orderIndex ?? 0);
  });

  it("deletes non-destructively: joins removed, children reassigned, resources untouched", async () => {
    const root = await createCollection(db, { name: "Root" });
    const parent = await createCollection(db, { name: "Parent", parentId: root.collection.id });
    const child = await createCollection(db, { name: "Child", parentId: parent.collection.id });
    const { resource } = await createResource(db, { url: "https://example.com/keep" });
    await addResourceToCollection(db, resource.id, parent.collection.id);

    const result = await deleteCollection(db, parent.collection.id);

    expect(result.removedJoinCount).toBe(1);
    expect(result.reassignedChildIds).toEqual([child.collection.id]);
    expect(await db.collections.get(parent.collection.id)).toBeUndefined();
    expect((await db.collections.get(child.collection.id))?.parentId).toBe(root.collection.id);
    expect(await db.resources.get(resource.id)).toBeDefined();
    expect(await db.resourceCollections.count()).toBe(0);
  });

  it("lists every collection deterministically", async () => {
    const a = await createCollection(db, { name: "A" });
    await createCollection(db, { name: "B", parentId: a.collection.id });
    const all = await listCollections(db);
    expect(all).toHaveLength(2);
    expect(all.map((collection) => collection.name).sort()).toEqual(["A", "B"]);
    // Deterministic: (orderIndex, id) — repeated reads return the same order.
    expect((await listCollections(db)).map((collection) => collection.id)).toEqual(
      all.map((collection) => collection.id),
    );
  });
});
