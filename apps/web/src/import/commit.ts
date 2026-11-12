/**
 * IMPORT-004 — batch persistence (500 rows per transaction) + checkpoint resume.
 *
 * Boundary: consumes a `ValidatedImport` (IMPORT-003) and writes it. Only
 * `resources[].input` is handed to the resource repository; `resources[].meta`
 * (timestamp, tag names, collection memberships) is applied separately and never
 * spread into a resource row.
 *
 * Failure model (DATABASE_SCHEMA_AND_MIGRATIONS §5.3): one Dexie transaction per
 * batch of 500 resources. A failing batch rolls back entirely, earlier batches
 * stand, and the checkpoint keeps the index of the batch that failed. Re-running is
 * idempotent — canonical-URL dedup means a replayed batch adds no rows and bumps no
 * counts. There is no tracking table (Phase 2.2 D2), so the checkpoint lives in
 * localStorage and is only an optimization on top of that dedup.
 *
 * IMPORT-005: a duplicate is a conflict, resolved inside the batch transaction with
 * the caller's per-canonical-URL decision (skip / update / add-to-collections).
 * `duplicates` counts every conflict; `updated` and `addedToCollections` break the
 * resolved subset out. The preview never decides anything — the row the unique index
 * returns does, so a stale preview cannot apply the wrong resolution.
 */
import type { ResourceInput, ResourcePatch } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import {
  createCollection,
  listSiblings,
  normalizeCollectionName,
} from "../repositories/collections.ts";
import { addResourceToCollection } from "../repositories/relationships.ts";
import { createResourceWithMembers, updateResource } from "../repositories/resources.ts";
import { syncResourcesBatch } from "../services/search.ts";
import type { ImportConflictResolution, ImportResolutionMap } from "./preview.ts";
import type { ValidatedImport, ValidatedImportCollection } from "./validate.ts";

/** Approved batch size (SPRINT_7_IMPLEMENTATION_PLAN §IMPORT-004). */
export const IMPORT_BATCH_SIZE = 500;

const CHECKPOINT_KEY = "fluid-deck:import-checkpoint";

export type ImportCommitErrorCode = "invalid_import" | "concurrent_import" | "batch_failed";

export class ImportCommitError extends Error {
  readonly code: ImportCommitErrorCode;
  /** Resources committed before the failure (batch_failed only). */
  readonly committed: number;
  readonly fingerprint: string;

  constructor(
    code: ImportCommitErrorCode,
    message: string,
    details: { cause?: unknown; committed?: number; fingerprint?: string } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "ImportCommitError";
    this.code = code;
    this.committed = details.committed ?? 0;
    this.fingerprint = details.fingerprint ?? "";
  }
}

/** Durable resume state. Cleared only when a run completes. */
export interface ImportCheckpoint {
  fingerprint: string;
  format: ValidatedImport["format"];
  totalResources: number;
  /** Index of the first resource not yet committed. */
  nextIndex: number;
  created: number;
  duplicates: number;
  /** Conflicts resolved with "update"; absent on IMPORT-004 checkpoints. */
  updated?: number;
  /** Conflicts resolved with "add-to-collections"; absent on older checkpoints. */
  addedToCollections?: number;
  completed: boolean;
  updatedAt: number;
}

export interface CheckpointStore {
  load(): unknown;
  save(checkpoint: ImportCheckpoint): void;
  clear(): void;
}

export interface ImportCommitProgress {
  fingerprint: string;
  /** Cumulative for this import, including batches from a previous run. */
  created: number;
  duplicates: number;
  updated: number;
  addedToCollections: number;
  processed: number;
  total: number;
  batch: number;
}

export interface ImportCommitResult {
  fingerprint: string;
  /** Index this run started at (0 for a fresh import). */
  resumedFrom: number;
  created: number;
  /** Conflicts encountered (every duplicate, whatever its resolution). */
  duplicates: number;
  /** Conflicts resolved with "update". */
  updated: number;
  /** Conflicts resolved with "add-to-collections". */
  addedToCollections: number;
  batches: number;
  collectionsCreated: number;
  collectionsReused: number;
  warnings: string[];
}

export interface ImportCommitOptions {
  checkpointStore?: CheckpointStore;
  onProgress?: (progress: ImportCommitProgress) => void;
  /** Per-conflict decisions keyed by canonical URL (IMPORT-005 preview). */
  resolutions?: ImportResolutionMap;
  /** Resolution for conflicts without an entry in `resolutions`. Default "skip". */
  defaultResolution?: ImportConflictResolution;
}

/**
 * localStorage wrapper. Storage failures (private mode, quota) degrade to a
 * no-op: the checkpoint is an optimization, never a correctness requirement.
 */
export function localStorageCheckpointStore(
  storage: Storage = globalThis.localStorage,
): CheckpointStore {
  return {
    load() {
      try {
        const raw = storage.getItem(CHECKPOINT_KEY);
        return raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    },
    save(checkpoint) {
      try {
        storage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
      } catch {
        // Storage unavailable: re-run still works through canonical-URL dedup.
      }
    },
    clear() {
      try {
        storage.removeItem(CHECKPOINT_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/** Non-durable store for environments without `localStorage` (tests, SSR). */
export function memoryCheckpointStore(): CheckpointStore {
  let value: unknown = null;
  return {
    load: () => value,
    save: (checkpoint) => {
      value = checkpoint;
    },
    clear: () => {
      value = null;
    },
  };
}

let fallbackStore: CheckpointStore | null = null;

function defaultStore(): CheckpointStore {
  if (fallbackStore) return fallbackStore;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      fallbackStore = localStorageCheckpointStore(window.localStorage);
      return fallbackStore;
    }
  } catch {
    // Access itself can throw (blocked storage).
  }
  fallbackStore = memoryCheckpointStore();
  return fallbackStore;
}

/** One commit at a time per JS context; a second caller is a programming error. */
let activeCommit = false;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Checkpoint rows are untrusted input from storage: a malformed, foreign or
 * out-of-range record is ignored and the import starts from zero.
 */
function readCheckpoint(
  store: CheckpointStore,
  fingerprint: string,
  totalResources: number,
): ImportCheckpoint | null {
  let raw: unknown;
  try {
    raw = store.load();
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const valid =
    typeof row["fingerprint"] === "string" &&
    (row["format"] === "html" || row["format"] === "raindrop") &&
    isCount(row["totalResources"]) &&
    isCount(row["nextIndex"]) &&
    isCount(row["created"]) &&
    isCount(row["duplicates"]) &&
    (row["updated"] === undefined || isCount(row["updated"])) &&
    (row["addedToCollections"] === undefined || isCount(row["addedToCollections"])) &&
    typeof row["completed"] === "boolean" &&
    isCount(row["updatedAt"]);
  if (!valid) return null;

  const checkpoint = raw as ImportCheckpoint;
  if (checkpoint.fingerprint !== fingerprint) return null;
  if (checkpoint.totalResources !== totalResources) return null;
  if (checkpoint.nextIndex > totalResources) return null;
  // IMPORT-004 checkpoints predate the resolution counters.
  return {
    ...checkpoint,
    updated: checkpoint.updated ?? 0,
    addedToCollections: checkpoint.addedToCollections ?? 0,
  };
}

/**
 * Stable identity of an import run: same format + same resource list + same order.
 * FNV-1a with two seeds keeps accidental collisions out of practical range; a wrong
 * match is still safe because canonical-URL dedup prevents duplicate rows.
 */
function fingerprintOf(validated: ValidatedImport): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const resource of validated.resources) {
    const url = typeof resource.input.url === "string" ? resource.input.url : "";
    for (let index = 0; index < url.length; index += 1) {
      const code = url.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    }
    h1 = Math.imul(h1 ^ 0x2f, 0x01000193);
    h2 = Math.imul(h2 ^ 0x5f, 0x85ebca6b);
  }
  const part = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  return `${validated.format}:${validated.resources.length}:${part(h1)}${part(h2)}`;
}

/**
 * Cheap structural gate. Per-row schema enforcement stays in `createResource`
 * inside the batch transaction, so an unvalidated row can never be persisted.
 */
function assertValidatedImport(value: ValidatedImport): void {
  const valid =
    Boolean(value) &&
    typeof value === "object" &&
    (value.format === "html" || value.format === "raindrop") &&
    Array.isArray(value.resources) &&
    Array.isArray(value.collections) &&
    Array.isArray(value.tags) &&
    value.resources.every(
      (resource) =>
        Boolean(resource) &&
        typeof resource === "object" &&
        Boolean(resource.input) &&
        Boolean(resource.meta) &&
        Array.isArray(resource.meta.tags) &&
        Array.isArray(resource.meta.collectionSourceIds),
    );
  if (!valid) {
    throw new ImportCommitError(
      "invalid_import",
      "Import commit requires a ValidatedImport from validate.ts",
    );
  }
}

interface PersistedCollections {
  /** source collection id -> database collection id */
  ids: Map<string, string>;
  created: number;
  reused: number;
  warnings: string[];
}

/**
 * Creates the collection tree once, before batching. A sibling with the same
 * normalized name is reused, so a resumed run never duplicates folders and never
 * throws the repository's sibling-name CONSTRAINT.
 */
async function persistCollections(
  database: FluidDeckDatabase,
  collections: readonly ValidatedImportCollection[],
): Promise<PersistedCollections> {
  const ids = new Map<string, string>();
  const known = new Set<string>();
  for (const collection of collections) {
    if (collection.sourceId !== null) known.add(collection.sourceId);
  }

  const warnings: string[] = [];
  let created = 0;
  let reused = 0;

  const resolve = async (
    collection: ValidatedImportCollection,
    parentId: string | null,
  ): Promise<void> => {
    const normalized = normalizeCollectionName(collection.name);
    const siblings = await listSiblings(database, parentId);
    const existing = siblings.find(
      (sibling) => normalizeCollectionName(sibling.name) === normalized,
    );

    let id: string;
    if (existing) {
      reused += 1;
      id = existing.id;
    } else {
      created += 1;
      id = (await createCollection(database, { name: collection.name, parentId })).collection.id;
    }
    if (collection.sourceId !== null) ids.set(collection.sourceId, id);
  };

  // Ascending source order per parent: appending yields the exported order.
  let pending = [...collections].sort((a, b) => a.orderIndex - b.orderIndex);

  while (pending.length > 0) {
    const deferred: ValidatedImportCollection[] = [];
    let progressed = false;

    for (const collection of pending) {
      const parentSourceId = collection.parentSourceId;
      if (parentSourceId !== null) {
        const parentId = ids.get(parentSourceId);
        if (parentId === undefined && known.has(parentSourceId)) {
          deferred.push(collection);
          continue;
        }
        if (parentId === undefined) {
          warnings.push(
            `collection "${collection.name}" references a parent that was not imported; created at the top level`,
          );
        }
      }
      await resolve(
        collection,
        collection.parentSourceId === null ? null : (ids.get(collection.parentSourceId) ?? null),
      );
      progressed = true;
    }

    if (!progressed) {
      // Every remaining parent is pending too: a cycle. Flatten rather than hang.
      for (const collection of pending) {
        warnings.push(
          `collection "${collection.name}" is part of a parent cycle; created at the top level`,
        );
        await resolve(collection, null);
      }
      break;
    }
    pending = deferred;
  }

  return { ids, created, reused, warnings };
}

/** Source timestamps in the future or outside the schema are ignored, not clamped. */
function usableTimestamp(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= Date.now();
}

type ResolutionResolver = (canonicalUrl: string) => ImportConflictResolution;

/**
 * Resolution lookup with the approved fallback. An absent entry (or a value from an
 * untyped caller) degrades to "skip": the conservative choice that never rewrites a
 * row the user did not explicitly ask to change.
 */
function makeResolver(options: ImportCommitOptions): ResolutionResolver {
  const fallback = options.defaultResolution ?? "skip";
  const resolutions = options.resolutions;
  return (canonicalUrl) => {
    const chosen = resolutions?.get(canonicalUrl) ?? fallback;
    return chosen === "update" || chosen === "add-to-collections" ? chosen : "skip";
  };
}

/**
 * IMPORT-005 "Update Metadata": the patch carries only values the source actually
 * supplied. Empty strings are schema defaults, not user data, and never wipe an
 * existing column. `type` is exempt from the non-empty test because the enum has no
 * empty member - "other" is the fallback both parsers emit when the source does not
 * say, so it must not overwrite a known type. The HTML parser's "Untitled"
 * placeholder is treated as missing for the same reason.
 */
function metadataPatch(input: ResourceInput): ResourcePatch {
  const patch: ResourcePatch = {};
  const title = input.title?.trim();
  if (title && title !== "Untitled") patch.title = input.title;
  const description = input.description?.trim();
  if (description) patch.description = input.description;
  const thumbnailUrl = input.thumbnailUrl?.trim();
  if (thumbnailUrl) patch.thumbnailUrl = thumbnailUrl;
  const faviconUrl = input.faviconUrl?.trim();
  if (faviconUrl) patch.faviconUrl = faviconUrl;
  if (input.type !== undefined && input.type !== "other") patch.type = input.type;
  const notes = input.notes?.trim();
  if (notes) patch.notes = input.notes;
  return patch;
}

/**
 * One Dexie transaction for the whole batch: resource + join rows + tag usage
 * counts + imported timestamps. Any throw aborts the transaction; prior batches
 * are untouched because they committed in earlier transactions.
 *
 * Duplicates are resolved here, inside the transaction. The preview the user saw may
 * be stale by the time the batch runs, so the conflict is decided against the row
 * the unique index actually returned - never against the preview snapshot.
 */
async function commitBatch(
  database: FluidDeckDatabase,
  batch: ValidatedImport["resources"],
  collectionIds: Map<string, string>,
  resolve: ResolutionResolver,
): Promise<{
  created: number;
  duplicates: number;
  updated: number;
  addedToCollections: number;
  /** Rows this batch changed; the search index is synced from exactly these. */
  touched: string[];
}> {
  return database.transaction(
    "rw",
    [
      database.resources,
      database.collections,
      database.resourceCollections,
      database.tags,
      database.resourceTags,
    ],
    async () => {
      let created = 0;
      let duplicates = 0;
      let updated = 0;
      let addedToCollections = 0;
      const touched: string[] = [];

      for (const { input, meta } of batch) {
        const memberships = meta.collectionSourceIds.flatMap((sourceId) => {
          const id = collectionIds.get(sourceId);
          return id === undefined ? [] : [id];
        });

        const result = await createResourceWithMembers(
          database,
          input,
          { collectionIds: memberships, tagNames: meta.tags },
          { dropMissingMembers: true },
        );

        if (!result.duplicate) {
          created += 1;
          touched.push(result.resource.id);
          if (usableTimestamp(meta.createdAt)) {
            await database.resources.update(result.resource.id, { createdAt: meta.createdAt });
          }
          continue;
        }

        duplicates += 1;
        const resolution = resolve(result.resource.canonicalUrl);

        if (resolution === "update") {
          const patch = metadataPatch(input);
          if (Object.keys(patch).length > 0) {
            await updateResource(database, result.resource.id, patch);
            updated += 1;
            touched.push(result.resource.id);
          }
          continue;
        }

        if (resolution === "add-to-collections") {
          for (const collectionId of memberships) {
            await addResourceToCollection(database, result.resource.id, collectionId);
          }
          addedToCollections += 1;
          // Membership text is searchable, so the row must be re-indexed.
          touched.push(result.resource.id);
        }
        // "skip": existing row and its relationships stay untouched.
      }
      return { created, duplicates, updated, addedToCollections, touched };
    },
  );
}

/**
 * Commits a validated import in 500-resource batches, resuming from a matching
 * checkpoint. Throws `ImportCommitError`; never reports a batch before its
 * transaction resolves.
 */
export async function commitImport(
  database: FluidDeckDatabase,
  validated: ValidatedImport,
  options: ImportCommitOptions = {},
): Promise<ImportCommitResult> {
  assertValidatedImport(validated);
  if (activeCommit) {
    throw new ImportCommitError("concurrent_import", "An import is already committing");
  }
  activeCommit = true;

  try {
    const fingerprint = fingerprintOf(validated);
    const store = options.checkpointStore ?? defaultStore();
    const total = validated.resources.length;
    const previous = readCheckpoint(store, fingerprint, total);
    const canResume = previous !== null && !previous.completed;
    const startIndex = canResume ? previous.nextIndex : 0;
    if (previous?.completed) store.clear();

    let created = canResume ? previous.created : 0;
    let duplicates = canResume ? previous.duplicates : 0;
    let updated = canResume ? (previous.updated ?? 0) : 0;
    let addedToCollections = canResume ? (previous.addedToCollections ?? 0) : 0;

    const persist = (nextIndex: number, completed: boolean) => {
      store.save({
        fingerprint,
        format: validated.format,
        totalResources: total,
        nextIndex,
        created,
        duplicates,
        updated,
        addedToCollections,
        completed,
        updatedAt: Date.now(),
      });
    };

    const collections = await persistCollections(database, validated.collections);
    const resolve = makeResolver(options);

    let index = startIndex;
    let batches = 0;

    while (index < total) {
      const batch = validated.resources.slice(index, index + IMPORT_BATCH_SIZE);
      let outcome: {
        created: number;
        duplicates: number;
        updated: number;
        addedToCollections: number;
        /** Rows this batch changed; the search index is synced from exactly these. */
        touched: string[];
      };
      try {
        outcome = await commitBatch(database, batch, collections.ids, resolve);
      } catch (error) {
        // The failed batch rolled back; `index` is still the first uncommitted row.
        persist(index, false);
        const reason = error instanceof Error ? error.message : String(error);
        throw new ImportCommitError(
          "batch_failed",
          `Import paused at ${index} of ${total} resources (${created} committed): ${reason}`,
          { cause: error, committed: created, fingerprint },
        );
      }

      created += outcome.created;
      duplicates += outcome.duplicates;
      updated += outcome.updated;
      addedToCollections += outcome.addedToCollections;
      batches += 1;
      index += batch.length;

      // Checkpoint after the transaction, never before it.
      persist(index, index >= total);

      // The search index is derived state: sync exactly the rows this batch
      // committed, and only after the transaction resolved. A rolled-back batch
      // throws above and never reaches this line.
      if (outcome.touched.length > 0) {
        try {
          await syncResourcesBatch(database, outcome.touched);
        } catch {
          // The index is disposable and rebuilt on the next startup; a sync
          // failure must not fail an import whose rows are already committed.
        }
      }

      options.onProgress?.({
        fingerprint,
        created,
        duplicates,
        updated,
        addedToCollections,
        processed: index,
        total,
        batch: batches,
      });
    }

    return {
      fingerprint,
      resumedFrom: startIndex,
      created,
      duplicates,
      updated,
      addedToCollections,
      batches,
      collectionsCreated: collections.created,
      collectionsReused: collections.reused,
      warnings: collections.warnings,
    };
  } finally {
    activeCommit = false;
  }
}
