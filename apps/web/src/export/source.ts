/**
 * IMPORT-007 - shared export source: scope selection, join-table relations,
 * collection tree and the download hand-off. JSON/HTML/Markdown/CSV all read the
 * same snapshot so their scope and soft-delete semantics cannot drift.
 *
 * `filter` mirrors the browse chain in `services/library.ts` without its 500-card
 * grid cap: "Current Filter" must export every match, not the first screen.
 */
import type { Collection, Resource, ViewState } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listCollectionMembers, listTaggedResources } from "../repositories/relationships.ts";
import { listResources } from "../repositories/resources.ts";
import { viewDateBounds } from "../services/library.ts";

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

/** What every format hands to `downloadExport`. */
export interface ExportFile {
  blob: Blob;
  filename: string;
  meta: ExportFileMeta;
}

export interface ExportTag {
  id: string;
  name: string;
  count: number;
}

export interface ExportSource {
  resources: Resource[];
  /** Referenced collections plus their ancestors, tree order. */
  collections: Collection[];
  /** Every membership per exported resource, sorted. */
  collectionIds: Map<string, string[]>;
  tagNames: Map<string, string[]>;
  tags: ExportTag[];
  meta: ExportFileMeta;
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
): Promise<Pick<ExportSource, "collectionIds" | "tagNames" | "tags">> {
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

  const usage = new Map<string, number>();
  for (const names of tagNames.values()) {
    for (const name of names) usage.set(name, (usage.get(name) ?? 0) + 1);
  }
  const byName = new Map([...tagById.values()].map((tag) => [tag.name, tag]));
  const tags = [...usage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, count]) => {
      const tag = byName.get(name);
      return tag ? [{ id: tag.id, name: tag.name, count }] : [];
    });
  return { collectionIds, tagNames, tags };
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

export function exportMeta(
  scope: ExportScope,
  resourceCount: number,
  version: number,
  now: number,
): ExportFileMeta {
  return {
    version,
    exportedAt: new Date(now).toISOString(),
    resourceCount,
    truncated: scope.kind !== "all",
  };
}

export function exportFilename(meta: ExportFileMeta, extension: string): string {
  return `fluid-deck-export-${meta.exportedAt.slice(0, 10)}.${extension}`;
}

export async function loadExportSource(
  database: FluidDeckDatabase,
  scope: ExportScope,
  options: { now?: number; version: number },
): Promise<ExportSource> {
  const resources = await selectResources(database, scope);
  const { collectionIds, tagNames, tags } = await readRelations(database, resources);

  const referenced = new Set<string>();
  for (const ids of collectionIds.values()) {
    for (const id of ids) referenced.add(id);
  }
  const collections = collectCollections(await database.collections.toArray(), referenced);

  return {
    resources,
    collections,
    collectionIds,
    tagNames,
    tags,
    meta: exportMeta(scope, resources.length, options.version, options.now ?? Date.now()),
  };
}

/** Chrome/Firefox safe download: object URL + anchor click + deferred revoke. */
export function downloadExport(file: Pick<ExportFile, "blob" | "filename">): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  // Deferred: an immediate revoke can kill the download on slower browsers.
  setTimeout(() => URL.revokeObjectURL(url), EXPORT_REVOKE_DELAY_MS);
}
