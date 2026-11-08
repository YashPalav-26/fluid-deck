/**
 * DB-008 — key-value preferences (Phase 2.2 §1). Reads fall back to the approved
 * defaults, so nothing must be written before the first launch.
 */
import { DEFAULT_PREFERENCES, preferenceSchema, type PreferenceKey } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow } from "./errors.ts";

export async function getPreference(
  database: FluidDeckDatabase,
  key: string,
): Promise<string | undefined> {
  const row = await database.preferences.get(key);
  if (row) return row.value;
  return DEFAULT_PREFERENCES[key as PreferenceKey];
}

export async function setPreference(
  database: FluidDeckDatabase,
  key: string,
  value: string,
): Promise<void> {
  const valid = parseOrThrow(preferenceSchema, { key, value }, "preference");
  await database.preferences.put(valid);
}

/** Approved defaults overlaid with stored rows. */
export async function getAllPreferences(
  database: FluidDeckDatabase,
): Promise<Record<string, string>> {
  const rows = await database.preferences.toArray();
  return {
    ...DEFAULT_PREFERENCES,
    ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
  };
}
