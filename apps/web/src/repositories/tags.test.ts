import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createResource } from "./resources.ts";
import { addTagToResource } from "./relationships.ts";
import {
  createTag,
  deleteTag,
  findTagByName,
  listTags,
  mergeTags,
  normalizeTagName,
  recomputeTagUsageCounts,
  renameTag,
} from "./tags.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

describe("tag repository (U6 free-form names)", () => {
  it("preserves free-form display names while normalizing identity", async () => {
    const { tag } = await createTag(db, "  Machine   Learning  ");
    expect(tag.name).toBe("Machine Learning");
    expect(tag.normalizedName).toBe("machine learning");

    const cpp = await createTag(db, "C++");
    expect(cpp.tag.name).toBe("C++");

    const kebab = await createTag(db, "machine-learning");
    expect(kebab.tag.name).toBe("machine-learning");
    expect(kebab.tag.normalizedName).toBe("machine-learning");
  });

  it("treats case and spacing variants as the same tag", async () => {
    const first = await createTag(db, "React");
    const second = await createTag(db, "  REACT ");
    expect(second.created).toBe(false);
    expect(second.tag.id).toBe(first.tag.id);
    expect(await db.tags.count()).toBe(1);
  });

  it("rejects empty names", async () => {
    await expect(createTag(db, "   ")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(normalizeTagName("  A  B ")).toBe("a b");
  });

  it("finds tags by any display spelling", async () => {
    const { tag } = await createTag(db, "TypeScript");
    expect((await findTagByName(db, "typescript"))?.id).toBe(tag.id);
    expect(await findTagByName(db, "missing")).toBeUndefined();
  });

  it("renames a tag and rejects a rename onto another tag", async () => {
    const a = await createTag(db, "javascript");
    const b = await createTag(db, "typescript");

    const renamed = await renameTag(db, a.tag.id, "JavaScript!");
    expect(renamed.name).toBe("JavaScript!");
    expect(renamed.normalizedName).toBe("javascript!");

    await expect(renameTag(db, b.tag.id, "javascript!")).rejects.toMatchObject({
      code: "CONSTRAINT",
    });
  });

  it("merges tags, skipping duplicate memberships and recomputing usage", async () => {
    const source = await createTag(db, "js");
    const target = await createTag(db, "javascript");
    const r1 = await createResource(db, { url: "https://example.com/1" });
    const r2 = await createResource(db, { url: "https://example.com/2" });
    await addTagToResource(db, r1.resource.id, source.tag.id);
    await addTagToResource(db, r2.resource.id, source.tag.id);
    await addTagToResource(db, r1.resource.id, target.tag.id);

    const result = await mergeTags(db, source.tag.id, target.tag.id);

    expect(result).toEqual({ moved: 1, skipped: 1, usageCount: 2 });
    expect(await db.tags.get(source.tag.id)).toBeUndefined();
    expect((await db.tags.get(target.tag.id))?.usageCount).toBe(2);
    expect(await db.resourceTags.count()).toBe(2);
    await expect(mergeTags(db, target.tag.id, target.tag.id)).rejects.toMatchObject({
      code: "CONSTRAINT",
    });
  });

  it("deletes a tag and its memberships without touching resources", async () => {
    const { tag } = await createTag(db, "temp");
    const { resource } = await createResource(db, { url: "https://example.com/tagged" });
    await addTagToResource(db, resource.id, tag.id);

    expect(await deleteTag(db, tag.id)).toBe(1);
    expect(await db.tags.count()).toBe(0);
    expect(await db.resourceTags.count()).toBe(0);
    expect(await db.resources.get(resource.id)).toBeDefined();
  });

  it("repairs drifted usage counts only when asked", async () => {
    const { tag } = await createTag(db, "drift");
    await db.tags.update(tag.id, { usageCount: 99 });
    expect((await db.tags.get(tag.id))?.usageCount).toBe(99);

    const repaired = await recomputeTagUsageCounts(db);
    expect(repaired.updated).toBe(1);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(0);
  });

  it("ranks tags by usage, then name", async () => {
    const a = await createTag(db, "alpha");
    const b = await createTag(db, "beta");
    await db.tags.update(a.tag.id, { usageCount: 5 });
    await db.tags.update(b.tag.id, { usageCount: 1 });
    expect((await listTags(db)).map((tag) => tag.name)).toEqual(["alpha", "beta"]);
  });
});
