/**
 * UI-008 — inbox service: Dated returns createdAt-desc; Linked returns
 * only resources that belong to at least one collection.
 */
import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createResource } from "../repositories/resources.ts";
import { createCollection } from "../repositories/collections.ts";
import { addResourceToCollection } from "../repositories/relationships.ts";
import { getDatedResources, getLinkedResources } from "./inbox.ts";

const fixture = useTestDatabase();

function input(url: string, title: string) {
  return {
    url,
    title,
    description: "",
    thumbnailUrl: "",
    faviconUrl: "",
    type: "article" as const,
    source: "other" as const,
    notes: "",
    extractionStatus: "complete" as const,
    extractionNotes: [],
  };
}

describe("inbox service", () => {
  it("returns dated newest-first and linked only for collection members", async () => {
    const { collection } = await createCollection(fixture.db, { name: "Reading", parentId: null });
    const linked = await createResource(
      fixture.db,
      input("https://example.com/older", "Linked older"),
    );
    const dated = await createResource(fixture.db, input("https://example.com/newer", "Newer"));
    await addResourceToCollection(fixture.db, linked.resource.id, collection.id);

    const all = await getDatedResources(fixture.db);
    expect(all.map((r) => r.title)).toEqual(["Newer", "Linked older"]);
    expect(dated.resource.id).not.toBe(linked.resource.id);

    const linkedOnly = await getLinkedResources(fixture.db);
    expect(linkedOnly.map((r) => r.id)).toEqual([linked.resource.id]);
  });
});
