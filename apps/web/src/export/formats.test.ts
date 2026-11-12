// @vitest-environment jsdom
/**
 * IMPORT-007 - HTML/Markdown/CSV exports over the shared snapshot.
 * jsdom is needed for Blob and because HTML round-trip validation imports DOMPurify.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VIEW_STATE, resourceSchema, type Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { validateHtmlImport } from "../import/validate.ts";
import { createCollection } from "../repositories/collections.ts";
import { addResourceToCollection, addTagToResource } from "../repositories/relationships.ts";
import { createResource, softDeleteResource } from "../repositories/resources.ts";
import { createTag } from "../repositories/tags.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { CSV_COLUMNS, exportCsv, exportHtml, exportMarkdown } from "./formats.ts";
import { exportJson } from "./json.ts";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

/** RFC 4180 parser: enough to prove quoting/escaping round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" && text[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function seed() {
  const dev = await createCollection(db, { name: "Dev", parentId: null });
  const tools = await createCollection(db, { name: "Tools", parentId: dev.collection.id });
  const alpha = await createResource(db, {
    url: "https://alpha.example/one?a=1&b=2",
    title: '<script>alert("x")</script> & more',
    description: 'Line one\nLine "two", with comma',
    notes: "Private note",
    thumbnailUrl: "https://cdn.example/alpha.png",
  });
  const beta = await createResource(db, { url: "https://beta.example/two", title: "Beta" });
  const reading = await createTag(db, "reading");
  await addTagToResource(db, alpha.resource.id, reading.tag.id);
  await addResourceToCollection(db, alpha.resource.id, tools.collection.id);
  return { dev, tools, alpha, beta, reading };
}

describe("IMPORT-007: export formats", () => {
  it("exports Netscape HTML with hierarchy, escaping and no soft-deleted rows", async () => {
    const { dev, tools, alpha, beta } = await seed();
    const gone = await createResource(db, { url: "https://gone.example/", title: "Gone" });
    await softDeleteResource(db, gone.resource.id);

    const exported = await exportHtml(db, { kind: "all" }, { now: NOW });
    const html = await exported.blob.text();

    expect(exported.filename).toBe("fluid-deck-export-2026-11-12.html");
    expect(exported.blob.type).toBe("text/html;charset=utf-8");
    expect(exported.meta).toMatchObject({ resourceCount: 2, truncated: false });
    expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain('&lt;script&gt;alert("x")&lt;/script&gt; &amp; more');
    expect(html).toContain('HREF="https://alpha.example/one?a=1&amp;b=2"');
    expect(html).toContain('<DD>Line one\nLine "two", with comma');
    expect(html).toContain('TAGS="reading"');
    expect(html).not.toContain("https://gone.example/");

    // Beta has no collection: top level, before the first folder.
    expect(html.indexOf("https://beta.example/two")).toBeLessThan(html.indexOf(">Dev</H3>"));
    // Tools is nested inside Dev.
    const devAt = html.indexOf(">Dev</H3>");
    const toolsAt = html.indexOf(">Tools</H3>");
    expect(devAt).toBeLessThan(toolsAt);
    expect(html.slice(devAt, toolsAt)).toContain("<DL><p>");

    // Round-trip through our own HTML importer: resources plus folder membership.
    // Entities are decoded once, so `&` and escape-sensitive text come back intact.
    const imported = validateHtmlImport(html);
    expect(imported.resources.map((resource) => resource.input.url).sort()).toEqual([
      "https://alpha.example/one?a=1&b=2",
      "https://beta.example/two",
    ]);
    const importedAlpha = imported.resources.find((resource) =>
      resource.input.url.includes("alpha.example"),
    );
    expect(importedAlpha?.input.description).toBe('Line one\nLine "two", with comma');
    expect(importedAlpha?.meta.tags).toEqual(["reading"]);
    expect(imported.collections.map((collection) => collection.name)).toEqual(
      expect.arrayContaining(["Dev", "Tools", "Unorganized"]),
    );
    const alphaFolder = imported.resources.find((resource) =>
      resource.input.url.includes("alpha.example"),
    )?.meta.collectionSourceIds[0];
    expect(
      imported.collections.find((collection) => collection.sourceId === alphaFolder)?.name,
    ).toBe("Tools");
    expect(dev.collection.id).toBeTruthy();
    expect(tools.collection.id).toBeTruthy();
    expect(alpha.resource.id).toBeTruthy();
    expect(beta.resource.id).toBeTruthy();
  });

  it("writes a valid empty HTML file", async () => {
    const exported = await exportHtml(db, { kind: "all" }, { now: NOW });
    const html = await exported.blob.text();

    expect(exported.meta.resourceCount).toBe(0);
    expect(html).toContain("<DL><p>");
    expect(() => validateHtmlImport(html)).not.toThrow();
  });

  it("exports Markdown frontmatter and bodies with escaping and option gates", async () => {
    await seed();
    const exported = await exportMarkdown(db, { kind: "all" }, { now: NOW });
    const markdown = await exported.blob.text();

    expect(exported.filename).toBe("fluid-deck-export-2026-11-12.md");
    expect(exported.blob.type).toBe("text/markdown;charset=utf-8");
    expect(markdown).toContain("# Fluid Deck export");
    expect(markdown).toContain('title: "<script>alert(\\"x\\")</script> & more"');
    expect(markdown).toContain('description: "Line one\\nLine \\"two\\", with comma"');
    expect(markdown).toContain('notes: "Private note"');
    expect(markdown).toContain('tags: ["reading"]');
    expect(markdown).toContain('## \\<script\\>alert("x")\\</script\\> & more');
    expect(markdown).toContain("https://alpha.example/one?a=1&b=2");
    // Frontmatter is JSON-encoded, so hostile text cannot add keys.
    expect(markdown).not.toContain("\nmalicious:");

    const noNotes = await exportMarkdown(db, { kind: "all" }, { now: NOW, includeNotes: false });
    expect(await noNotes.blob.text()).not.toContain("notes:");

    const withImages = await exportMarkdown(
      db,
      { kind: "all" },
      { now: NOW, includeThumbnails: true },
    );
    const withImagesText = await withImages.blob.text();
    expect(withImagesText).toContain('thumbnailUrl: "https://cdn.example/alpha.png"');
    expect(withImagesText).toContain("![");
    expect(markdown).not.toContain('thumbnailUrl: "https://cdn.example/alpha.png"');
  });

  it("exports RFC 4180 CSV with quoting, formula guard and every core field", async () => {
    const { alpha, beta } = await seed();
    const formula = await createResource(db, {
      url: "https://formula.example/",
      title: "=2+3",
      description: "+SUM(A1:A2)",
    });

    const exported = await exportCsv(db, { kind: "all" }, { now: NOW });
    const text = await exported.blob.text();
    const rows = parseCsv(text);

    expect(exported.filename).toBe("fluid-deck-export-2026-11-12.csv");
    expect(exported.blob.type).toBe("text/csv;charset=utf-8");
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(4);

    const headers = rows[0]!;
    const alphaRow = rows.find((row) => row[headers.indexOf("resourceId")] === alpha.resource.id)!;
    expect(alphaRow[headers.indexOf("title")]).toBe('<script>alert("x")</script> & more');
    expect(alphaRow[headers.indexOf("description")]).toBe('Line one\nLine "two", with comma');
    expect(alphaRow[headers.indexOf("notes")]).toBe("Private note");
    expect(alphaRow[headers.indexOf("tags")]).toBe("reading");
    // Direct memberships only; the parent folder is a hierarchy fact, not a membership.
    expect(alphaRow[headers.indexOf("collections")]).toBe("Tools");
    expect(text).toContain('alert(""x"")');

    const formulaRow = rows.find(
      (row) => row[headers.indexOf("resourceId")] === formula.resource.id,
    )!;
    expect(formulaRow[headers.indexOf("title")]).toBe("'=2+3");
    expect(formulaRow[headers.indexOf("description")]).toBe("'+SUM(A1:A2)");
    expect(beta.resource.id).toBeTruthy();
  });

  it("exports an empty CSV as the header row only", async () => {
    const exported = await exportCsv(db, { kind: "all" }, { now: NOW });
    expect(await exported.blob.text()).toBe(`${CSV_COLUMNS.join(",")}\r\n`);
  });

  it("applies every scope without the 500-card grid cap", async () => {
    const folder = await createCollection(db, { name: "Bulk", parentId: null });
    const kept = await createResource(db, { url: "https://kept.example/", title: "Kept" });
    await addResourceToCollection(db, kept.resource.id, folder.collection.id);

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

    const filtered = await exportCsv(
      db,
      { kind: "filter", view: { ...EMPTY_VIEW_STATE, type: "article" } },
      { now: NOW },
    );
    expect(filtered.meta).toMatchObject({ resourceCount: 600, truncated: true });
    expect((await filtered.blob.text()).split("\r\n")).toHaveLength(602);

    const collection = await exportHtml(
      db,
      { kind: "collection", collectionId: folder.collection.id },
      { now: NOW },
    );
    expect(collection.meta.resourceCount).toBe(1);

    const selected = await exportMarkdown(
      db,
      { kind: "selected", resourceIds: [kept.resource.id, rows[0]!.id] },
      { now: NOW },
    );
    expect(selected.meta.resourceCount).toBe(2);

    const json = await exportJson(db, { kind: "all" }, { now: NOW });
    expect(json.meta.resourceCount).toBe(601);
  });

  it("is deterministic for a fixed clock", async () => {
    await seed();
    const first = await exportHtml(db, { kind: "all" }, { now: NOW });
    const second = await exportHtml(db, { kind: "all" }, { now: NOW });
    expect(await first.blob.text()).toBe(await second.blob.text());

    const markdown = await exportMarkdown(db, { kind: "all" }, { now: NOW });
    expect(await markdown.blob.text()).toContain(new Date(NOW).toISOString());
  });
});
