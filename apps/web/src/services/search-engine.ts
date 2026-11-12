/**
 * Shared MiniSearch engine (SEARCH-002/008). Kept free of Dexie and browser
 * APIs so the same implementation runs on the main thread and in a module
 * worker. MiniSearch's concrete API does not leak past this module.
 */
import MiniSearch from "minisearch";
import { tokenize, SEARCH_FIELD_WEIGHTS } from "@fluid-deck/core";
import type { Resource } from "@fluid-deck/core";

export const SEARCH_FIELDS = [
  "title",
  "tagsText",
  "description",
  "urlText",
  "collectionsText",
  "typeText",
] as const;

export const SEARCH_STORE_FIELDS = ["title", "tagsText", "description", "urlText"] as const;

export interface SearchDocument {
  id: string;
  title: string;
  tagsText: string;
  description: string;
  urlText: string;
  collectionsText: string;
  typeText: string;
  updatedAt: number;
}

export interface SearchContext {
  tagNamesByResourceId?: Map<string, string[]>;
  collectionNamesByResourceId?: Map<string, string[]>;
}

export interface SearchDocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export function buildSearchDocument(
  resource: Resource,
  context: SearchContext = {},
): SearchDocument {
  const tagNames = context.tagNamesByResourceId?.get(resource.id) ?? [];
  const collectionNames = context.collectionNamesByResourceId?.get(resource.id) ?? [];
  return {
    id: resource.id,
    title: resource.title,
    tagsText: tagNames.join(" "),
    description: resource.description,
    urlText: `${resource.canonicalUrl} ${resource.domain}`,
    collectionsText: collectionNames.join(" "),
    typeText: resource.type,
    updatedAt: resource.updatedAt,
  };
}

export function createMiniSearch(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    fields: [...SEARCH_FIELDS],
    idField: "id",
    storeFields: [...SEARCH_STORE_FIELDS],
    tokenize: (text: string) => tokenize(text),
    searchOptions: {
      boost: { ...SEARCH_FIELD_WEIGHTS },
      prefix: true,
      fuzzy: 0.2,
    },
  });
}

export interface RankedSearchHit {
  id: string;
  score: number;
  matchedTerms: string[];
}

export interface RankedSearchResult {
  hits: RankedSearchHit[];
  partial: boolean;
  total: number;
}

/**
 * MiniSearch query + approved ranking rules. The caller owns the metadata
 * lookup so the main thread can use Resource objects and the worker its
 * compact document metadata without cloning Resources.
 */
export function queryMiniSearch(
  mini: MiniSearch<SearchDocument>,
  query: string,
  metaById: ReadonlyMap<string, SearchDocumentMeta>,
  limit: number,
): RankedSearchResult {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { hits: [], partial: false, total: 0 };

  const normalizedQuery = trimmed.normalize("NFC").toLowerCase();

  let results = mini.search(trimmed, { combineWith: "AND", prefix: true, fuzzy: 0.2 });
  let partial = false;
  if (results.length === 0) {
    results = mini.search(trimmed, { combineWith: "OR", prefix: true, fuzzy: 0.2 });
    partial = results.length > 0;
  }

  const sorted = [...results].sort((a, b) => {
    const ra = metaById.get(String(a.id));
    const rb = metaById.get(String(b.id));
    const aExact = (ra?.title ?? "").normalize("NFC").toLowerCase().trim() === normalizedQuery;
    const bExact = (rb?.title ?? "").normalize("NFC").toLowerCase().trim() === normalizedQuery;
    if (aExact !== bExact) return aExact ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    const ua = ra?.updatedAt ?? 0;
    const ub = rb?.updatedAt ?? 0;
    if (ub !== ua) return ub - ua;
    const ta = ra?.title ?? "";
    const tb = rb?.title ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ida = String(a.id);
    const idb = String(b.id);
    return ida < idb ? -1 : ida > idb ? 1 : 0;
  });

  return {
    hits: sorted.slice(0, limit).map((result) => ({
      id: String(result.id),
      score: result.score,
      matchedTerms: result.terms,
    })),
    partial,
    total: sorted.length,
  };
}
