/**
 * UI-001/UI-002 - thin library service over the Sprint 2 repositories.
 * Features never import repositories directly (Phase 2.5 dependency rules):
 * UI -> hooks -> this service -> repositories -> Dexie.
 *
 * Keyword search (`q`) is deliberately NOT implemented here: it belongs to
 * SEARCH-002 / UI-004 (M7). Browse filters (type, collection, tags, date,
 * source, sort) come from the URL ViewState (FR-SRH-003).
 */
import type { Resource, ViewState } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listResources, listTrashedResources } from "../repositories/resources.ts";
import { listCollectionMembers, listTaggedResources } from "../repositories/relationships.ts";

/** UI-002 acceptance: grid never renders more than this many cards. */
export const RESOURCE_GRID_CAP = 500;
/** UI-002 acceptance: windowed rendering starts with this many cards. */
export const GRID_WINDOW_SIZE = 50;

/** Pure windowing helper: the slice of `resources` rendered at `visibleCount`. */
export function windowedResources<T>(resources: readonly T[], visibleCount: number): T[] {
  return resources.slice(0, Math.max(0, Math.min(visibleCount, RESOURCE_GRID_CAP)));
}

export function nextWindowSize(visibleCount: number): number {
  return Math.min(visibleCount + GRID_WINDOW_SIZE, RESOURCE_GRID_CAP);
}

/**
 * ViewState date preset / custom range -> epoch bounds. Shared with the
 * search service so browse and search cannot disagree on what "this week" means.
 * Presets are open-ended above (original browse behaviour).
 */
export function viewDateBounds(date: ViewState["date"]): { from: number; to: number } | null {
  if (!date) return null;
  if (date.startsWith("custom:")) {
    const [, from, to] = date.split(":");
    return { from: Number(from), to: Number(to) };
  }
  const day = 24 * 60 * 60 * 1000;
  const days = date === "week" ? 7 : date === "month" ? 30 : 365;
  return { from: Date.now() - days * day, to: Number.POSITIVE_INFINITY };
}

function matchesDate(resource: Resource, date: ViewState["date"]): boolean {
  const bounds = viewDateBounds(date);
  if (!bounds) return true;
  return resource.createdAt >= bounds.from && resource.createdAt <= bounds.to;
}

function sortResources(resources: Resource[], sort: ViewState["sort"]): Resource[] {
  const sorted = [...resources];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    case "title-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    case "title-desc":
      return sorted.sort((a, b) => b.title.localeCompare(a.title) || a.id.localeCompare(b.id));
    case "recently-opened":
      return sorted.sort(
        (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt,
      );
    case "newest":
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }
}

/**
 * Browse query for the grid. Collection + tag filters intersect (AND);
 * multiple tags OR together, matching FR-SRH-002 tag semantics.
 * `most-tagged` sort needs per-resource tag counts from the join store.
 */
export async function getLibraryResources(
  database: FluidDeckDatabase,
  view: ViewState,
  options: { trash?: boolean } = {},
): Promise<Resource[]> {
  let resources = options.trash
    ? await listTrashedResources(database)
    : await listResources(database);

  if (view.type) resources = resources.filter((r) => r.type === view.type);
  if (view.source) resources = resources.filter((r) => r.source === view.source);
  if (view.date) resources = resources.filter((r) => matchesDate(r, view.date));
  if (view.domain) resources = resources.filter((r) => r.domain === view.domain);

  if (view.unorganized) {
    const organized = new Set(
      (await database.resourceCollections.toArray()).map((join) => join.resourceId),
    );
    resources = resources.filter((r) => !organized.has(r.id));
  }

  if (view.collection) {
    const memberIds = new Set(
      (
        await listCollectionMembers(database, view.collection, { includeDeleted: options.trash })
      ).map((r) => r.id),
    );
    resources = resources.filter((r) => memberIds.has(r.id));
  }

  if (view.tags.length > 0) {
    // Tags are stored as names in ViewState; resolve via the tags store.
    const allTags = await database.tags.toArray();
    const byName = new Map(allTags.map((t) => [t.normalizedName, t.id]));
    const tagIds = view.tags
      .map((name) => byName.get(name.normalize("NFC").trim().toLowerCase()))
      .filter((id): id is string => Boolean(id));
    if (tagIds.length === 0) return [];
    const tagged = new Set<string>();
    for (const tagId of tagIds) {
      for (const r of await listTaggedResources(database, tagId, {
        includeDeleted: options.trash,
      })) {
        tagged.add(r.id);
      }
    }
    resources = resources.filter((r) => tagged.has(r.id));
  }

  if (view.sort === "most-tagged") {
    const counts = new Map<string, number>();
    for (const join of await database.resourceTags.toArray()) {
      counts.set(join.resourceId, (counts.get(join.resourceId) ?? 0) + 1);
    }
    resources.sort(
      (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.createdAt - a.createdAt,
    );
  } else {
    resources = sortResources(resources, view.sort);
  }

  return resources.slice(0, RESOURCE_GRID_CAP);
}
