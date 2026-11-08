/**
 * DB-001 — the one canonical Dexie instance (Phase 2.2 §3.1).
 *
 * Store/index definitions are verbatim from DATABASE_SCHEMA_AND_MIGRATIONS §3.1.
 * Only `canonicalUrl` and `normalizedName` are database-enforced uniques; join
 * tables use compound primary keys. Everything else is enforced by repositories.
 *
 * DB-006 — multi-tab upgrade lifecycle: `versionchange` closes this connection so
 * another tab can upgrade, and `blocked` is surfaced to the UI instead of hanging.
 */
import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Collection,
  Preference,
  Resource,
  ResourceCollection,
  ResourceTag,
  SavedSearch,
  Tag,
} from "@fluid-deck/core";
import { DB_NAME, SCHEMA_VERSION } from "@fluid-deck/core";

export const SCHEMA_V1 = {
  // Two syntax corrections to Phase 2.2 §3.1 (same intent, Dexie-valid):
  // - uniqueness is `&` (`canonicalUrl!` would become part of the index name);
  // - compound indexes need brackets (`[type+createdAt]`, not `type+createdAt`).
  resources:
    "id, &canonicalUrl, type, source, domain, [deletedAt+createdAt], createdAt, updatedAt, lastOpenedAt, [type+createdAt], [source+createdAt]",
  collections: "id, parentId, [parentId+orderIndex], name",
  tags: "id, &normalizedName, [usageCount+name]",
  resourceCollections: "[resourceId+collectionId], resourceId, collectionId",
  resourceTags: "[resourceId+tagId], resourceId, tagId",
  savedSearches: "id, name",
  preferences: "key",
} as const;

export type StoreName = keyof typeof SCHEMA_V1;
export const STORE_NAMES = Object.keys(SCHEMA_V1) as StoreName[];

export class DatabaseInitializationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseInitializationError";
  }
}

export type DbLifecycleStatus = "idle" | "open" | "blocked" | "versionchange" | "error";

export interface DbLifecycle {
  status: DbLifecycleStatus;
  message?: string;
}

let lifecycle: DbLifecycle = { status: "idle" };
const lifecycleListeners = new Set<(state: DbLifecycle) => void>();

export function getDbLifecycle(): DbLifecycle {
  return lifecycle;
}

/** DB-006 seam: the UI subscribes and shows "close other tabs" / "reload". */
export function subscribeDbLifecycle(listener: (state: DbLifecycle) => void): () => void {
  lifecycleListeners.add(listener);
  return () => lifecycleListeners.delete(listener);
}

function setLifecycle(next: DbLifecycle): void {
  lifecycle = next;
  for (const listener of lifecycleListeners) listener(next);
}

export class FluidDeckDatabase extends Dexie {
  resources!: EntityTable<Resource, "id">;
  collections!: EntityTable<Collection, "id">;
  tags!: EntityTable<Tag, "id">;
  resourceCollections!: Table<ResourceCollection, [string, string]>;
  resourceTags!: Table<ResourceTag, [string, string]>;
  savedSearches!: EntityTable<SavedSearch, "id">;
  preferences!: EntityTable<Preference, "key">;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(SCHEMA_VERSION).stores(SCHEMA_V1);

    this.on("ready", () => setLifecycle({ status: "open" }));
    this.on("blocked", () => {
      const message = "Another Fluid Deck tab is holding an older database version.";
      console.warn(`[Fluid Deck] database upgrade blocked — ${message}`);
      setLifecycle({ status: "blocked", message });
    });
    this.on("versionchange", (event) => {
      // Release the connection so the other tab's upgrade can commit.
      console.info(`[Fluid Deck] database versionchange → closing (${event.newVersion ?? "?"})`);
      setLifecycle({
        status: "versionchange",
        message: "Fluid Deck was upgraded in another tab. Reloading is required.",
      });
      this.close();
    });
  }
}

/** Canonical instance. Repositories receive a database argument for testability. */
export const db = new FluidDeckDatabase();

/** Opens the database once, converting failures into a named initialization error. */
export async function openDatabase(database: FluidDeckDatabase = db): Promise<FluidDeckDatabase> {
  try {
    await database.open();
    setLifecycle({ status: "open" });
    return database;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLifecycle({ status: "error", message });
    throw new DatabaseInitializationError(`Could not open "${database.name}": ${message}`, {
      cause: error,
    });
  }
}

const DELETE_CONFIRMATION = "delete-all-data";

/**
 * DB-005 — the only place allowed to call `db.delete()` (Phase 2.2 §3.4).
 * Requires an explicit typed confirmation; never called by repositories.
 */
export async function resetDatabase(
  database: FluidDeckDatabase = db,
  options: { confirmation: string },
): Promise<void> {
  if (options.confirmation !== DELETE_CONFIRMATION) {
    throw new DatabaseInitializationError(
      `Full delete requires confirmation: "${DELETE_CONFIRMATION}"`,
    );
  }
  await database.delete();
  await database.open();
}
