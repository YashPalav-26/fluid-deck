// @vitest-environment jsdom
/**
 * IMPORT-008 - deterministic import -> persist -> export -> re-import fidelity.
 *
 * The semantic snapshot ignores ids, join-table rows and generated timestamps;
 * it compares what the user actually sees: URLs, text, memberships, tags and the
 * collection tree. HTML cannot carry notes/metadata (documented in the report),
 * so its assertions compare only the fields the format can represent.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resourceSchema, type Resource } from "@fluid-deck/core";
// fake-indexeddb must load before Dexie (db.ts) is evaluated.
import { useTestDatabase } from "../testing/database-fixture.ts";
import { FluidDeckDatabase } from "../persistence/db.ts";
import { createCollection } from "../repositories/collections.ts";
import { addResourceToCollection, addTagToResource } from "../repositories/relationships.ts";
import { createResource, softDeleteResource } from "../repositories/resources.ts";
import { createTag } from "../repositories/tags.ts";
import { exportHtml } from "../export/formats.ts";
import { exportJson } from "../export/json.ts";
import { commitImport, memoryCheckpointStore } from "./commit.ts";
import { previewImport } from "./preview.ts";
import { validateHtmlImport, validateRaindropImport } from "./validate.ts";

interface ResourceSnapshot {
  url: string;
  title: string;
  description: string;
  notes: string;
  type: string;
  thumbnailUrl: string;
  faviconUrl: string;
  tags: string[];
  collections: string[];
}

interface SemanticSnapshot {
  resources: ResourceSnapshot[];
  collections: Array<{ name: string; parent: string | null }>;
  tags: string[];
}

const fixture = useTestDatabase();
const opened: FluidDeckDatabase[] = [];

async function openDatabase(): Promise<FluidDeckDatabase> {
  const database = new FluidDeckDatabase(`fluid-deck-roundtrip-${crypto.randomUUID()}`);
  await database.open();
  opened.push(database);
  return database;
}

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await database.delete();
  }
});

/** Reads the persisted rows and normalizes them into comparable semantics. */
async function snapshot(database: FluidDeckDatabase): Promise<SemanticSnapshot> {
  const collections = await database.collections.toArray();
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const collectionIdsByResource = new Map<string, string[]>();
  for (const join of await database.resourceCollections.toArray()) {
    const list = collectionIdsByResource.get(join.resourceId) ?? [];
    list.push(join.collectionId);
    collectionIdsByResource.set(join.resourceId, list);
  }
  const tags = await database.tags.toArray();
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const tagNamesByResource = new Map<string, string[]>();
  for (const join of await database.resourceTags.toArray()) {
    const name = tagNameById.get(join.tagId);
    if (!name) continue;
    const list = tagNamesByResource.get(join.resourceId) ?? [];
    list.push(name);
    tagNamesByResource.set(join.resourceId, list);
  }

  const resources: ResourceSnapshot[] = [];
  for (const row of await database.resources.toArray()) {
    if (row.deletedAt !== null) continue;
    resources.push({
      url: row.url,
      title: row.title,
      description: row.description,
      notes: row.notes,
      type: row.type,
      thumbnailUrl: row.thumbnailUrl,
      faviconUrl: row.faviconUrl,
      tags: (tagNamesByResource.get(row.id) ?? []).sort(),
      collections: (collectionIdsByResource.get(row.id) ?? [])
        .map((id) => collectionById.get(id)?.name ?? "?")
        .sort(),
    });
  }
  resources.sort((a, b) => a.url.localeCompare(b.url));

  return {
    resources,
    collections: collections
      .map((collection) => ({
        name: collection.name,
        parent:
          collection.parentId === null
            ? null
            : (collectionById.get(collection.parentId)?.name ?? "?"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tags: tags.map((tag) => tag.name).sort(),
  };
}

/** Fields Netscape HTML can represent; everything else is a documented loss. */
function htmlFields(data: SemanticSnapshot): unknown {
  return {
    resources: data.resources.map((resource) => ({
      url: resource.url,
      title: resource.title,
      description: resource.description,
      tags: resource.tags,
      collections: resource.collections,
    })),
    collections: data.collections,
    tags: data.tags,
  };
}

async function seedLibrary(database: FluidDeckDatabase, multiMembership: boolean) {
  const dev = await createCollection(database, { name: "Dev", parentId: null });
  const tools = await createCollection(database, { name: "Tools", parentId: dev.collection.id });
  const reading = await createCollection(database, { name: "Reading", parentId: null });

  const alpha = await createResource(database, {
    url: "https://alpha.example/one?a=1&b=2",
    title: "Alpha & <Beta>",
    description: 'Line one\nLine "two" & more',
    notes: "Private note",
    thumbnailUrl: "https://cdn.example/alpha.png",
    faviconUrl: "https://alpha.example/favicon.ico",
    type: "article",
  });
  const beta = await createResource(database, {
    url: "https://beta.example/two",
    title: "Beta",
    type: "video",
  });

  const ai = await createTag(database, "AI Tools");
  const read = await createTag(database, "reading");
  await addTagToResource(database, alpha.resource.id, ai.tag.id);
  await addTagToResource(database, alpha.resource.id, read.tag.id);
  await addResourceToCollection(database, alpha.resource.id, tools.collection.id);
  if (multiMembership) {
    await addResourceToCollection(database, alpha.resource.id, reading.collection.id);
  }
  await addResourceToCollection(database, beta.resource.id, reading.collection.id);

  return { dev, tools, reading, alpha, beta };
}

describe("IMPORT-008: JSON round-trip", () => {
  it("preserves resources, text, multi-collection memberships, tags and the tree", async () => {
    const { db } = fixture;
    await seedLibrary(db, true);

    const exported = await exportJson(db, { kind: "all" });
    const json = await exported.blob.text();
    const validated = validateRaindropImport(json);
    expect(validated.warnings).toEqual([]);

    const alpha = validated.resources.find((resource) =>
      resource.input.url.includes("alpha.example"),
    );
    expect(alpha?.meta.collectionSourceIds).toHaveLength(2);
    expect(alpha?.meta.tags.sort()).toEqual(["AI Tools", "reading"]);

    const target = await openDatabase();
    const result = await commitImport(target, validated, {
      checkpointStore: memoryCheckpointStore(),
    });
    expect(result.created).toBe(2);
    expect(result.duplicates).toBe(0);

    expect(await snapshot(target)).toEqual(await snapshot(db));
  });

  it("keeps every membership through a repeated export/import cycle", async () => {
    const { db } = fixture;
    await seedLibrary(db, true);

    const first = await openDatabase();
    await commitImport(
      first,
      validateRaindropImport(await (await exportJson(db, { kind: "all" })).blob.text()),
      { checkpointStore: memoryCheckpointStore() },
    );
    const second = await openDatabase();
    await commitImport(
      second,
      validateRaindropImport(await (await exportJson(first, { kind: "all" })).blob.text()),
      { checkpointStore: memoryCheckpointStore() },
    );

    const alpha = (await snapshot(second)).resources.find((resource) =>
      resource.url.includes("alpha.example"),
    );
    expect(alpha?.collections).toEqual(["Reading", "Tools"]);
    expect(await snapshot(second)).toEqual(await snapshot(first));
  });

  it("imports a 600-resource export in two batches", async () => {
    const { db } = fixture;
    const rows = Array.from({ length: 600 }, (_, index) => {
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
      }) satisfies Resource;
    });
    await db.resources.bulkAdd(rows);

    const validated = validateRaindropImport(
      await (await exportJson(db, { kind: "all" })).blob.text(),
    );
    const target = await openDatabase();
    const result = await commitImport(target, validated, {
      checkpointStore: memoryCheckpointStore(),
    });

    expect(result.created).toBe(600);
    expect(result.batches).toBe(2);
    expect(await target.resources.count()).toBe(600);
    expect(await snapshot(target)).toEqual(await snapshot(db));
  });
});

describe("IMPORT-008: HTML round-trip", () => {
  it("preserves representable fields, nested folders, tags and descriptions", async () => {
    const { db } = fixture;
    await seedLibrary(db, false);

    const exported = await exportHtml(db, { kind: "all" });
    const validated = validateHtmlImport(await exported.blob.text());
    const alpha = validated.resources.find((resource) =>
      resource.input.url.includes("alpha.example"),
    );
    expect(alpha?.input.url).toBe("https://alpha.example/one?a=1&b=2");
    expect(alpha?.input.description).toBe('Line one\nLine "two" & more');
    expect(alpha?.meta.tags.sort()).toEqual(["AI Tools", "reading"]);

    const target = await openDatabase();
    await commitImport(target, validated, { checkpointStore: memoryCheckpointStore() });

    expect(htmlFields(await snapshot(target))).toEqual(htmlFields(await snapshot(db)));
    const importedAlpha = (await snapshot(target)).resources.find((resource) =>
      resource.url.includes("alpha.example"),
    );
    // Documented HTML losses: notes and metadata have no Netscape field.
    expect(importedAlpha?.notes).toBe("");
    expect(importedAlpha?.type).toBe("other");
  });

  it("decodes entities exactly once and keeps TAGS and <DD> intact", async () => {
    const result = validateHtmlImport(
      `<DL><p>Root &amp; More</p>
       <DT><A HREF="https://x.example/?a=1&amp;b=2" TAGS="one, two &amp; three">A &amp; B &amp;amp; &lt;tag&gt;</A>
       <DD>Desc &amp; more &#38; done
       </DL>`,
    );

    expect(result.collections.map((collection) => collection.name)).toContain("Root & More");
    const resource = result.resources[0];
    expect(resource?.input.url).toBe("https://x.example/?a=1&b=2");
    expect(resource?.input.title).toBe("A & B &amp; <tag>");
    expect(resource?.input.description).toBe("Desc & more & done");
    expect(resource?.meta.tags).toEqual(["one", "two & three"]);
  });
});

describe("IMPORT-008: conflicts and malformed input", () => {
  it("detects live and soft-deleted duplicates and applies explicit resolutions", async () => {
    const { db } = fixture;
    const live = await createResource(db, {
      url: "https://dup.example/",
      title: "Old title",
      description: "Old description",
    });
    const gone = await createResource(db, {
      url: "https://gone.example/",
      title: "Gone",
    });
    await softDeleteResource(db, gone.resource.id);
    const folder = await createCollection(db, { name: "Inbox", parentId: null });

    const validated = validateHtmlImport(
      `<DL><p>Inbox</p>
       <DT><A HREF="https://dup.example/">New title</A><DD>New description
       <DT><A HREF="https://gone.example/">Gone again</A>
       <DT><A HREF="https://fresh.example/">Fresh</A>
       </DL>`,
    );
    const preview = await previewImport(db, validated);
    expect(preview.counts.duplicates).toBe(2);

    const result = await commitImport(db, validated, {
      checkpointStore: memoryCheckpointStore(),
      defaultResolution: "skip",
      resolutions: new Map([
        ["https://dup.example/", "update"],
        ["https://gone.example/", "add-to-collections"],
      ]),
    });

    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.addedToCollections).toBe(1);

    const liveRow = await db.resources.get(live.resource.id);
    expect(liveRow?.title).toBe("New title");
    expect(liveRow?.description).toBe("New description");

    const goneRow = await db.resources.get(gone.resource.id);
    expect(goneRow?.deletedAt).not.toBeNull();
    const goneMembership = await db.resourceCollections
      .where("resourceId")
      .equals(gone.resource.id)
      .toArray();
    expect(goneMembership.map((join) => join.collectionId)).toEqual([folder.collection.id]);
  });

  it("rejects invalid JSON and keeps valid rows from a partially invalid payload", async () => {
    expect(() => validateRaindropImport("{not json")).toThrowError(/not valid JSON/);

    const partial = validateRaindropImport(
      JSON.stringify({
        items: [
          { link: "javascript:alert(1)", title: "Unsafe" },
          { link: "https://ok.example/", title: "Ok", tags: ["keep"], collectionId: 7 },
        ],
      }),
    );
    expect(partial.resources).toHaveLength(1);
    expect(partial.resources[0]?.input.url).toBe("https://ok.example/");
    expect(partial.resources[0]?.meta.tags).toEqual(["keep"]);
    expect(partial.warnings.map((warning) => warning.reason)).toContain(
      "item link is not an http(s) URL",
    );
  });

  it("keeps unsafe HTML links out of the import", () => {
    const result = validateHtmlImport(
      `<DL><p>Safe</p>
       <DT><A HREF="javascript:alert(1)">Bad</A>
       <DT><A HREF="&#106;avascript:alert(1)">Encoded bad</A>
       <DT><A HREF="https://ok.example/">Ok</A>
       </DL>`,
    );
    // Decoding happens before URL validation, so an entity-encoded scheme is still rejected.
    expect(result.resources.map((resource) => resource.input.url)).toEqual(["https://ok.example/"]);
  });
});
