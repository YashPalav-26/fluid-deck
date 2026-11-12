/**
 * IMPORT-005 - import preview (read-only) and the conflict data the resolution
 * UI needs. `previewImport` never writes; the commit re-checks every conflict
 * inside its batch transaction, so a preview that went stale between dialog and
 * commit cannot create a duplicate or apply the wrong row.
 */
import { canonicalizeUrl } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { normalizeTagName } from "../repositories/tags.ts";
import type { ImportWarning, ValidatedImport } from "./validate.ts";

export type ImportConflictResolution = "skip" | "update" | "add-to-collections";

/** Decisions keyed by canonical URL (the approved conflict identity). */
export type ImportResolutionMap = ReadonlyMap<string, ImportConflictResolution>;

export interface ImportConflict {
  /** Canonical URL — the key the resolution map is written against. */
  canonicalUrl: string;
  resourceIndex: number;
  incoming: { url: string; title: string };
  existing: { id: string; url: string; title: string; updatedAt: number };
}

export interface ImportPreviewCounts {
  /** Validated rows in the file (internal duplicates already removed). */
  resources: number;
  newResources: number;
  duplicates: number;
  collections: number;
  /** Unique tag identities across the file and its per-resource tags. */
  tags: number;
  /** Records and fields dropped during validation; the reasons are in `warnings`. */
  skipped: number;
}

export interface ImportPreview {
  format: ValidatedImport["format"];
  counts: ImportPreviewCounts;
  conflicts: ImportConflict[];
  /** Per imported collection, in source order. */
  collectionCounts: Array<{ name: string; count: number }>;
  warnings: ImportWarning[];
}

function uniqueTags(validated: ValidatedImport): Set<string> {
  const names = new Set<string>();
  for (const tag of validated.tags) names.add(tag.normalizedName);
  for (const resource of validated.resources) {
    for (const tag of resource.meta.tags) {
      const normalized = normalizeTagName(tag);
      if (normalized) names.add(normalized);
    }
  }
  return names;
}

export async function previewImport(
  database: FluidDeckDatabase,
  validated: ValidatedImport,
): Promise<ImportPreview> {
  const canonicalByIndex = validated.resources.map((resource) =>
    canonicalizeUrl(resource.input.url),
  );
  const wanted = [...new Set(canonicalByIndex)];

  // One indexed read; nothing is written and soft-deleted rows count as conflicts
  // because the unique index covers them.
  const existingRows =
    wanted.length === 0
      ? []
      : await database.resources.where("canonicalUrl").anyOf(wanted).toArray();
  const byCanonical = new Map(existingRows.map((row) => [row.canonicalUrl, row]));

  const conflicts: ImportConflict[] = [];
  canonicalByIndex.forEach((canonicalUrl, resourceIndex) => {
    const existing = byCanonical.get(canonicalUrl);
    const resource = validated.resources[resourceIndex];
    if (!existing || !resource) return;
    conflicts.push({
      canonicalUrl,
      resourceIndex,
      incoming: { url: resource.input.url, title: resource.input.title },
      existing: {
        id: existing.id,
        url: existing.url,
        title: existing.title,
        updatedAt: existing.updatedAt,
      },
    });
  });

  const memberships = new Map<string, number>();
  for (const resource of validated.resources) {
    for (const sourceId of resource.meta.collectionSourceIds) {
      memberships.set(sourceId, (memberships.get(sourceId) ?? 0) + 1);
    }
  }
  const collectionCounts = validated.collections.map((collection) => ({
    name: collection.name,
    count: collection.sourceId === null ? 0 : (memberships.get(collection.sourceId) ?? 0),
  }));

  return {
    format: validated.format,
    counts: {
      resources: validated.resources.length,
      newResources: validated.resources.length - conflicts.length,
      duplicates: conflicts.length,
      collections: validated.collections.length,
      tags: uniqueTags(validated).size,
      skipped: validated.warnings.length,
    },
    conflicts,
    collectionCounts,
    warnings: validated.warnings,
  };
}
