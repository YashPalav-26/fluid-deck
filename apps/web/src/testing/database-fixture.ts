import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { FluidDeckDatabase } from "../persistence/db.ts";
import { clearQuarantine } from "../persistence/quarantine.ts";

/**
 * One throwaway database per test (`fake-indexeddb`), closed and deleted afterwards.
 * Behaviour is simulated IndexedDB, not a real browser — see the Sprint 2 report.
 */
export function useTestDatabase(): { readonly db: FluidDeckDatabase } {
  let database: FluidDeckDatabase;

  beforeEach(async () => {
    clearQuarantine();
    database = new FluidDeckDatabase(`fluid-deck-test-${crypto.randomUUID()}`);
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  return {
    get db() {
      return database;
    },
  };
}
