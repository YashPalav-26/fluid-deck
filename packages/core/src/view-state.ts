/**
 * DB-008 — `ViewState` is transient filter/sort state that lives in the URL
 * (FR-SRH-003, Phase 2.2 D3). There is no ViewState store.
 */
import { z } from "zod";
import { MAX_DOMAIN_LENGTH, RESOURCE_SOURCES, RESOURCE_TYPES } from "./constants.ts";
import { uuidSchema } from "./schemas.ts";

export const VIEW_SORT_OPTIONS = [
  "newest",
  "oldest",
  "title-asc",
  "title-desc",
  "most-tagged",
  "recently-opened",
  /** UI-004: search-result ranking. Meaningless without a query; browse falls back to newest. */
  "relevance",
] as const;
export type ViewSort = (typeof VIEW_SORT_OPTIONS)[number];

export const DATE_RANGE_PRESETS = ["week", "month", "year"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

/** `custom:<startEpochMs>:<endEpochMs>` */
export const customDateRangeSchema = z
  .string()
  .regex(/^custom:\d+:\d+$/, { message: "Expected custom:<start>:<end>" });

export const dateRangeSchema = z.union([z.enum(DATE_RANGE_PRESETS), customDateRangeSchema]);
export type DateRange = z.infer<typeof dateRangeSchema>;

export const viewStateSchema = z.object({
  q: z.string().max(500).default(""),
  type: z.enum(RESOURCE_TYPES).optional(),
  collection: uuidSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(200)).default([]),
  date: dateRangeSchema.optional(),
  source: z.enum(RESOURCE_SOURCES).optional(),
  /** UI-004: Domain facet. Additive + optional, so pre-UI-004 URLs still parse. */
  domain: z.string().trim().min(1).max(MAX_DOMAIN_LENGTH).toLowerCase().optional(),
  /** UI-004: Unorganized facet (resources with no collection membership). */
  unorganized: z.boolean().default(false),
  hasCode: z.boolean().default(false),
  hasImage: z.boolean().default(false),
  sort: z.enum(VIEW_SORT_OPTIONS).default("newest"),
});

export type ViewState = z.infer<typeof viewStateSchema>;

export const EMPTY_VIEW_STATE: ViewState = viewStateSchema.parse({});

function readEnum<T extends string>(params: URLSearchParams, key: string, values: readonly T[]) {
  const raw = params.get(key);
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/**
 * Serializes view state to a query string. Defaults and empty values are omitted so
 * equivalent views produce identical URLs (stable deep links).
 */
export function encodeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.type) params.set("type", state.type);
  if (state.collection) params.set("collection", state.collection);
  if (state.tags.length > 0) params.set("tags", state.tags.join(","));
  if (state.date) params.set("date", state.date);
  if (state.source) params.set("source", state.source);
  if (state.domain) params.set("domain", state.domain);
  if (state.unorganized) params.set("unorganized", "true");
  if (state.hasCode) params.set("has_code", "true");
  if (state.hasImage) params.set("has_image", "true");
  if (state.sort !== "newest") params.set("sort", state.sort);
  return params.toString();
}

/**
 * Parses a query string into view state. Never throws: unknown values are dropped
 * and defaults fill the gaps, so a hand-edited or stale URL still renders.
 */
export function decodeViewState(query: string): ViewState {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const tags = (params.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 200);

  const date = params.get("date");
  const dateParsed = date === null ? undefined : dateRangeSchema.safeParse(date).data;
  const collection = params.get("collection");
  const domain = (params.get("domain") ?? "").trim().slice(0, MAX_DOMAIN_LENGTH).toLowerCase();

  return {
    q: (params.get("q") ?? "").slice(0, 500),
    type: readEnum(params, "type", RESOURCE_TYPES),
    collection:
      collection !== null && uuidSchema.safeParse(collection).success ? collection : undefined,
    tags,
    date: dateParsed,
    source: readEnum(params, "source", RESOURCE_SOURCES),
    domain: domain === "" ? undefined : domain,
    unorganized: params.get("unorganized") === "true",
    hasCode: params.get("has_code") === "true",
    hasImage: params.get("has_image") === "true",
    sort: readEnum(params, "sort", VIEW_SORT_OPTIONS) ?? "newest",
  };
}
