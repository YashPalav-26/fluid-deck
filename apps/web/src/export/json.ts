/**
 * IMPORT-006 - streaming JSON export.
 *
 * Reads the library, serializes it in 500-record chunks and hands the caller a Blob
 * plus the file metadata. No dependency: `JSON.stringify` + `Blob` + an `<a download>`.
 *
 * Shape: Raindrop-compatible envelope (`result`/`items`/`collections`/`tags`) so the
 * IMPORT-002 parser can read a file we wrote, extended with the fields Raindrop has no
 * name for. A resource in several collections keeps every membership in
 * `collectionIds`; `collection` mirrors the first one for import compatibility.
 */
import type { Collection, Resource, Tag, ViewState } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listCollectionMembers, listTaggedResources } from "../repositories/relationships.ts";
import { listResources } from "../repositories/resources.ts";
import { viewDateBounds } from "../services/library.ts";

export const EXPORT_FORMAT_VERSION = 1;
/** Approved block size: one serialized chunk per 500 records. */
export const EXPORT_CHUNK_SIZE = 500;
/** Deferred revoke so the user can open the file before the blob URL dies. */
export const EXPORT_REVOKE_DELAY_MS = 10_000;

export type ExportScope =
  | { kind: "all" }
  | { kind: "collection"; collectionId: string }
  | { kind: "selected"; resourceIds: readonly string[] }
  | { kind: "filter"; view: ViewState };

export interface ExportFileMeta {
  version: number;
  exportedAt: string;
  resourceCount: number;
  /** True when a scope narrowed the export (everything was not exported). */
  truncated: boolean;
}

export interface JsonExport {
  blob: Blob;
  filename: string;
  meta: ExportFileMeta;
}

interface ExportItem {
  _id: string;
  link: string;
  title: string;
  description: string;
  note: string;
  cover: string;
  faviconUrl: string;
  canonicalUrl: string;
  domain: string;
  type: Resource["type"];
  source: Resource["source"];
  extractionStatus: Resource["extractionStatus"];
  extractionNotes: string[];
  created: string;
  lastUpdate: string;
  lastOpenedAt: string | null;
  collectionIds: string[];
  /** Raindrop's single-folder field; the parser reads this one back. */
  collection: { $id: string } | null;
  tags: string[];
}

interface ExportCollection {
  _id: string;
  title: string;
  parent: { $id: string } | null;
  sort: number;
}

interface ExportTag {
  _id: string;
  title: string;
  count: number;
}

interface ExportRelations {
  collectionIds: Map<string, string[]>;
  tagNames: Map<string, string[]>;
  tagUsage: Map<string, number>;
}

async function selectResources(
  database: FluidDeckDatabase,
  scope: ExportScope,
): Promise<Resource[]> {
  switch (scope.kind) {
    case "all":
      return listResources(database);
    case "collection":
      return listCollectionMembers(database, scope.collectionId);
    case "selected": {
      // Reads through the validated list path instead of bulkGet: one extra scan,
      // but a corrupt persisted row can never reach the export file.
      const wanted = new Set(scope.resourceIds);
      return (await listResources(database)).filter((resource) => wanted.has(resource.id));
    }
    case "filter":
      return filterByView(database, await listResources(database), scope.view);
  }
}

/**
 * Mirrors the browse filter chain in `services/library.ts`, minus its 500-card grid
 * cap: "Current Filter" must export every match, not the first screen of it.
 * `shortcut: filter rules duplicated from the library service; unify when the grid cap
 * is separated from the query (IMPORT-009 screens)`.
 */
async function filterByView(
  database: FluidDeckDatabase,
  resources: Resource[],
  view: ViewState,
): Promise<Resource[]> {
  let next = resources;
  if (view.type) next = next.filter((resource) => resource.type === view.type);
  if (view.source) next = next.filter((resource) => resource.source === view.source);
  if (view.date) {
    const bounds = viewDateBounds(view.date);
    if (bounds) {
      next = next.filter(
        (resource) => resource.createdAt >= bounds.from && resource.createdAt <= bounds.to,
      );
    }
  }
  if (view.domain) next = next.filter((resource) => resource.domain === view.domain);

  if (view.unorganized) {
    const organized = new Set(
      (await database.resourceCollections.toArray()).map((join) => join.resourceId),
    );
    next = next.filter((resource) => !organized.has(resource.id));
  }

  if (view.collection) {
    const members = new Set(
      (await listCollectionMembers(database, view.collection)).map((resource) => resource.id),
    );
    next = next.filter((resource) => members.has(resource.id));
  }

  if (view.tags.length > 0) {
    const byName = new Map(
      (await database.tags.toArray()).map((tag) => [tag.normalizedName, tag.id]),
    );
    const tagIds = view.tags
      .map((name) => byName.get(name.normalize("NFC").trim().toLowerCase()))
      .filter((id): id is string => Boolean(id));
    if (tagIds.length === 0) return [];
    const tagged = new Set<string>();
    for (const tagId of tagIds) {
      for (const resource of await listTaggedResources(database, tagId)) tagged.add(resource.id);
    }
    next = next.filter((resource) => tagged.has(resource.id));
  }

  return next;
}

/**
 * `shortcut: join tables are scanned whole; fine for a personal library (the 10k
 * corpus is ~2 rows per resource), switch to indexed `anyOf` past ~1e5 join rows`.
 */
async function readRelations(
  database: FluidDeckDatabase,
  exported: readonly Resource[],
): Promise<ExportRelations> {
  const ids = new Set(exported.map((resource) => resource.id));
  const collectionIds = new Map<string, string[]>();
  for (const join of await database.resourceCollections.toArray()) {
    if (!ids.has(join.resourceId)) continue;
    const list = collectionIds.get(join.resourceId) ?? [];
    list.push(join.collectionId);
    collectionIds.set(join.resourceId, list);
  }
  // Join rows come back in insertion order; sort so exports are byte-stable.
  for (const list of collectionIds.values()) list.sort();

  const tagById = new Map((await database.tags.toArray()).map((tag) => [tag.id, tag]));
  const tagNames = new Map<string, string[]>();
  for (const join of await database.resourceTags.toArray()) {
    if (!ids.has(join.resourceId)) continue;
    const tag = tagById.get(join.tagId);
    if (!tag) continue;
    const list = tagNames.get(join.resourceId) ?? [];
    list.push(tag.name);
    tagNames.set(join.resourceId, list);
  }
  for (const list of tagNames.values()) list.sort();

  const tagUsage = new Map<string, number>();
  for (const names of tagNames.values()) {
    for (const name of names) tagUsage.set(name, (tagUsage.get(name) ?? 0) + 1);
  }
  return { collectionIds, tagNames, tagUsage };
}

/** Referenced collections plus their ancestors, so the export keeps the tree. */
function collectCollections(
  collections: readonly Collection[],
  referenced: ReadonlySet<string>,
): Collection[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const keep = new Set<string>();
  for (const id of referenced) {
    let current = byId.get(id);
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return collections
    .filter((collection) => keep.has(collection.id))
    .sort(
      (a, b) =>
        a.orderIndex - b.orderIndex || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
}

function buildTags(tagUsage: ReadonlyMap<string, number>, allTags: readonly Tag[]): ExportTag[] {
  const byName = new Map(allTags.map((tag) => [tag.name, tag]));
  return [...tagUsage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, count]) => {
      const tag = byName.get(name);
      return tag ? [{ _id: tag.id, title: tag.name, count }] : [];
    });
}

/** Chunked serialization: one `JSON.stringify` per 500 records, no giant string. */
function serialize(
  items: readonly ExportItem[],
  collections: readonly ExportCollection[],
  tags: readonly ExportTag[],
  meta: ExportFileMeta,
): Blob {
  const parts: string[] = [];
  const header = {
    result: true,
    version: meta.version,
    exportedAt: meta.exportedAt,
    resourceCount: meta.resourceCount,
    truncated: meta.truncated,
  };
  parts.push(JSON.stringify(header).slice(0, -1));
  parts.push(`,"collections":${JSON.stringify(collections)}`);
  parts.push(`,"tags":${JSON.stringify(tags)}`);
  parts.push(`,"items":[`);

  let first = true;
  for (let index = 0; index < items.length; index += EXPORT_CHUNK_SIZE) {
    const chunk = items.slice(index, index + EXPORT_CHUNK_SIZE);
    // `JSON.stringify` of the chunk, minus its brackets.
    const body = JSON.stringify(chunk).slice(1, -1);
    if (body.length > 0) parts.push(first ? body : `,${body}`);
    first = false;
  }
  parts.push(`]}`);

  return new Blob(parts, { type: "application/json" });
}

export async function exportJson(
  database: FluidDeckDatabase,
  scope: ExportScope,
  options: { now?: number } = {},
): Promise<JsonExport> {
  const resources = await selectResources(database, scope);
  const relations = await readRelations(database, resources);
  const allCollections = await database.collections.toArray();
  const allTags = await database.tags.toArray();

  const referencedCollections = new Set<string>();
  for (const ids of relations.collectionIds.values()) {
    for (const id of ids) referencedCollections.add(id);
  }
  const collections: ExportCollection[] = collectCollections(
    allCollections,
    referencedCollections,
  ).map((collection) => ({
    _id: collection.id,
    title: collection.name,
    parent: collection.parentId === null ? null : { $id: collection.parentId },
    sort: collection.orderIndex,
  }));

  const meta: ExportFileMeta = {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(options.now ?? Date.now()).toISOString(),
    resourceCount: resources.length,
    truncated: scope.kind !== "all",
  };

  const items: ExportItem[] = resources.map((resource) => {
    const collectionIds = relations.collectionIds.get(resource.id) ?? [];
    const primaryCollection = collectionIds[0];
    return {
      _id: resource.id,
      link: resource.url,
      title: resource.title,
      description: resource.description,
      note: resource.notes,
      cover: resource.thumbnailUrl,
      faviconUrl: resource.faviconUrl,
      canonicalUrl: resource.canonicalUrl,
      domain: resource.domain,
      type: resource.type,
      source: resource.source,
      extractionStatus: resource.extractionStatus,
      extractionNotes: resource.extractionNotes,
      created: new Date(resource.createdAt).toISOString(),
      lastUpdate: new Date(resource.updatedAt).toISOString(),
      lastOpenedAt:
        resource.lastOpenedAt === null ? null : new Date(resource.lastOpenedAt).toISOString(),
      collectionIds,
      collection: primaryCollection === undefined ? null : { $id: primaryCollection },
      tags: relations.tagNames.get(resource.id) ?? [],
    };
  });

  return {
    blob: serialize(items, collections, buildTags(relations.tagUsage, allTags), meta),
    filename: `fluid-deck-export-${meta.exportedAt.slice(0, 10)}.json`,
    meta,
  };
}

/** Chrome/Firefox safe download: object URL + anchor click + deferred revoke. */
export function downloadExport(exported: JsonExport): void {
  const url = URL.createObjectURL(exported.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  anchor.click();
  // Deferred: an immediate revoke can kill the download on slower browsers.
  setTimeout(() => URL.revokeObjectURL(url), EXPORT_REVOKE_DELAY_MS);
}
