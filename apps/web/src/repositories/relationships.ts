/**
 * DB-002 — resource↔collection and resource↔tag membership (Phase 2.2 §2.1, §4).
 *
 * Compound primary keys make duplicate membership impossible. Every mutation runs
 * in one Dexie transaction covering the join row, both parents and the resource's
 * `updatedAt` (and the tag's `usageCount`), so a failure leaves nothing partial.
 */
import {
  resourceCollectionSchema,
  resourceTagSchema,
  type Collection,
  type Resource,
  type ResourceCollection,
  type ResourceTag,
  type Tag,
} from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow, RepositoryError } from "./errors.ts";

export async function requireResource(database: FluidDeckDatabase, id: string): Promise<Resource> {
  const resource = await database.resources.get(id);
  if (!resource) throw new RepositoryError("NOT_FOUND", `Resource not found: ${id}`);
  return resource;
}

export async function requireCollection(
  database: FluidDeckDatabase,
  id: string,
): Promise<Collection> {
  const collection = await database.collections.get(id);
  if (!collection) throw new RepositoryError("INVALID_REFERENCE", `Collection not found: ${id}`);
  return collection;
}

export async function requireTag(database: FluidDeckDatabase, id: string): Promise<Tag> {
  const tag = await database.tags.get(id);
  if (!tag) throw new RepositoryError("INVALID_REFERENCE", `Tag not found: ${id}`);
  return tag;
}

async function bumpResource(database: FluidDeckDatabase, id: string): Promise<void> {
  await database.resources.update(id, { updatedAt: Date.now() });
}

export async function addResourceToCollection(
  database: FluidDeckDatabase,
  resourceId: string,
  collectionId: string,
): Promise<{ added: boolean }> {
  return database.transaction(
    "rw",
    [database.resources, database.collections, database.resourceCollections],
    async () => {
      await requireResource(database, resourceId);
      await requireCollection(database, collectionId);

      const existing = await database.resourceCollections.get([resourceId, collectionId]);
      if (existing) return { added: false };

      const join = parseOrThrow(
        resourceCollectionSchema,
        { resourceId, collectionId, addedAt: Date.now() },
        "resourceCollection",
      );
      await database.resourceCollections.add(join);
      await bumpResource(database, resourceId);
      return { added: true };
    },
  );
}

export async function removeResourceFromCollection(
  database: FluidDeckDatabase,
  resourceId: string,
  collectionId: string,
): Promise<{ removed: boolean }> {
  return database.transaction(
    "rw",
    [database.resources, database.resourceCollections],
    async () => {
      await requireResource(database, resourceId);
      const existing = await database.resourceCollections.get([resourceId, collectionId]);
      if (!existing) return { removed: false };
      await database.resourceCollections.delete([resourceId, collectionId]);
      await bumpResource(database, resourceId);
      return { removed: true };
    },
  );
}

export async function addTagToResource(
  database: FluidDeckDatabase,
  resourceId: string,
  tagId: string,
): Promise<{ added: boolean }> {
  return database.transaction(
    "rw",
    [database.resources, database.tags, database.resourceTags],
    async () => {
      await requireResource(database, resourceId);
      const tag = await requireTag(database, tagId);

      const existing = await database.resourceTags.get([resourceId, tagId]);
      if (existing) return { added: false };

      const join = parseOrThrow(resourceTagSchema, { resourceId, tagId }, "resourceTag");
      await database.resourceTags.add(join);
      await database.tags.update(tagId, { usageCount: tag.usageCount + 1 });
      await bumpResource(database, resourceId);
      return { added: true };
    },
  );
}

export async function removeTagFromResource(
  database: FluidDeckDatabase,
  resourceId: string,
  tagId: string,
): Promise<{ removed: boolean }> {
  return database.transaction(
    "rw",
    [database.resources, database.tags, database.resourceTags],
    async () => {
      await requireResource(database, resourceId);
      const existing = await database.resourceTags.get([resourceId, tagId]);
      if (!existing) return { removed: false };

      await database.resourceTags.delete([resourceId, tagId]);
      const tag = await database.tags.get(tagId);
      if (tag) {
        await database.tags.update(tagId, { usageCount: Math.max(0, tag.usageCount - 1) });
      }
      await bumpResource(database, resourceId);
      return { removed: true };
    },
  );
}

export async function listResourceCollections(
  database: FluidDeckDatabase,
  resourceId: string,
): Promise<ResourceCollection[]> {
  return database.resourceCollections.where("resourceId").equals(resourceId).toArray();
}

export async function listCollectionMembers(
  database: FluidDeckDatabase,
  collectionId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Resource[]> {
  const joins = await database.resourceCollections
    .where("collectionId")
    .equals(collectionId)
    .toArray();
  const resources = await database.resources.bulkGet(joins.map((join) => join.resourceId));
  return resources
    .filter((resource): resource is Resource => Boolean(resource))
    .filter((resource) => options.includeDeleted === true || resource.deletedAt === null);
}

export async function listResourceTags(
  database: FluidDeckDatabase,
  resourceId: string,
): Promise<ResourceTag[]> {
  return database.resourceTags.where("resourceId").equals(resourceId).toArray();
}

export async function listTaggedResources(
  database: FluidDeckDatabase,
  tagId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Resource[]> {
  const joins = await database.resourceTags.where("tagId").equals(tagId).toArray();
  const resources = await database.resources.bulkGet(joins.map((join) => join.resourceId));
  return resources
    .filter((resource): resource is Resource => Boolean(resource))
    .filter((resource) => options.includeDeleted === true || resource.deletedAt === null);
}
