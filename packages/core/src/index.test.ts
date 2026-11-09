import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  DB_NAME,
  DEFAULT_PREFERENCES,
  isDepthWarning,
  PREFERENCE_KEYS,
  RESOURCE_SOURCES,
  RESOURCE_TYPES,
  SCHEMA_VERSION,
} from "./index.ts";

describe("core public surface", () => {
  it("exports approved constants", () => {
    expect(APP_NAME).toBe("Fluid Deck");
    expect(DB_NAME).toBe("fluid-deck");
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("exports the approved enums", () => {
    expect([...RESOURCE_TYPES]).toEqual([
      "article",
      "video",
      "github",
      "npm",
      "pdf",
      "design",
      "tool",
      "other",
    ]);
    expect([...RESOURCE_SOURCES]).toEqual(["extension", "import", "share", "other"]);
  });

  it("exports defaults for every approved preference key", () => {
    expect(Object.keys(DEFAULT_PREFERENCES).sort()).toEqual([...PREFERENCE_KEYS].sort());
    expect(DEFAULT_PREFERENCES.purgeRetentionDays).toBe("30");
    expect(isDepthWarning(4)).toBe(true);
  });
});
