/**
 * DB-002 / DB-003 / U6 — tags. Display names are free-form; identity is the
 * normalized name, enforced by the unique IndexedDB index.
 */
import { tagSchema, type Tag } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { parseOrThrow, RepositoryError } from "./errors.ts";

/**
 * U6 normalization: NFC, trim, collapse internal whitespace, lowercase.
 * The display name keeps the user's casing and spacing (trimmed) — only identity
 * is normalized.
 */
export function normalizeTagName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayTagName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

export async function findTagByName(
  database: FluidDeckDatabase,
  name: string,
): Promise<Tag | undefined> {
  return database.tags.where("normalizedName").equals(normalizeTagName(name)).first();
}

/**
 * Deterministic duplicate handling: an existing tag with the same normalized name
 * is returned with `created: false` instead of failing.
 */
export async function createTag(
  database: FluidDeckDatabase,
  name: string,
): Promise<{ tag: Tag; created: boolean }> {
  const display = parseOrThrow(tagSchema.shape.name, displayTagName(name), "tag name");
  const normalizedName = normalizeTagName(display);
  if (normalizedName === "") {
    throw new RepositoryError("VALIDATION", "Invalid tag name: must not be empty");
  }

  const existing = await database.tags.where("normalizedName").equals(normalizedName).first();
  if (existing) return { tag: existing, created: false };

  const tag = parseOrThrow(
    tagSchema,
    {
      id: crypto.randomUUID(),
      name: display,
      normalizedName,
      usageCount: 0,
      createdAt: Date.now(),
    },
    "tag",
  );

  try {
    await database.tags.add(tag);
  } catch (error) {
    // Unique index lost a race (another tab created the same tag).
    const winner = await database.tags.where("normalizedName").equals(normalizedName).first();
    if (winner) return { tag: winner, created: false };
    throw error;
  }
  return { tag, created: true };
}

export async function ensureTags(
  database: FluidDeckDatabase,
  names: readonly string[],
): Promise<Tag[]> {
  const result: Tag[] = [];
  for (const name of names) {
    const { tag } = await createTag(database, name);
    if (!result.some((existing) => existing.id === tag.id)) result.push(tag);
  }
  return result;
}

export async function renameTag(
  database: FluidDeckDatabase,
  id: string,
  name: string,
): Promise<Tag> {
  const display = parseOrThrow(tagSchema.shape.name, displayTagName(name), "tag name");
  const normalizedName = normalizeTagName(display);
  if (normalizedName === "") {
    throw new RepositoryError("VALIDATION", "Invalid tag name: must not be empty");
  }

  const tag = await database.tags.get(id);
  if (!tag) throw new RepositoryError("NOT_FOUND", `Tag not found: ${id}`);

  const clash = await database.tags.where("normalizedName").equals(normalizedName).first();
  if (clash && clash.id !== id) {
    throw new RepositoryError(
      "CONSTRAINT",
      `Another tag already uses the name "${clash.name}" — merge instead of renaming`,
    );
  }

  await database.tags.update(id, { name: display, normalizedName });
  return { ...tag, name: display, normalizedName };
}

/** Moves join rows to the target (skipping PK conflicts), then deletes the source. */
export async function mergeTags(
  database: FluidDeckDatabase,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number; skipped: number; usageCount: number }> {
  if (sourceId === targetId) {
    throw new RepositoryError("CONSTRAINT", "Cannot merge a tag into itself");
  }

  return database.transaction(
    "rw",
    [database.tags, database.resourceTags, database.resources],
    async () => {
      const [source, target] = await Promise.all([
        database.tags.get(sourceId),
        database.tags.get(targetId),
      ]);
      if (!source) throw new RepositoryError("NOT_FOUND", `Tag not found: ${sourceId}`);
      if (!target) throw new RepositoryError("NOT_FOUND", `Tag not found: ${targetId}`);

      const joins = await database.resourceTags.where("tagId").equals(sourceId).toArray();
      let moved = 0;
      let skipped = 0;
      for (const join of joins) {
        const existing = await database.resourceTags.get([join.resourceId, targetId]);
        if (existing) {
          skipped += 1;
        } else {
          await database.resourceTags.add({
            resourceId: join.resourceId,
            tagId: targetId,
          });
          moved += 1;
        }
        await database.resourceTags.delete([join.resourceId, sourceId]);
        await database.resources.update(join.resourceId, { updatedAt: Date.now() });
      }

      const usageCount = await database.resourceTags.where("tagId").equals(targetId).count();
      await database.tags.update(targetId, { usageCount });
      await database.tags.delete(sourceId);
      return { moved, skipped, usageCount };
    },
  );
}

/** Deletes the tag and its join rows. Resources themselves are untouched. */
export async function deleteTag(database: FluidDeckDatabase, id: string): Promise<number> {
  return database.transaction("rw", [database.tags, database.resourceTags], async () => {
    const tag = await database.tags.get(id);
    if (!tag) throw new RepositoryError("NOT_FOUND", `Tag not found: ${id}`);
    const removed = await database.resourceTags.where("tagId").equals(id).delete();
    await database.tags.delete(id);
    return removed;
  });
}

export async function listTags(database: FluidDeckDatabase): Promise<Tag[]> {
  return database.tags.orderBy("[usageCount+name]").reverse().toArray();
}

/** Explicit repair for drifted denormalized counts (never runs automatically). */
export async function recomputeTagUsageCounts(
  database: FluidDeckDatabase,
): Promise<{ updated: number }> {
  return database.transaction("rw", [database.tags, database.resourceTags], async () => {
    let updated = 0;
    for (const tag of await database.tags.toArray()) {
      const actual = await database.resourceTags.where("tagId").equals(tag.id).count();
      if (actual !== tag.usageCount) {
        await database.tags.update(tag.id, { usageCount: actual });
        updated += 1;
      }
    }
    return { updated };
  });
}
