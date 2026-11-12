/**
 * IMPORT-003 — validation, sanitization and input caps at the import boundary.
 *
 * Pipeline: size/count guard -> sanitize (HTML only, DOMPurify) -> existing
 * parser -> per-record strict validation. No persistence: the result carries
 * persistence-ready `ResourceInput` values plus import-only metadata separately,
 * so nothing extra ever reaches the strict core schema or `createResource`.
 *
 * Policy sources (no invented limits):
 *   - file size 50 MB HTML / 20 MB JSON, record cap 100k, JSON depth 20
 *     (SECURITY_AND_PRIVACY_ARCHITECTURE §7; SPRINT_7_READINESS_REVIEW condition 6)
 *   - field lengths MAX_TEXT_LENGTH / MAX_NAME_LENGTH (packages/core constants)
 *   - collection depth warns at COLLECTION_WARNING_DEPTH, never blocks (U2)
 *   - HTML: DOMPurify before parsing (PRD NFR-SEC-002 / §15.3)
 *   - JSON: Zod validation only (PRD NFR-SEC-002); text is never rendered as HTML
 */
import DOMPurify from "dompurify";
import type { z } from "zod";
import {
  canonicalizeUrl,
  COLLECTION_WARNING_DEPTH,
  collectionInputSchema,
  MAX_NAME_LENGTH,
  RESOURCE_TYPES,
  resourceInputSchema,
  tagSchema,
  type ResourceType,
} from "@fluid-deck/core";
import { displayTagName, normalizeTagName } from "../repositories/tags.ts";
import { parseHtmlBookmarks } from "./parser.ts";
import {
  parseRaindropPayload,
  RaindropParseError,
  type ParsedRaindropResource,
  type SkippedRaindropRecord,
} from "./raindrop.ts";

export type ImportFormat = "html" | "raindrop";

/** Approved caps. `maxJsonDepth` is 0 for HTML because depth is a JSON concern. */
export const IMPORT_LIMITS = {
  html: { maxBytes: 50 * 1024 * 1024, maxRecords: 100_000, maxJsonDepth: 0 },
  raindrop: { maxBytes: 20 * 1024 * 1024, maxRecords: 100_000, maxJsonDepth: 20 },
} as const;

export type ImportValidationErrorCode =
  "file_too_large" | "too_many_records" | "invalid_json" | "json_too_deep" | "unsupported_export";

/** File-level failure. Record-level problems are warnings, never throws. */
export class ImportValidationError extends Error {
  readonly code: ImportValidationErrorCode;

  constructor(code: ImportValidationErrorCode, message: string) {
    super(message);
    this.name = "ImportValidationError";
    this.code = code;
  }
}

export interface ImportWarning {
  kind: "resource" | "collection" | "tag";
  index?: number;
  reason: string;
}

/** Import-only data kept beside the resource, never inside it. */
export interface ImportResourceMeta {
  createdAt?: number;
  collectionSourceIds: string[];
  tags: string[];
}

export interface ValidatedImportResource {
  /** Output of the strict core schema: safe to pass to `createResource`. */
  input: z.output<typeof resourceInputSchema>;
  meta: ImportResourceMeta;
}

export interface ValidatedImportCollection {
  name: string;
  /** Source collection id; null for flat HTML folders. Needed to map memberships. */
  sourceId: string | null;
  /** Source parent id; null for top level. */
  parentSourceId: string | null;
  orderIndex: number;
}

export interface ValidatedImportTag {
  name: string;
  normalizedName: string;
  usageCount: number;
}

/** The validated import contract consumed by IMPORT-004/005. */
export interface ValidatedImport {
  format: ImportFormat;
  resources: ValidatedImportResource[];
  collections: ValidatedImportCollection[];
  tags: ValidatedImportTag[];
  warnings: ImportWarning[];
}

const importNameSchema = collectionInputSchema.shape.name;
const importUsageSchema = tagSchema.shape.usageCount;

/** Netscape needs only structural tags; everything script-bearing is dropped. */
const BOOKMARK_HTML_TAGS = ["a", "p", "h1", "h3", "dl", "dt", "dd", "title"];

/** DOMPurify with an allowlist, so unknown markup and event handlers never reach the parser. */
export function sanitizeBookmarkHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: BOOKMARK_HTML_TAGS,
    // `tags` is the Netscape TAGS attribute our own export writes.
    ALLOWED_ATTR: ["href", "rel", "tags"],
  });
}

function enforceSize(text: string, format: ImportFormat): void {
  const limits = IMPORT_LIMITS[format];
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > limits.maxBytes) {
    throw new ImportValidationError(
      "file_too_large",
      `${format.toUpperCase()} import is ${bytes} bytes; the limit is ${limits.maxBytes} bytes`,
    );
  }
}

function enforceRecordCount(count: number, format: ImportFormat): void {
  const limits = IMPORT_LIMITS[format];
  if (count > limits.maxRecords) {
    throw new ImportValidationError(
      "too_many_records",
      `${format.toUpperCase()} import has ${count} records; the limit is ${limits.maxRecords}`,
    );
  }
}

function topLevelRecordCount(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;
  const record = payload as Record<string, unknown>;
  const size = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return size(record["items"]) + size(record["collections"]) + size(record["tags"]);
}

/**
 * Walk with an explicit stack: rejects excessive nesting and strips prototype
 * keys before any parser sees the payload. Iterative so a hostile depth cannot
 * exhaust the call stack.
 */
function guardJsonPayload(payload: unknown): void {
  const maxDepth = IMPORT_LIMITS.raindrop.maxJsonDepth;
  const stack: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 1 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.depth > maxDepth) {
      throw new ImportValidationError(
        "json_too_deep",
        `Raindrop JSON nesting exceeds the ${maxDepth}-level limit`,
      );
    }
    const { value, depth } = current;
    if (Array.isArray(value)) {
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === "__proto__" || key === "constructor") {
        delete record[key];
        continue;
      }
      stack.push({ value: record[key], depth: depth + 1 });
    }
  }
}

function issueMessage(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "invalid value";
}

function validateCollections(
  collections: readonly {
    name: string;
    parentSourceId: string | null;
    orderIndex: number;
    sourceId?: string | null;
  }[],
  warnings: ImportWarning[],
): ValidatedImportCollection[] {
  const valid: ValidatedImportCollection[] = [];
  const parents = new Map<string, string | null>();
  collections.forEach((collection, index) => {
    const name = importNameSchema.safeParse(collection.name);
    if (!name.success) {
      warnings.push({
        kind: "collection",
        index,
        reason: `collection rejected: ${issueMessage(name.error.issues)}`,
      });
      return;
    }
    valid.push({
      name: name.data,
      sourceId: collection.sourceId ?? null,
      parentSourceId: collection.parentSourceId,
      orderIndex: Number.isFinite(collection.orderIndex) ? collection.orderIndex : index,
    });
    if (collection.sourceId) parents.set(collection.sourceId, collection.parentSourceId);
  });

  for (const collection of valid) {
    let depth = 1;
    let parent = collection.parentSourceId;
    // Depth only matters up to the warning threshold, which also bounds cycles.
    while (parent && depth < COLLECTION_WARNING_DEPTH && parents.has(parent)) {
      depth += 1;
      parent = parents.get(parent) ?? null;
    }
    if (depth >= COLLECTION_WARNING_DEPTH) {
      warnings.push({
        kind: "collection",
        reason: `collection "${collection.name}" nests ${depth}+ levels deep; import continues (warning threshold ${COLLECTION_WARNING_DEPTH})`,
      });
    }
  }
  return valid;
}

function validateTags(
  tags: readonly { name: string; usageCount: number }[],
  warnings: ImportWarning[],
): ValidatedImportTag[] {
  const valid: ValidatedImportTag[] = [];
  const byNormalized = new Map<string, ValidatedImportTag>();
  tags.forEach((tag, index) => {
    const name = importNameSchema.safeParse(tag.name);
    const usage = importUsageSchema.safeParse(tag.usageCount);
    if (!name.success) {
      warnings.push({
        kind: "tag",
        index,
        reason: `tag rejected: ${issueMessage(name.error.issues)}`,
      });
      return;
    }
    if (!usage.success) {
      warnings.push({
        kind: "tag",
        index,
        reason: `tag rejected: ${issueMessage(usage.error.issues)}`,
      });
      return;
    }
    const normalizedName = normalizeTagName(name.data);
    if (!normalizedName) {
      warnings.push({
        kind: "tag",
        index,
        reason: "tag rejected: name is empty after normalization",
      });
      return;
    }
    const existing = byNormalized.get(normalizedName);
    if (existing) {
      // Same identity through NFC/whitespace normalization: keep the highest count.
      existing.usageCount = Math.max(existing.usageCount, usage.data);
      return;
    }
    const entry = { name: displayTagName(name.data), normalizedName, usageCount: usage.data };
    byNormalized.set(normalizedName, entry);
    valid.push(entry);
  });
  return valid;
}

function metaTags(tags: readonly string[], warnings: ImportWarning[]): string[] {
  const dropped = new Set<string>();
  return tags.filter((tag) => {
    if (importNameSchema.safeParse(tag).success) return true;
    if (!dropped.has(tag)) {
      dropped.add(tag);
      warnings.push({
        kind: "tag",
        reason: `tag name longer than ${MAX_NAME_LENGTH} characters dropped from a resource`,
      });
    }
    return false;
  });
}

function toResourceType(value: string): ResourceType {
  const candidate = value.trim().toLowerCase();
  return (RESOURCE_TYPES as readonly string[]).includes(candidate)
    ? (candidate as ResourceType)
    : "other";
}

function addResource(
  resources: ValidatedImportResource[],
  seen: Set<string>,
  warnings: ImportWarning[],
  index: number,
  candidate: z.input<typeof resourceInputSchema>,
  meta: ImportResourceMeta,
): void {
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(candidate.url);
  } catch {
    warnings.push({ kind: "resource", index, reason: "resource rejected: not an http(s) URL" });
    return;
  }
  if (seen.has(canonicalUrl)) {
    warnings.push({ kind: "resource", index, reason: "duplicate canonical URL" });
    return;
  }
  const input = resourceInputSchema.safeParse(candidate);
  if (!input.success) {
    warnings.push({
      kind: "resource",
      index,
      reason: `resource rejected: ${issueMessage(input.error.issues)}`,
    });
    return;
  }
  seen.add(canonicalUrl);
  resources.push({
    input: input.data,
    meta: {
      ...(meta.createdAt === undefined ? {} : { createdAt: meta.createdAt }),
      collectionSourceIds: meta.collectionSourceIds,
      tags: metaTags(meta.tags, warnings),
    },
  });
}

function rainDropMeta(resource: ParsedRaindropResource): ImportResourceMeta {
  return {
    ...(resource.createdAt === undefined ? {} : { createdAt: resource.createdAt }),
    collectionSourceIds: resource.collectionSourceIds,
    tags: resource.tags,
  };
}

function rainDropInput(resource: ParsedRaindropResource): z.input<typeof resourceInputSchema> {
  return {
    url: resource.url,
    title: resource.title,
    description: resource.description,
    thumbnailUrl: resource.thumbnailUrl,
    faviconUrl: resource.faviconUrl,
    type: resource.type,
    source: "import",
    notes: resource.notes,
    extractionStatus: "complete",
    extractionNotes: [],
  };
}

/** Validates a Netscape bookmark export. */
export function validateHtmlImport(html: string): ValidatedImport {
  enforceSize(html, "html");
  enforceRecordCount((html.match(/<a\s/gi) ?? []).length, "html");

  const parsed = parseHtmlBookmarks(sanitizeBookmarkHtml(html));
  enforceRecordCount(
    parsed.resources.length + parsed.collections.length + parsed.tags.length,
    "html",
  );

  const warnings: ImportWarning[] = [];
  const resources: ValidatedImportResource[] = [];
  const seen = new Set<string>();

  parsed.resources.forEach((resource, index) => {
    addResource(
      resources,
      seen,
      warnings,
      index,
      {
        url: resource.url,
        title: resource.title,
        description: resource.description,
        type: toResourceType(resource.type),
        source: "import",
        notes: resource.notes,
        extractionStatus: "complete",
        extractionNotes: [],
      },
      {
        collectionSourceIds: resource.folderId === null ? [] : [resource.folderId],
        tags: resource.tags,
      },
    );
  });

  return {
    format: "html",
    resources,
    collections: validateCollections(
      parsed.folders.map((folder) => ({
        name: folder.name,
        sourceId: folder.id,
        parentSourceId: folder.parentId,
        orderIndex: folder.orderIndex,
      })),
      warnings,
    ),
    tags: validateTags(
      parsed.tags.map((name) => ({ name, usageCount: 0 })),
      warnings,
    ),
    warnings,
  };
}

/**
 * Our JSON export writes two fields the Raindrop parser ignores: `collectionIds`
 * (every membership, not just the mirrored `collection`) and `faviconUrl`.
 * `shortcut: merged here because raindrop.ts is outside this task's committable
 * files; move these two reads into the parser once that file is tracked.`
 */
interface PayloadExtras {
  collectionIds: string[];
  faviconUrl?: string;
}

function canonicalKey(value: string): string | null {
  try {
    return canonicalizeUrl(value.trim());
  } catch {
    return null;
  }
}

function readPayloadExtras(payload: unknown): Map<string, PayloadExtras> {
  const items = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as Record<string, unknown>)["items"])
      ? ((payload as Record<string, unknown>)["items"] as unknown[])
      : [];
  const extras = new Map<string, PayloadExtras>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const link = typeof record["link"] === "string" ? record["link"] : record["url"];
    if (typeof link !== "string") continue;
    const key = canonicalKey(link);
    if (key === null) continue;
    const ids = Array.isArray(record["collectionIds"])
      ? record["collectionIds"].filter(
          (value): value is string => typeof value === "string" && value.trim() !== "",
        )
      : [];
    const faviconUrl = typeof record["faviconUrl"] === "string" ? record["faviconUrl"].trim() : "";
    const usableFavicon = canonicalKey(faviconUrl) !== null ? faviconUrl : undefined;
    extras.set(key, {
      collectionIds: [...new Set(ids.map((value) => value.trim()))],
      ...(usableFavicon === undefined ? {} : { faviconUrl: usableFavicon }),
    });
  }
  return extras;
}

/** Validates a Raindrop.io JSON export. */
export function validateRaindropImport(json: string): ValidatedImport {
  enforceSize(json, "raindrop");

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new ImportValidationError(
      "invalid_json",
      "Invalid Raindrop JSON: file is not valid JSON",
    );
  }

  guardJsonPayload(payload);
  enforceRecordCount(topLevelRecordCount(payload), "raindrop");

  let parsed;
  try {
    parsed = parseRaindropPayload(payload);
  } catch (error) {
    if (error instanceof RaindropParseError) {
      throw new ImportValidationError("unsupported_export", error.message);
    }
    throw error;
  }

  const warnings: ImportWarning[] = parsed.skipped.map(
    (record: SkippedRaindropRecord): ImportWarning => ({
      kind: record.kind,
      index: record.index,
      reason: record.reason,
    }),
  );

  const resources: ValidatedImportResource[] = [];
  const seen = new Set<string>();
  const extras = readPayloadExtras(payload);
  parsed.resources.forEach((resource, index) => {
    const input = rainDropInput(resource);
    const extra = extras.get(canonicalKey(resource.url) ?? "");
    if (extra?.faviconUrl) input.faviconUrl = extra.faviconUrl;
    addResource(resources, seen, warnings, index, input, {
      ...rainDropMeta(resource),
      collectionSourceIds:
        extra && extra.collectionIds.length > 0
          ? extra.collectionIds
          : resource.collectionSourceIds,
    });
  });

  return {
    format: "raindrop",
    resources,
    collections: validateCollections(parsed.collections, warnings),
    tags: validateTags(parsed.tags, warnings),
    warnings,
  };
}
