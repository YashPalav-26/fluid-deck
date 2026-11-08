/**
 * DB-002 — saved searches. Phase 2.2 §1: the store ships schema-complete in MVP;
 * surfacing them is S5. `alertEnabled` is stored but no alert machinery exists.
 */
import {
  savedSearchInputSchema,
  savedSearchSchema,
  type SavedSearch,
  type SavedSearchInput,
} from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow, RepositoryError } from "./errors.ts";

export async function createSavedSearch(
  database: FluidDeckDatabase,
  input: SavedSearchInput,
): Promise<SavedSearch> {
  const valid = parseOrThrow(savedSearchInputSchema, input, "saved search");
  const savedSearch = parseOrThrow(
    savedSearchSchema,
    { ...valid, id: crypto.randomUUID(), createdAt: Date.now() },
    "saved search",
  );
  await database.savedSearches.add(savedSearch);
  return savedSearch;
}

export async function listSavedSearches(database: FluidDeckDatabase): Promise<SavedSearch[]> {
  return database.savedSearches.orderBy("name").toArray();
}

export async function deleteSavedSearch(database: FluidDeckDatabase, id: string): Promise<void> {
  const existing = await database.savedSearches.get(id);
  if (!existing) throw new RepositoryError("NOT_FOUND", `Saved search not found: ${id}`);
  await database.savedSearches.delete(id);
}
