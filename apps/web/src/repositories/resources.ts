/**
 * DB-002 / DB-003 — resources. `canonicalUrl` is the dedup authority (unique
 * index); identity is a client UUID. Soft delete keeps join rows so restore is
 * lossless (U5).
 */
import type { z } from "zod";
import {
  canonicalizeUrl,
  DEFAULT_PURGE_RETENTION_DAYS,
  extractDomain,
  resourceInputSchema,
  resourcePatchSchema,
  resourceSchema,
  type Resource,
  type ResourceInput,
  type ResourcePatch,
} from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow, parsePersisted, RepositoryError } from "./errors.ts";
import { addResourceToCollection, addTagToResource } from "./relationships.ts";
import { ensureTags } from "./tags.ts";

export interface CreateResourceResult {
  resource: Resource;
  /** True when `canonicalUrl` already existed; the existing row is returned. */
  duplicate: boolean;
}

export interface CreateResourceOptions {
  /**
   * EXT-004: capture ID becomes `resources.id`, making capture-ID idempotency
   * possible on top of the canonical-URL unique index. Defaults to a new UUID.
   */
  id?: string;
  /**
   * EXT-004 bridge only: unknown collection/tag IDs are dropped instead of
   * throwing (the web inbox must never create implicit collections, and one
   * stale membership must not reject an otherwise valid capture).
   */
  dropMissingMembers?: boolean;
}

export interface CreateResourceMembers {
  collectionIds?: readonly string[];
  tagIds?: readonly string[];
  /** Create-or-get tags by display name (normalized inside the same transaction). */
  tagNames?: readonly string[];
}

type ValidatedResourceInput = z.output<typeof resourceInputSchema>;

function buildResource(input: ValidatedResourceInput, id: string = crypto.randomUUID()): Resource {
  const canonicalUrl = canonicalizeUrl(input.url);
  const now = Date.now();
  return parseOrThrow(
    resourceSchema,
    {
      ...input,
      id,
      canonicalUrl,
      domain: extractDomain(canonicalUrl),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      deletedAt: null,
    },
    "resource",
  );
}

/**
 * Creates a resource, or returns the existing one when its canonical URL is already
 * stored (including soft-deleted rows — IndexedDB's unique index covers those too).
 *
 * With an explicit `id` (EXT-004 capture ID), the ID is checked first so a
 * capture ID can never be rebound to a different canonical URL — replaying a
 * capture is idempotent; reusing its ID for copy-protection is a CONSTRAINT.
 */
export async function createResource(
  database: FluidDeckDatabase,
  input: ResourceInput,
  options: CreateResourceOptions = {},
): Promise<CreateResourceResult> {
  const valid = parseOrThrow(resourceInputSchema, input, "resource");
  const canonicalUrl = canonicalizeUrl(valid.url);
  const id = options.id ?? crypto.randomUUID();

  if (options.id !== undefined) {
    const byId = await database.resources.get(id);
    if (byId) {
      if (byId.canonicalUrl !== canonicalUrl) {
        throw new RepositoryError(
          "CONSTRAINT",
          `Capture ${id} was already created for a different URL`,
        );
      }
      return { resource: byId, duplicate: true };
    }
  }

  const existing = await database.resources.where("canonicalUrl").equals(canonicalUrl).first();
  if (existing) return { resource: existing, duplicate: true };

  const resource = buildResource(valid, id);
  try {
    await database.resources.add(resource);
  } catch (error) {
    const winner =
      (await database.resources.get(id)) ??
      (await database.resources.where("canonicalUrl").equals(canonicalUrl).first());
    if (winner) {
      if (winner.id === id && winner.canonicalUrl !== canonicalUrl) {
        throw new RepositoryError(
          "CONSTRAINT",
          `Capture ${id} was already created for a different URL`,
        );
      }
      return { resource: winner, duplicate: true };
    }
    throw error;
  }
  return { resource, duplicate: false };
}

/**
 * One transaction: resource + membership rows + tag usage counts. A failure
 * anywhere leaves no resource and no join rows behind.
 */
export async function createResourceWithMembers(
  database: FluidDeckDatabase,
  input: ResourceInput,
  members: CreateResourceMembers = {},
  options: CreateResourceOptions = {},
): Promise<CreateResourceResult> {
  return database.transaction(
    "rw",
    [
      database.resources,
      database.collections,
      database.resourceCollections,
      database.tags,
      database.resourceTags,
    ],
    async () => {
      const result = await createResource(database, input, options);
      if (result.duplicate) return result;

      const collectionIds = options.dropMissingMembers
        ? (await database.collections.bulkGet([...(members.collectionIds ?? [])])).flatMap(
            (collection) => (collection ? [collection.id] : []),
          )
        : (members.collectionIds ?? []);

      const namedTags =
        members.tagNames && members.tagNames.length > 0
          ? await ensureTags(database, members.tagNames)
          : [];
      const tagIds = [...(members.tagIds ?? []), ...namedTags.map((tag) => tag.id)];
      const resolvedTagIds = options.dropMissingMembers
        ? (await database.tags.bulkGet(tagIds)).flatMap((tag) => (tag ? [tag.id] : []))
        : tagIds;

      for (const collectionId of collectionIds) {
        await addResourceToCollection(database, result.resource.id, collectionId);
      }
      for (const tagId of resolvedTagIds) {
        await addTagToResource(database, result.resource.id, tagId);
      }
      const stored = await database.resources.get(result.resource.id);
      return { resource: stored ?? result.resource, duplicate: false };
    },
  );
}

export async function getResource(
  database: FluidDeckDatabase,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Resource | null> {
  const row = await database.resources.get(id);
  if (!row) return null;
  if (row.deletedAt !== null && options.includeDeleted !== true) return null;
  return parsePersisted(resourceSchema, row, "resources", id);
}

export async function getResourceByCanonicalUrl(
  database: FluidDeckDatabase,
  url: string,
): Promise<Resource | null> {
  const canonicalUrl = canonicalizeUrl(url);
  const row = await database.resources.where("canonicalUrl").equals(canonicalUrl).first();
  if (!row) return null;
  return parsePersisted(resourceSchema, row, "resources", row.id);
}

/** Newest first via the `createdAt` index; soft-deleted rows are excluded. */
export async function listResources(
  database: FluidDeckDatabase,
  options: { includeDeleted?: boolean; limit?: number } = {},
): Promise<Resource[]> {
  const query = database.resources.orderBy("createdAt").reverse();
  const rows =
    options.limit !== undefined
      ? await query.limit(options.limit).toArray()
      : await query.toArray();
  const result: Resource[] = [];
  for (const row of rows) {
    if (options.includeDeleted !== true && row.deletedAt !== null) continue;
    const parsed = parsePersisted(resourceSchema, row, "resources", row.id);
    if (parsed) result.push(parsed);
  }
  return result;
}

/** Trash view: `[deletedAt+createdAt]` index (nulls are not indexed by IndexedDB). */
export async function listTrashedResources(database: FluidDeckDatabase): Promise<Resource[]> {
  const rows = await database.resources
    .where("[deletedAt+createdAt]")
    .between([0, 0], [Infinity, Infinity])
    .toArray();
  const result: Resource[] = [];
  for (const row of rows) {
    const parsed = parsePersisted(resourceSchema, row, "resources", row.id);
    if (parsed) result.push(parsed);
  }
  return result.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export async function updateResource(
  database: FluidDeckDatabase,
  id: string,
  patch: ResourcePatch,
): Promise<Resource> {
  const valid = parseOrThrow(resourcePatchSchema, patch, "resource patch");

  return database.transaction("rw", [database.resources], async () => {
    const resource = await database.resources.get(id);
    if (!resource) throw new RepositoryError("NOT_FOUND", `Resource not found: ${id}`);

    const changes: Partial<Resource> = { ...valid, updatedAt: Date.now() };

    if (valid.url !== undefined) {
      const canonicalUrl = canonicalizeUrl(valid.url);
      const clash = await database.resources.where("canonicalUrl").equals(canonicalUrl).first();
      if (clash && clash.id !== id) {
        throw new RepositoryError(
          "CONSTRAINT",
          `Another resource already uses this URL: ${clash.canonicalUrl}`,
        );
      }
      changes.canonicalUrl = canonicalUrl;
      changes.domain = extractDomain(canonicalUrl);
    }

    await database.resources.update(id, changes);
    const updated = await database.resources.get(id);
    if (!updated) throw new RepositoryError("NOT_FOUND", `Resource not found: ${id}`);
    return parseOrThrow(resourceSchema, updated, "resource");
  });
}

export async function softDeleteResource(
  database: FluidDeckDatabase,
  id: string,
): Promise<Resource> {
  return database.transaction("rw", [database.resources], async () => {
    const resource = await database.resources.get(id);
    if (!resource) throw new RepositoryError("NOT_FOUND", `Resource not found: ${id}`);
    // Already deleted: keep the original timestamp so retention is not extended.
    if (resource.deletedAt !== null) return resource;

    const deletedAt = Date.now();
    await database.resources.update(id, { deletedAt, updatedAt: deletedAt });
    return { ...resource, deletedAt, updatedAt: deletedAt };
  });
}

export async function restoreResource(database: FluidDeckDatabase, id: string): Promise<Resource> {
  return database.transaction("rw", [database.resources], async () => {
    const resource = await database.resources.get(id);
    if (!resource) throw new RepositoryError("NOT_FOUND", `Resource not found: ${id}`);
    if (resource.deletedAt === null) return resource;

    const updatedAt = Date.now();
    await database.resources.update(id, { deletedAt: null, updatedAt });
    return { ...resource, deletedAt: null, updatedAt };
  });
}

/** Fire-and-forget in the UI; never bumps `updatedAt`. */
export async function markResourceOpened(
  database: FluidDeckDatabase,
  id: string,
  at: number = Date.now(),
): Promise<void> {
  await database.resources.update(id, { lastOpenedAt: at });
}

/**
 * U5 — explicit, guarded purge. Deletes only resources whose `deletedAt` is older
 * than the retention window, together with their membership rows. Ordinary
 * repository operations never call this.
 */
export async function purgeDeletedResources(
  database: FluidDeckDatabase,
  options: {
    confirm: true;
    retentionDays?: number;
    now?: number;
  },
): Promise<{ purged: number }> {
  if (options.confirm !== true) {
    throw new RepositoryError("CONSTRAINT", "Purge requires explicit confirmation");
  }
  const retentionDays = options.retentionDays ?? DEFAULT_PURGE_RETENTION_DAYS;
  const cutoff = (options.now ?? Date.now()) - retentionDays * 24 * 60 * 60 * 1000;

  return database.transaction(
    "rw",
    [database.resources, database.resourceCollections, database.resourceTags],
    async () => {
      const trashed = await database.resources
        .where("[deletedAt+createdAt]")
        .between([0, 0], [cutoff, Infinity])
        .toArray();
      const expired = trashed.filter((row) => row.deletedAt !== null && row.deletedAt < cutoff);

      for (const resource of expired) {
        await database.resourceCollections.where("resourceId").equals(resource.id).delete();
        await database.resourceTags.where("resourceId").equals(resource.id).delete();
        await database.resources.delete(resource.id);
      }
      return { purged: expired.length };
    },
  );
}
