/**
 * IMPORT-002 — Raindrop.io JSON export parser.
 *
 * Parses a Raindrop export (object with `items`/`collections`/`tags`, or a bare
 * item array) into validated Fluid Deck resource inputs plus collection, tag and
 * membership information. No persistence: IMPORT-003/004 validate and commit.
 *
 * Field mapping (approved plan + real export aliases, nothing invented):
 *   link/url            -> url
 *   title               -> title ("" when missing)
 *   description+excerpt -> description (joined, de-duplicated)
 *   note                -> notes
 *   image/cover         -> thumbnailUrl (http(s) only)
 *   ext/type            -> type (exact RESOURCE_TYPES match, else "other")
 *   created_at/created  -> createdAt (epoch ms, extra field for the committer)
 *   collection.$id / collectionId -> collectionSourceIds (membership)
 *   tags[]              -> per-resource tags
 *   collections[]       -> ParsedRaindropCollection (parent kept as source id)
 *   tags[] (top level)  -> ParsedRaindropTag.usageCount (count, else derived)
 *
 * source is always "import"; faviconUrl is empty (not an exported field).
 */
import { z } from "zod";
import {
  canonicalizeUrl,
  RESOURCE_TYPES,
  resourceInputSchema,
  type ResourceType,
} from "@fluid-deck/core";

/** Stable, user-facing failure for structurally unusable export files. */
export class RaindropParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RaindropParseError";
  }
}

export interface ParsedRaindropCollection {
  /** Raindrop `_id`, stringified; parents reference this value. */
  sourceId: string;
  name: string;
  parentSourceId: string | null;
  orderIndex: number;
}

export interface ParsedRaindropTag {
  name: string;
  usageCount: number;
}

export type ParsedRaindropResource = z.output<typeof resourceInputSchema> & {
  /** Raindrop `created_at`/`created`, epoch ms. Absent when missing/invalid. */
  createdAt?: number;
  collectionSourceIds: string[];
  tags: string[];
};

export interface SkippedRaindropRecord {
  kind: "resource" | "collection" | "tag";
  index: number;
  reason: string;
  link?: string;
}

export interface RaindropParseResult {
  resources: ParsedRaindropResource[];
  collections: ParsedRaindropCollection[];
  tags: ParsedRaindropTag[];
  skipped: SkippedRaindropRecord[];
}

const optString = z.string().optional().catch(undefined);
const optTimestamp = z.union([z.string(), z.number()]).optional().catch(undefined);
const optUnknownArray = z.array(z.unknown()).optional().catch(undefined);
const optImage = z
  .union([z.string(), z.object({ src: z.string() }).passthrough()])
  .optional()
  .catch(undefined);
const optCollection = z
  .union([
    z.string(),
    z.number(),
    z.object({ $id: z.union([z.string(), z.number()]) }).passthrough(),
  ])
  .optional()
  .catch(undefined);
const optId = z.union([z.string(), z.number()]).optional().catch(undefined);

const envelopeSchema = z.union([
  z
    .object({
      items: z.array(z.unknown()),
      collections: z.unknown().optional(),
      tags: z.unknown().optional(),
    })
    .passthrough(),
  z.array(z.unknown()),
]);

const itemSchema = z
  .object({
    link: optString,
    url: optString,
    title: optString,
    description: optString,
    excerpt: optString,
    note: optString,
    image: optImage,
    cover: optImage,
    ext: optString,
    type: optString,
    created: optTimestamp,
    created_at: optTimestamp,
    tags: optUnknownArray,
    collection: optCollection,
    collectionId: optId,
  })
  .passthrough();

const collectionSchema = z
  .object({
    _id: optId,
    id: optId,
    title: optString,
    name: optString,
    parent: optCollection,
    parentId: optId,
    sort: z.number().optional().catch(undefined),
  })
  .passthrough();

function readId(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record["$id"] ?? record.id;
    if (typeof nested === "string" || typeof nested === "number") return String(nested);
  }
  return undefined;
}

function readTagName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = record.tag ?? record.name;
    if (typeof name === "string") return name.trim() || undefined;
  }
  return undefined;
}

function readImageUrl(value: z.output<typeof optImage>): string {
  const raw =
    typeof value === "string" ? value : value && typeof value === "object" ? value.src : undefined;
  return typeof raw === "string" && /^https?:\/\//i.test(raw.trim()) ? raw.trim() : "";
}

/** Shortcut: bare numbers below 1e12 are epoch seconds, otherwise milliseconds. */
function toEpochMs(value: z.output<typeof optTimestamp>): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value < 1e12 ? value * 1000 : value) : undefined;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toResourceType(ext: string | undefined, type: string | undefined): ResourceType {
  const candidate = (ext ?? type ?? "").trim().toLowerCase();
  return (RESOURCE_TYPES as readonly string[]).includes(candidate)
    ? (candidate as ResourceType)
    : "other";
}

function normalizedKey(name: string): string {
  return name.trim().toLowerCase();
}

function uniqueNames(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const key = normalizedKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(value.trim());
  }
  return names;
}

function parseTopLevelTags(
  rawTags: readonly unknown[],
  derivedTags: ReadonlyMap<string, { name: string; count: number }>,
  skipped: SkippedRaindropRecord[],
): ParsedRaindropTag[] {
  const seen = new Set<string>();
  const tags: ParsedRaindropTag[] = [];
  rawTags.forEach((raw, index) => {
    const name = readTagName(raw);
    if (!name) {
      skipped.push({ kind: "tag", index, reason: "tag has no usable name" });
      return;
    }
    const key = normalizedKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
    const supplied = record?.count;
    tags.push({
      name,
      usageCount:
        typeof supplied === "number" && Number.isFinite(supplied)
          ? Math.max(0, Math.trunc(supplied))
          : (derivedTags.get(key)?.count ?? 0),
    });
  });
  // Resource tags missing from the top-level list are still preserved.
  for (const [key, value] of derivedTags) {
    if (!seen.has(key)) tags.push({ name: value.name, usageCount: value.count });
  }
  return tags;
}

/**
 * Parses an already-decoded Raindrop export payload (IMPORT-003 guards depth,
 * prototype keys and record counts before calling this).
 */
export function parseRaindropPayload(payload: unknown): RaindropParseResult {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) {
    throw new RaindropParseError("Unsupported Raindrop export: expected an items array");
  }

  const data = envelope.data;
  const rawItems = Array.isArray(data) ? data : data.items;
  const structured = Array.isArray(data) ? undefined : data;
  const rawCollections =
    structured && Array.isArray(structured.collections) ? structured.collections : [];
  const rawTags = structured && Array.isArray(structured.tags) ? structured.tags : [];

  const skipped: SkippedRaindropRecord[] = [];
  const resources: ParsedRaindropResource[] = [];
  const collections: ParsedRaindropCollection[] = [];
  const derivedTags = new Map<string, { name: string; count: number }>();
  const seenCanonicalUrls = new Set<string>();

  rawCollections.forEach((raw, index) => {
    const parsed = collectionSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ kind: "collection", index, reason: "collection is not an object" });
      return;
    }
    const sourceId = readId(parsed.data._id ?? parsed.data.id);
    const name = (parsed.data.title ?? parsed.data.name)?.trim();
    if (!sourceId || !name) {
      skipped.push({ kind: "collection", index, reason: "collection needs an id and a name" });
      return;
    }
    const parentSourceId = readId(parsed.data.parent ?? parsed.data.parentId) ?? null;
    const orderIndex = typeof parsed.data.sort === "number" ? parsed.data.sort : index;
    collections.push({ sourceId, name, parentSourceId, orderIndex });
  });

  rawItems.forEach((raw, index) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ kind: "resource", index, reason: "item is not an object" });
      return;
    }
    const item = parsed.data;
    const link = (item.link ?? item.url)?.trim();
    if (!link) {
      skipped.push({ kind: "resource", index, reason: "item has no link" });
      return;
    }

    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeUrl(link);
    } catch {
      skipped.push({ kind: "resource", index, reason: "item link is not an http(s) URL", link });
      return;
    }
    if (seenCanonicalUrls.has(canonicalUrl)) {
      skipped.push({ kind: "resource", index, reason: "duplicate canonical URL", link });
      return;
    }
    seenCanonicalUrls.add(canonicalUrl);

    const tags = uniqueNames((item.tags ?? []).map(readTagName));
    for (const tag of tags) {
      const key = normalizedKey(tag);
      const existing = derivedTags.get(key);
      if (existing) existing.count += 1;
      else derivedTags.set(key, { name: tag, count: 1 });
    }

    const description = uniqueNames([item.description, item.excerpt]).join("\n\n");
    const createdAt = toEpochMs(item.created_at ?? item.created);

    const core = resourceInputSchema.safeParse({
      url: link,
      title: item.title ?? "",
      description,
      thumbnailUrl: readImageUrl(item.image) || readImageUrl(item.cover),
      faviconUrl: "",
      type: toResourceType(item.ext, item.type),
      source: "import",
      notes: item.note ?? "",
      extractionStatus: "complete",
      extractionNotes: [],
    });
    if (!core.success) {
      skipped.push({
        kind: "resource",
        index,
        reason: "item does not fit the resource schema",
        link,
      });
      return;
    }

    const collectionSourceIds = uniqueNames([
      readId(item.collection),
      item.collectionId === undefined ? undefined : String(item.collectionId),
    ]);

    resources.push({
      ...core.data,
      ...(createdAt === undefined ? {} : { createdAt }),
      collectionSourceIds,
      tags,
    });
  });

  return {
    resources,
    collections,
    tags: parseTopLevelTags(rawTags, derivedTags, skipped),
    skipped,
  };
}

/**
 * Parses a Raindrop export. Invalid individual records are skipped and reported
 * in `skipped`; only a structurally unusable file throws `RaindropParseError`.
 */
export function parseRaindropJson(json: string): RaindropParseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new RaindropParseError("Invalid Raindrop JSON: file is not valid JSON");
  }
  return parseRaindropPayload(payload);
}
