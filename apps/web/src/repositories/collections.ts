/**
 * DB-002 / DB-003 — collections: nesting, U1 fractional ordering, U2 depth warning.
 *
 * IndexedDB cannot index `null`, so top-level siblings are found with a filter;
 * nested siblings use the `parentId` index. Collection deletes never touch resources.
 */
import {
  collectionInputSchema,
  collectionPatchSchema,
  collectionSchema,
  type Collection,
  type CollectionInput,
} from "@fluid-deck/core";
import {
  collectionDepth,
  compareOrder,
  isDepthWarning,
  needsResequence,
  orderBetween,
  resequence,
} from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow, RepositoryError } from "./errors.ts";

export function normalizeCollectionName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function listCollections(database: FluidDeckDatabase): Promise<Collection[]> {
  return (await database.collections.toArray()).sort(compareOrder);
}

export async function listSiblings(
  database: FluidDeckDatabase,
  parentId: string | null,
): Promise<Collection[]> {
  const siblings =
    parentId === null
      ? await database.collections.filter((collection) => collection.parentId === null).toArray()
      : await database.collections.where("parentId").equals(parentId).toArray();
  return siblings.sort(compareOrder);
}

async function parentMap(database: FluidDeckDatabase): Promise<Map<string, string | null>> {
  const all = await database.collections.toArray();
  return new Map(all.map((collection) => [collection.id, collection.parentId]));
}

export async function getCollectionDepth(database: FluidDeckDatabase, id: string): Promise<number> {
  return collectionDepth(id, await parentMap(database));
}

async function assertParentExists(
  database: FluidDeckDatabase,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  const parent = await database.collections.get(parentId);
  if (!parent) {
    throw new RepositoryError("INVALID_REFERENCE", `Parent collection not found: ${parentId}`);
  }
}

async function assertSiblingNameFree(
  database: FluidDeckDatabase,
  parentId: string | null,
  name: string,
  exceptId?: string,
): Promise<void> {
  const normalized = normalizeCollectionName(name);
  const clash = (await listSiblings(database, parentId)).find(
    (sibling) => sibling.id !== exceptId && normalizeCollectionName(sibling.name) === normalized,
  );
  if (clash) {
    throw new RepositoryError(
      "CONSTRAINT",
      `A collection named "${clash.name}" already exists at this level`,
    );
  }
}

/** True when `candidateParentId` is `id` itself or one of its descendants. */
async function wouldCreateCycle(
  database: FluidDeckDatabase,
  id: string,
  candidateParentId: string | null,
): Promise<boolean> {
  if (candidateParentId === null) return false;
  const parents = await parentMap(database);
  let current: string | null = candidateParentId;
  const seen = new Set<string>();
  while (current !== null) {
    if (current === id) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parents.get(current) ?? null;
  }
  return false;
}

export async function createCollection(
  database: FluidDeckDatabase,
  input: CollectionInput,
): Promise<{ collection: Collection; depth: number; depthWarning: boolean }> {
  const valid = parseOrThrow(collectionInputSchema, input, "collection");

  return database.transaction("rw", [database.collections], async () => {
    await assertParentExists(database, valid.parentId);
    await assertSiblingNameFree(database, valid.parentId, valid.name);

    const siblings = await listSiblings(database, valid.parentId);
    const last = siblings.at(-1)?.orderIndex ?? null;
    const now = Date.now();
    const collection = parseOrThrow(
      collectionSchema,
      {
        id: crypto.randomUUID(),
        name: valid.name,
        parentId: valid.parentId,
        orderIndex: orderBetween(last, null),
        createdAt: now,
        updatedAt: now,
      },
      "collection",
    );
    await database.collections.add(collection);

    const depth =
      valid.parentId === null ? 1 : (await getCollectionDepth(database, valid.parentId)) + 1;
    return { collection, depth, depthWarning: isDepthWarning(depth) };
  });
}

export async function renameCollection(
  database: FluidDeckDatabase,
  id: string,
  name: string,
): Promise<Collection> {
  const valid = parseOrThrow(collectionPatchSchema, { name }, "collection patch");

  return database.transaction("rw", [database.collections], async () => {
    const collection = await database.collections.get(id);
    if (!collection) throw new RepositoryError("NOT_FOUND", `Collection not found: ${id}`);
    if (valid.name === undefined) return collection;

    await assertSiblingNameFree(database, collection.parentId, valid.name, id);
    await database.collections.update(id, { name: valid.name, updatedAt: Date.now() });
    return { ...collection, name: valid.name, updatedAt: Date.now() };
  });
}

export async function reparentCollection(
  database: FluidDeckDatabase,
  id: string,
  parentId: string | null,
): Promise<{ collection: Collection; depth: number; depthWarning: boolean }> {
  const valid = parseOrThrow(collectionPatchSchema, { parentId }, "collection patch");

  return database.transaction("rw", [database.collections], async () => {
    const collection = await database.collections.get(id);
    if (!collection) throw new RepositoryError("NOT_FOUND", `Collection not found: ${id}`);

    const nextParentId = valid.parentId === undefined ? collection.parentId : valid.parentId;
    if (nextParentId === id) {
      throw new RepositoryError("CYCLE", "A collection cannot be its own parent");
    }
    if (await wouldCreateCycle(database, id, nextParentId)) {
      throw new RepositoryError("CYCLE", "A collection cannot move inside its own subtree");
    }
    await assertParentExists(database, nextParentId);
    await assertSiblingNameFree(database, nextParentId, collection.name, id);

    const siblings = await listSiblings(database, nextParentId);
    const last = siblings.filter((sibling) => sibling.id !== id).at(-1)?.orderIndex ?? null;
    const updatedAt = Date.now();
    const orderIndex = orderBetween(last, null);
    await database.collections.update(id, { parentId: nextParentId, orderIndex, updatedAt });

    const depth =
      nextParentId === null ? 1 : (await getCollectionDepth(database, nextParentId)) + 1;
    return {
      collection: { ...collection, parentId: nextParentId, orderIndex, updatedAt },
      depth,
      depthWarning: isDepthWarning(depth),
    };
  });
}

/**
 * U1 — places `id` between two siblings (either side may be `null`). When the gap
 * between neighbours is exhausted, all siblings are resequenced in the same
 * transaction before the midpoint is recomputed.
 */
export async function reorderCollection(
  database: FluidDeckDatabase,
  id: string,
  neighbours: { previousId: string | null; nextId: string | null },
): Promise<Collection> {
  return database.transaction("rw", [database.collections], async () => {
    const collection = await database.collections.get(id);
    if (!collection) throw new RepositoryError("NOT_FOUND", `Collection not found: ${id}`);

    const siblings = await listSiblings(database, collection.parentId);
    const pick = (neighbourId: string | null) => {
      if (neighbourId === null) return null;
      const sibling = siblings.find((candidate) => candidate.id === neighbourId);
      if (!sibling) {
        throw new RepositoryError(
          "INVALID_REFERENCE",
          `Neighbour ${neighbourId} is not a sibling of ${id}`,
        );
      }
      return sibling;
    };

    let previous = pick(neighbours.previousId);
    let next = pick(neighbours.nextId);

    if (previous && next && needsResequence(previous.orderIndex, next.orderIndex)) {
      const ordered = siblings.filter((sibling) => sibling.id !== id);
      const positions = resequence(ordered.length);
      for (const [index, sibling] of ordered.entries()) {
        await database.collections.update(sibling.id, { orderIndex: positions[index] as number });
      }
      const refreshed = new Map(
        ordered.map((sibling, index) => [sibling.id, positions[index] as number]),
      );
      previous = previous
        ? { ...previous, orderIndex: refreshed.get(previous.id) as number }
        : null;
      next = next ? { ...next, orderIndex: refreshed.get(next.id) as number } : null;
    }

    const orderIndex = orderBetween(previous?.orderIndex ?? null, next?.orderIndex ?? null);
    const updatedAt = Date.now();
    await database.collections.update(id, { orderIndex, updatedAt });
    return { ...collection, orderIndex, updatedAt };
  });
}

/**
 * Non-destructive delete (FR-ORG-005): children move up to the deleted parent's
 * parent, membership rows are removed, resources themselves are untouched.
 */
export async function deleteCollection(
  database: FluidDeckDatabase,
  id: string,
): Promise<{ removedJoinCount: number; reassignedChildIds: string[] }> {
  return database.transaction(
    "rw",
    [database.collections, database.resourceCollections, database.resources],
    async () => {
      const collection = await database.collections.get(id);
      if (!collection) throw new RepositoryError("NOT_FOUND", `Collection not found: ${id}`);

      const children = await database.collections.where("parentId").equals(id).toArray();
      const updatedAt = Date.now();
      for (const child of children) {
        await database.collections.update(child.id, {
          parentId: collection.parentId,
          updatedAt,
        });
      }

      const joins = await database.resourceCollections.where("collectionId").equals(id).toArray();
      const affectedResources = new Set(joins.map((join) => join.resourceId));
      for (const resourceId of affectedResources) {
        await database.resources.update(resourceId, { updatedAt });
      }
      await database.resourceCollections.where("collectionId").equals(id).delete();
      await database.collections.delete(id);

      return {
        removedJoinCount: joins.length,
        reassignedChildIds: children.map((child) => child.id),
      };
    },
  );
}
