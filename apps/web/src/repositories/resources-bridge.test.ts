/**
 * EXT-004 — repository support for the bridge: capture ID becomes the
 * resource id (idempotency), tag names are resolved in the same transaction,
 * and unknown membership IDs are dropped for untrusted bridge input.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createCollection } from "./collections.ts";
import { RepositoryError } from "./errors.ts";
import { listCollectionMembers, listResourceTags } from "./relationships.ts";
import { createResource, createResourceWithMembers, getResource } from "./resources.ts";
import { findTagByName } from "./tags.ts";

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

const input = (url: string, title = "T") => ({ url, title, source: "extension" as const });

describe("bridge repository support", () => {
  it("uses the supplied capture ID as the resource ID", async () => {
    const id = crypto.randomUUID();
    const result = await createResource(db, input("https://example.com/a"), { id });
    expect(result.duplicate).toBe(false);
    expect(result.resource.id).toBe(id);
    expect((await getResource(db, id))?.id).toBe(id);
  });

  it("is idempotent for the same capture ID and URL", async () => {
    const id = crypto.randomUUID();
    const first = await createResource(db, input("https://example.com/a?utm_source=x"), { id });
    const second = await createResource(db, input("https://example.com/a"), { id });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.resource.id).toBe(id);
    expect(await db.resources.count()).toBe(1);
  });

  it("refuses to rebind a capture ID to a different canonical URL", async () => {
    const id = crypto.randomUUID();
    await createResource(db, input("https://example.com/a"), { id });

    await expect(
      createResource(db, input("https://example.com/different"), { id }),
    ).rejects.toMatchObject({ code: "CONSTRAINT" });
    expect(await db.resources.count()).toBe(1);
  });

  it("dedups by canonical URL even when the capture ID is new", async () => {
    const first = await createResource(db, input("https://example.com/a"));
    const second = await createResource(db, input("https://example.com/a"), {
      id: crypto.randomUUID(),
    });

    expect(second.duplicate).toBe(true);
    expect(second.resource.id).toBe(first.resource.id);
    expect(await db.resources.count()).toBe(1);
  });

  it("create-or-gets tag names inside the resource transaction", async () => {
    const result = await createResourceWithMembers(
      db,
      input("https://example.com/tagged"),
      { tagNames: ["Reading List", "reading list", "  Design  "] },
      { id: crypto.randomUUID() },
    );

    const rows = await listResourceTags(db, result.resource.id);
    expect(rows).toHaveLength(2);
    expect((await findTagByName(db, "reading list"))?.usageCount).toBe(1);
    expect((await findTagByName(db, "design"))?.name).toBe("Design");
  });

  it("adds known collections and drops unknown membership ids", async () => {
    const { collection } = await createCollection(db, { name: "Known", parentId: null });

    const result = await createResourceWithMembers(
      db,
      input("https://example.com/members"),
      {
        collectionIds: [collection.id, crypto.randomUUID()],
        tagIds: [crypto.randomUUID()],
        tagNames: ["bridge"],
      },
      { id: crypto.randomUUID(), dropMissingMembers: true },
    );

    expect((await listCollectionMembers(db, collection.id)).map((r) => r.id)).toEqual([
      result.resource.id,
    ]);
    expect(await listResourceTags(db, result.resource.id)).toHaveLength(1);
  });

  it("still throws for an unknown collection when dropMissingMembers is off", async () => {
    await expect(
      createResourceWithMembers(db, input("https://example.com/strict"), {
        collectionIds: [crypto.randomUUID()],
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
    expect(await db.resources.count()).toBe(0);
  });
});
