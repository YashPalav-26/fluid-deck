/**
 * CORE-001 / CORE-002 — the canonical domain model plus runtime validation.
 *
 * Two families on purpose:
 * - `*Schema` describe records as they are persisted/loaded (all fields present).
 * - `*InputSchema` / `*PatchSchema` describe untrusted writes and are `.strict()`.
 * TypeScript types are inferred from the schemas; there are no duplicate interfaces.
 */
import { z } from "zod";
import {
  EXTRACTION_STATUSES,
  MAX_DOMAIN_LENGTH,
  MAX_EXTRACTION_NOTES,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_URL_LENGTH,
  RESOURCE_SOURCES,
  RESOURCE_TYPES,
} from "./constants.ts";

export const uuidSchema = z.uuid();
/** Epoch milliseconds. */
export const timestampSchema = z.number().int().nonnegative();

/** Absolute http(s) URLs only — rejects javascript:, data:, file:, blob:, about:. */
export const httpUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Must be an absolute http(s) URL" },
  );

/** Empty string or an absolute http(s) URL (thumbnail/favicon are optional URLs). */
const optionalUrlSchema = z.union([z.literal(""), httpUrlSchema]);

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const textSchema = z.string().max(MAX_TEXT_LENGTH);
const domainSchema = z.string().min(1).max(MAX_DOMAIN_LENGTH).toLowerCase();

// ---------------------------------------------------------------------------
// resources
// ---------------------------------------------------------------------------

export const resourceSchema = z
  .object({
    id: uuidSchema,
    url: httpUrlSchema,
    canonicalUrl: httpUrlSchema,
    title: textSchema,
    description: textSchema,
    thumbnailUrl: optionalUrlSchema,
    faviconUrl: optionalUrlSchema,
    domain: domainSchema,
    type: z.enum(RESOURCE_TYPES),
    source: z.enum(RESOURCE_SOURCES),
    notes: textSchema,
    extractionStatus: z.enum(EXTRACTION_STATUSES),
    extractionNotes: z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_EXTRACTION_NOTES),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    lastOpenedAt: timestampSchema.nullable(),
    deletedAt: timestampSchema.nullable(),
  })
  .refine((value) => value.updatedAt >= value.createdAt, {
    message: "updatedAt must not be earlier than createdAt",
    path: ["updatedAt"],
  });

export type Resource = z.infer<typeof resourceSchema>;

/** Untrusted create payload. `id`, `canonicalUrl`, `domain`, timestamps are derived. */
export const resourceInputSchema = z
  .strictObject({
    url: httpUrlSchema,
    title: z.string().max(MAX_TEXT_LENGTH).default(""),
    description: z.string().max(MAX_TEXT_LENGTH).default(""),
    thumbnailUrl: optionalUrlSchema.default(""),
    faviconUrl: optionalUrlSchema.default(""),
    type: z.enum(RESOURCE_TYPES).default("other"),
    source: z.enum(RESOURCE_SOURCES).default("extension"),
    notes: z.string().max(MAX_TEXT_LENGTH).default(""),
    extractionStatus: z.enum(EXTRACTION_STATUSES).default("complete"),
    extractionNotes: z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_EXTRACTION_NOTES).default([]),
  })
  .strict();

/** What callers may pass: fields with defaults are optional. */
export type ResourceInput = z.input<typeof resourceInputSchema>;

/** User edits. `url` may change (canonicalUrl/domain are re-derived). */
export const resourcePatchSchema = z
  .strictObject({
    url: httpUrlSchema.optional(),
    title: z.string().max(MAX_TEXT_LENGTH).optional(),
    description: z.string().max(MAX_TEXT_LENGTH).optional(),
    thumbnailUrl: optionalUrlSchema.optional(),
    faviconUrl: optionalUrlSchema.optional(),
    type: z.enum(RESOURCE_TYPES).optional(),
    notes: z.string().max(MAX_TEXT_LENGTH).optional(),
  })
  .strict();

export type ResourcePatch = z.infer<typeof resourcePatchSchema>;

// ---------------------------------------------------------------------------
// collections
// ---------------------------------------------------------------------------

export const collectionSchema = z
  .object({
    id: uuidSchema,
    name: nameSchema,
    parentId: uuidSchema.nullable(),
    orderIndex: z.number().finite(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .refine((value) => value.updatedAt >= value.createdAt, {
    message: "updatedAt must not be earlier than createdAt",
    path: ["updatedAt"],
  });

export type Collection = z.infer<typeof collectionSchema>;

export const collectionInputSchema = z
  .strictObject({
    name: nameSchema,
    parentId: uuidSchema.nullable().default(null),
  })
  .strict();

export type CollectionInput = z.input<typeof collectionInputSchema>;

export const collectionPatchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
  })
  .strict();

export type CollectionPatch = z.infer<typeof collectionPatchSchema>;

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tagSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  normalizedName: nameSchema,
  usageCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
});

export type Tag = z.infer<typeof tagSchema>;

// ---------------------------------------------------------------------------
// relationship rows
// ---------------------------------------------------------------------------

export const resourceCollectionSchema = z.object({
  resourceId: uuidSchema,
  collectionId: uuidSchema,
  addedAt: timestampSchema,
});

export type ResourceCollection = z.infer<typeof resourceCollectionSchema>;

export const resourceTagSchema = z.object({
  resourceId: uuidSchema,
  tagId: uuidSchema,
});

export type ResourceTag = z.infer<typeof resourceTagSchema>;

// ---------------------------------------------------------------------------
// saved searches
// ---------------------------------------------------------------------------

/** Phase 2.2 §1: stored so the table exists; S5 surfaces it. No alert machinery. */
export const savedSearchSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  filterStateJson: z.string().refine(
    (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "filterStateJson must be valid JSON" },
  ),
  createdAt: timestampSchema,
  alertEnabled: z.boolean(),
});

export type SavedSearch = z.infer<typeof savedSearchSchema>;

export const savedSearchInputSchema = z
  .strictObject({
    name: nameSchema,
    filterStateJson: z.string().refine(
      (value) => {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "filterStateJson must be valid JSON" },
    ),
    alertEnabled: z.boolean().default(false),
  })
  .strict();

export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

// ---------------------------------------------------------------------------
// preferences (key-value, one row per key)
// ---------------------------------------------------------------------------

/**
 * Values are stored as strings. The key set is intentionally open (prefs evolve
 * without a migration); approved keys live in `preferences.ts`.
 */
export const preferenceSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.string().max(MAX_TEXT_LENGTH),
});

export type Preference = z.infer<typeof preferenceSchema>;
