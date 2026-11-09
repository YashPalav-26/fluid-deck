/** Approved constants shared by every app and package. Imports nothing. */

export const APP_NAME = "Fluid Deck";

/** Phase 2.2 §3.1: one database per browser profile. */
export const DB_NAME = "fluid-deck";

/** Dexie schema version. Bump only with a migration in `apps/web/src/persistence/db.ts`. */
export const SCHEMA_VERSION = 1;

/** FR-CAP-004 approved 8-value enum (PRD + Phase 2.2 §2.1). */
export const RESOURCE_TYPES = [
  "article",
  "video",
  "github",
  "npm",
  "pdf",
  "design",
  "tool",
  "other",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Phase 2.2 §2.1. `cli`/`api` are not in the MVP enumeration. */
export const RESOURCE_SOURCES = ["extension", "import", "share", "other"] as const;
export type ResourceSource = (typeof RESOURCE_SOURCES)[number];

export const EXTRACTION_STATUSES = ["complete", "partial", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** Longest free-text field accepted from extraction or edits. */
export const MAX_TEXT_LENGTH = 8192;
export const MAX_NAME_LENGTH = 200;
export const MAX_URL_LENGTH = 8192;
export const MAX_DOMAIN_LENGTH = 253;
export const MAX_EXTRACTION_NOTES = 50;

/** U2: warn (never block) when a collection sits at this nesting level or deeper. */
export const COLLECTION_WARNING_DEPTH = 4;

/** U5: default deleted-resource retention in days. Configurable via preferences. */
export const DEFAULT_PURGE_RETENTION_DAYS = 30;
