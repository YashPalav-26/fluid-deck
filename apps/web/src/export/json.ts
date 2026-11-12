/**
 * IMPORT-006 - streaming JSON export.
 *
 * Serializes the shared export snapshot (`export/source.ts`) in 500-record chunks:
 * one `JSON.stringify` per chunk, concatenated into Blob parts, so the whole library
 * is never one giant string.
 *
 * Shape: Raindrop-compatible envelope (`result`/`items`/`collections`/`tags`) so the
 * IMPORT-002 parser can read a file we wrote, extended with the fields Raindrop has no
 * name for. A resource in several collections keeps every membership in
 * `collectionIds`; `collection` mirrors the first one for import compatibility.
 */
import type { Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import type { ExportFile, ExportScope, ExportSource } from "./source.ts";
import { exportFilename, loadExportSource } from "./source.ts";

export const EXPORT_FORMAT_VERSION = 1;
/** Approved block size: one serialized chunk per 500 records. */
export const EXPORT_CHUNK_SIZE = 500;

export type JsonExport = ExportFile;

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

function toItem(resource: Resource, source: ExportSource): ExportItem {
  const collectionIds = source.collectionIds.get(resource.id) ?? [];
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
    tags: source.tagNames.get(resource.id) ?? [],
  };
}

/** Chunked serialization: one `JSON.stringify` per 500 records, no giant string. */
function serialize(
  items: readonly ExportItem[],
  source: ExportSource,
  meta: ExportSource["meta"],
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
  parts.push(
    `,"collections":${JSON.stringify(
      source.collections.map((collection) => ({
        _id: collection.id,
        title: collection.name,
        parent: collection.parentId === null ? null : { $id: collection.parentId },
        sort: collection.orderIndex,
      })),
    )}`,
  );
  parts.push(
    `,"tags":${JSON.stringify(
      source.tags.map((tag) => ({ _id: tag.id, title: tag.name, count: tag.count })),
    )}`,
  );
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
  const source = await loadExportSource(database, scope, {
    now: options.now,
    version: EXPORT_FORMAT_VERSION,
  });
  const items = source.resources.map((resource) => toItem(resource, source));

  return {
    blob: serialize(items, source, source.meta),
    filename: exportFilename(source.meta, "json"),
    meta: source.meta,
  };
}
