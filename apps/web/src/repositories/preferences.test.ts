import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { getAllPreferences, getPreference, setPreference } from "./preferences.ts";
import { createSavedSearch, deleteSavedSearch, listSavedSearches } from "./saved-searches.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

describe("preferences (DB-008)", () => {
  it("returns approved defaults before anything is stored", async () => {
    expect(await getPreference(db, "theme")).toBe("light");
    expect(await getPreference(db, "purgeRetentionDays")).toBe("30");
    expect(await getPreference(db, "unknownKey")).toBeUndefined();
    expect(await db.preferences.count()).toBe(0);
  });

  it("persists a key-value row and merges it over the defaults", async () => {
    await setPreference(db, "theme", "dark");
    await setPreference(db, "purgeRetentionDays", "90");

    expect(await getPreference(db, "theme")).toBe("dark");
    const all = await getAllPreferences(db);
    expect(all.theme).toBe("dark");
    expect(all.purgeRetentionDays).toBe("90");
    expect(all.density).toBe("comfortable");
  });

  it("overwrites the same key instead of duplicating it", async () => {
    await setPreference(db, "sort", "newest");
    await setPreference(db, "sort", "title-asc");
    expect(await db.preferences.count()).toBe(1);
    expect(await getPreference(db, "sort")).toBe("title-asc");
  });

  it("rejects an empty key", async () => {
    await expect(setPreference(db, "   ", "x")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("saved searches (store ships in MVP, surfacing is S5)", () => {
  it("creates, lists and deletes saved searches", async () => {
    await createSavedSearch(db, {
      name: "Unread articles",
      filterStateJson: '{"type":"article"}',
      alertEnabled: false,
    });
    const second = await createSavedSearch(db, {
      name: "Alpha",
      filterStateJson: '{"q":"x"}',
      alertEnabled: false,
    });

    expect((await listSavedSearches(db)).map((saved) => saved.name)).toEqual([
      "Alpha",
      "Unread articles",
    ]);

    await deleteSavedSearch(db, second.id);
    expect(await db.savedSearches.count()).toBe(1);
    await expect(deleteSavedSearch(db, second.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid filter state", async () => {
    await expect(
      createSavedSearch(db, { name: "Bad", filterStateJson: "not json", alertEnabled: false }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
