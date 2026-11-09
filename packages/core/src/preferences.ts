/**
 * DB-008 — approved preference keys (Phase 2.2 §1). One row per key in the
 * `preferences` store; values are strings so prefs evolve without a migration.
 */
import { DEFAULT_PURGE_RETENTION_DAYS } from "./constants.ts";

export const PREFERENCE_KEYS = [
  "theme",
  "density",
  "layout",
  "sort",
  "sidebarOpen",
  "purgeRetentionDays",
  "onboardingSeen",
  "searchSchemaVersion",
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

/** Every approved key has a default; nothing has to be written before first read. */
export const DEFAULT_PREFERENCES: Readonly<Record<PreferenceKey, string>> = {
  theme: "light",
  density: "comfortable",
  layout: "masonry",
  sort: "newest",
  sidebarOpen: "true",
  purgeRetentionDays: String(DEFAULT_PURGE_RETENTION_DAYS),
  onboardingSeen: "false",
  searchSchemaVersion: "1",
};

export const THEME_VALUES = ["light", "dark"] as const;
export const DENSITY_VALUES = ["comfortable", "compact"] as const;
export const LAYOUT_VALUES = ["masonry", "uniform"] as const;
