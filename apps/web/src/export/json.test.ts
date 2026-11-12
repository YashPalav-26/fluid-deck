// @vitest-environment jsdom
/**
 * IMPORT-006 - JSON export against a real database (fake-indexeddb).
 * jsdom is needed for Blob/URL and because the Raindrop validator imports DOMPurify.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VIEW_STATE, resourceSchema, type Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { validateRaindropImport } from "../import/validate.ts";
import { createCollection } from "../repositories/collections.ts";
import { addResourceToCollection, addTagToResource } from "../repositories/relationships.ts";
import { createResource, softDeleteResource } from "../repositories/resources.ts";
import { createTag } from "../repositories/tags.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { EXPORT_CHUNK_SIZE, EXPORT_FORMAT_VERSION, exportJson } from "./json.ts";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

/** Only the fields these tests read; the file carries more. */
interface ExportedItem {
  _id: string;
  link: string;
  title: string;
  description: string;
  note: string;
  cover: string;
  faviconUrl: string;
  canonicalUrl: string;
  domain: string;
  type: string;
  source: string;
  extractionStatus: string;
  collectionIds: string[];
  collection: { $id: string } | null;
  tags: string[];
  created: string;
}

interface ExportedFile {
  result: boolean;
  version: number;
  exportedAt: string;
  resourceCount: number;
  truncated: boolean;
  items: ExportedItem[];
  collections: Array<{ _id: string; title: string; parent: { $id: string } | null; sort: number }>;
  tags: Array<{ _id: string; tag: string; count: number }>;
}

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

async function readJson(blob: Blob): Promise<ExportedFile> {
  return JSON.parse(await blob.text()) as ExportedFile;
}

function bulkRow(index: number): Resource {
  const url = `https://bulk.example/item-${index}`;
  return resourceSchema.parse({
    id: crypto.randomUUID(),
    url,
    canonicalUrl: url,
    title: `Item ${index}`,
    description: "",
    thumbnailUrl: "",
    faviconUrl: "",
    domain: "bulk.example",
    type: "article",
    source: "import",
    notes: "",
    extractionStatus: "complete",
    extractionNotes: [],
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index,
    lastOpenedAt: null,
    deletedAt: null,
  });
}

describe("IMPORT-006: JSON export", () => {
  it("exports every live resource with full fidelity, collections and tags", async () => {
    const dev = await createCollection(db, { name: "Dev", parentId: null });
    const tools = await createCollection(db, {
      name: "Tools",
      parentId: dev.collection.id,
    });
    const alpha = await createResource(db, {
      url: "https://alpha.example/one",
      title: "Alpha",
      description: "Alpha description",
      notes: "Alpha note",
      thumbnailUrl: "https://cdn.example/alpha.png",
      faviconUrl: "https://alpha.example/favicon.ico",
      type: "article",
      source: "import",
    });
    const beta = await createResource(db, {
      url: "https://beta.example/two",
      title: "Beta",
      type: "video",
    });
    const reading = await createTag(db, "reading");
    await addTagToResource(db, alpha.resource.id, reading.tag.id);
    await addResourceToCollection(db, alpha.resource.id, tools.collection.id);

    const exported = await exportJson(db, { kind: "all" }, { now: NOW });
    const data = await readJson(exported.blob);

    expect(exported.meta).toEqual({
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date(NOW).toISOString(),
      resourceCount: 2,
      truncated: false,
    });
    expect(exported.filename).toBe("fluid-deck-export-2026-11-12.json");
    expect(exported.blob.type).toBe("application/json");
    expect(data["result"]).toBe(true);
    expect(data["items"]).toHaveLength(2);

    const alphaItem = data["items"].find((item) => item.link === "https://alpha.example/one");
    expect(alphaItem).toMatchObject({
      _id: alpha.resource.id,
      link: "https://alpha.example/one",
      title: "Alpha",
      description: "Alpha description",
      note: "Alpha note",
      cover: "https://cdn.example/alpha.png",
      faviconUrl: "https://alpha.example/favicon.ico",
      canonicalUrl: alpha.resource.canonicalUrl,
      domain: "alpha.example",
      type: "article",
      source: "import",
      extractionStatus: "complete",
      collectionIds: [tools.collection.id],
      tags: ["reading"],
      created: new Date(alpha.resource.createdAt).toISOString(),
    });
    expect(data["items"].find((item) => item.link === "https://beta.example/two")).toMatchObject({
      type: "video",
      collectionIds: [],
      tags: [],
    });

    // Referenced folder plus its parent, so the tree survives a re-import.
    expect(data["collections"]).toHaveLength(2);
    expect(data["collections"].map((collection) => collection.title).sort()).toEqual([
      "Dev",
      "Tools",
    ]);
    expect(
      data["collections"].find((collection) => collection._id === tools.collection.id)?.parent,
    ).toEqual({ $id: dev.collection.id });
    expect(data["tags"]).toEqual([{ _id: reading.tag.id, tag: "reading", count: 1 }]);
    expect(beta.resource.id).toBeTruthy();
  });

  it("never exports soft-deleted resources, whatever the scope", async () => {
    const kept = await createResource(db, { url: "https://live.example/", title: "Live" });
    const deleted = await createResource(db, { url: "https://gone.example/", title: "Gone" });
    await softDeleteResource(db, deleted.resource.id);

    const all = await exportJson(db, { kind: "all" });
    expect(all.meta.resourceCount).toBe(1);

    const selected = await exportJson(db, {
      kind: "selected",
      resourceIds: [kept.resource.id, deleted.resource.id],
    });
    expect(selected.meta.resourceCount).toBe(1);
    expect(selected.meta.truncated).toBe(true);
    const data = await readJson(selected.blob);
    expect(data["items"].map((item) => item._id)).toEqual([kept.resource.id]);
  });

  it("exports only collection members and marks the file truncated", async () => {
    const members = await createCollection(db, { name: "Members", parentId: null });
    const inside = await createResource(db, { url: "https://in.example/", title: "In" });
    await createResource(db, { url: "https://out.example/", title: "Out" });
    await addResourceToCollection(db, inside.resource.id, members.collection.id);

    const exported = await exportJson(db, {
      kind: "collection",
      collectionId: members.collection.id,
    });
    const data = await readJson(exported.blob);

    expect(exported.meta).toMatchObject({ resourceCount: 1, truncated: true });
    expect(data["items"].map((item) => item.link)).toEqual(["https://in.example/"]);
    expect(data["collections"].map((collection) => collection._id)).toEqual([
      members.collection.id,
    ]);
  });

  it("exports a filtered view without the 500-card grid cap", async () => {
    const rows = Array.from({ length: EXPORT_CHUNK_SIZE * 2 + 1 }, (_, index) => bulkRow(index));
    await db.resources.bulkAdd(rows);

    const exported = await exportJson(db, {
      kind: "filter",
      view: { ...EMPTY_VIEW_STATE, type: "article" },
    });
    const data = await readJson(exported.blob);

    expect(exported.meta.resourceCount).toBe(EXPORT_CHUNK_SIZE * 2 + 1);
    expect(data["items"]).toHaveLength(EXPORT_CHUNK_SIZE * 2 + 1);
    // Chunk boundaries are stitched into one valid array.
    expect(data["items"][EXPORT_CHUNK_SIZE]?.title).toBe(`Item ${EXPORT_CHUNK_SIZE}`);
  });

  it("round-trips through the Raindrop validator", async () => {
    const folder = await createCollection(db, { name: "Reading", parentId: null });
    const saved = await createResource(db, {
      url: "https://roundtrip.example/article",
      title: "Round trip",
      description: "Kept",
      notes: "Notes kept",
      type: "article",
    });
    const tag = await createTag(db, "keep");
    await addTagToResource(db, saved.resource.id, tag.tag.id);
    await addResourceToCollection(db, saved.resource.id, folder.collection.id);

    const exported = await exportJson(db, { kind: "all" });
    const validated = validateRaindropImport(await exported.blob.text());

    expect(validated.resources).toHaveLength(1);
    expect(validated.resources[0]?.input).toMatchObject({
      url: "https://roundtrip.example/article",
      title: "Round trip",
      description: "Kept",
      notes: "Notes kept",
      type: "article",
    });
    expect(validated.resources[0]?.meta.collectionSourceIds).toEqual([folder.collection.id]);
    expect(validated.resources[0]?.meta.tags).toEqual(["keep"]);
    expect(validated.collections.map((collection) => collection.name)).toEqual(["Reading"]);
  });
});
