import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createCollection } from "./collections.ts";
import { createTag } from "./tags.ts";
import { createResource, softDeleteResource } from "./resources.ts";
import {
  addResourceToCollection,
  addTagToResource,
  listCollectionMembers,
  listResourceCollections,
  listResourceTags,
  listTaggedResources,
  removeResourceFromCollection,
  removeTagFromResource,
} from "./relationships.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

async function setup() {
  const { collection } = await createCollection(db, { name: "Inbox" });
  const { tag } = await createTag(db, "react");
  const { resource } = await createResource(db, { url: "https://example.com/r" });
  return { collection, tag, resource };
}

describe("relationship repository", () => {
  it("prevents duplicate membership rows via the compound key", async () => {
    const { collection, resource } = await setup();
    expect(await addResourceToCollection(db, resource.id, collection.id)).toEqual({ added: true });
    expect(await addResourceToCollection(db, resource.id, collection.id)).toEqual({ added: false });
    expect(await db.resourceCollections.count()).toBe(1);
    expect(await listResourceCollections(db, resource.id)).toHaveLength(1);
    expect(await listCollectionMembers(db, collection.id)).toHaveLength(1);
  });

  it("rejects references to missing records and writes nothing", async () => {
    const { collection, resource } = await setup();
    await expect(
      addResourceToCollection(db, crypto.randomUUID(), collection.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addResourceToCollection(db, resource.id, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(addTagToResource(db, resource.id, crypto.randomUUID())).rejects.toMatchObject({
      code: "INVALID_REFERENCE",
    });
    expect(await db.resourceCollections.count()).toBe(0);
    expect(await db.resourceTags.count()).toBe(0);
  });

  it("maintains tag usageCount in the same transaction", async () => {
    const { tag, resource } = await setup();
    const other = await createResource(db, { url: "https://example.com/other" });

    expect(await addTagToResource(db, resource.id, tag.id)).toEqual({ added: true });
    expect(await addTagToResource(db, resource.id, tag.id)).toEqual({ added: false });
    await addTagToResource(db, other.resource.id, tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(2);

    await removeTagFromResource(db, resource.id, tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(1);
    expect(await listResourceTags(db, resource.id)).toHaveLength(0);
    expect(await listTaggedResources(db, tag.id)).toHaveLength(1);
  });

  it("removes membership without deleting the resource, collection or tag", async () => {
    const { collection, tag, resource } = await setup();
    await addResourceToCollection(db, resource.id, collection.id);
    await addTagToResource(db, resource.id, tag.id);

    expect(await removeResourceFromCollection(db, resource.id, collection.id)).toEqual({
      removed: true,
    });
    expect(await removeResourceFromCollection(db, resource.id, collection.id)).toEqual({
      removed: false,
    });

    expect(await db.resources.get(resource.id)).toBeDefined();
    expect(await db.collections.get(collection.id)).toBeDefined();
    expect(await db.tags.get(tag.id)).toBeDefined();
  });

  it("bumps the resource updatedAt when membership changes", async () => {
    const { collection, resource } = await setup();
    const before = resource.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await addResourceToCollection(db, resource.id, collection.id);
    expect((await db.resources.get(resource.id))?.updatedAt).toBeGreaterThan(before);
  });

  it("excludes soft-deleted resources from membership listings by default", async () => {
    const { collection, tag, resource } = await setup();
    await addResourceToCollection(db, resource.id, collection.id);
    await addTagToResource(db, resource.id, tag.id);
    await softDeleteResource(db, resource.id);

    expect(await listCollectionMembers(db, collection.id)).toHaveLength(0);
    expect(await listTaggedResources(db, tag.id)).toHaveLength(0);
    expect(await listCollectionMembers(db, collection.id, { includeDeleted: true })).toHaveLength(
      1,
    );
    expect(await listTaggedResources(db, tag.id, { includeDeleted: true })).toHaveLength(1);
  });
});
