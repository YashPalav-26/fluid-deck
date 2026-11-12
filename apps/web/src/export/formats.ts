/**
 * IMPORT-007 - HTML (Netscape), Markdown and CSV exports over the shared snapshot.
 *
 * All three read `export/source.ts`, so scope and soft-delete semantics match JSON.
 * Untrusted resource text is escaped per format; nothing is emitted as markup.
 * Output is built as Blob parts (one per resource/row) so a large library never
 * becomes a single concatenated string.
 *
 * Known format limits: HTML has one folder per bookmark, so a resource in several
 * collections is filed under its first membership (the TAGS attribute carries tags);
 * Netscape has no description/notes/thumbnail fields, so those do not round-trip.
 */
import type { Collection, Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import type { ExportFile, ExportScope, ExportSource } from "./source.ts";
import { exportFilename, loadExportSource } from "./source.ts";

export const FORMAT_VERSION = 1;

export interface FormatOptions {
  /** Off by default: a 10k library of thumbnail URLs bloats the file. */
  includeThumbnails?: boolean;
  /** Markdown only; ignored by HTML and CSV, which keep their fixed columns. */
  includeNotes?: boolean;
}

// --- HTML -------------------------------------------------------------------

/**
 * Text nodes: only `<`/`>` need entities. `&` stays raw because the IMPORT-001
 * parser does not decode entities, so `&amp;` would come back as literal text.
 */
function escapeHtmlText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute values: also quote-safe. `&` stays raw for the same round-trip reason. */
function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function seconds(timestamp: number): number {
  return Math.floor(timestamp / 1000);
}

function htmlLines(source: ExportSource): string[] {
  const byParent = new Map<string | null, Collection[]>();
  for (const collection of source.collections) {
    const siblings = byParent.get(collection.parentId) ?? [];
    siblings.push(collection);
    byParent.set(collection.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (a, b) =>
        a.orderIndex - b.orderIndex || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }

  const byCollection = new Map<string, Resource[]>();
  const root: Resource[] = [];
  for (const resource of source.resources) {
    const primary = source.collectionIds.get(resource.id)?.[0];
    if (primary === undefined) {
      root.push(resource);
      continue;
    }
    const members = byCollection.get(primary) ?? [];
    members.push(resource);
    byCollection.set(primary, members);
  }

  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. Do not edit. -->",
    `<!-- Fluid Deck export v${source.meta.version} - ${source.meta.exportedAt} - ${source.meta.resourceCount} resources -->`,
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Fluid Deck bookmarks</TITLE>",
    "<H1>Fluid Deck bookmarks</H1>",
    "<DL><p>",
  ];

  const bookmark = (resource: Resource, depth: number) => {
    const indent = "    ".repeat(depth);
    const tags = source.tagNames.get(resource.id) ?? [];
    const attributes = [
      `HREF="${escapeHtmlAttribute(resource.url)}"`,
      `ADD_DATE="${seconds(resource.createdAt)}"`,
      `LAST_MODIFIED="${seconds(resource.updatedAt)}"`,
      ...(tags.length > 0 ? [`TAGS="${escapeHtmlAttribute(tags.join(","))}"`] : []),
    ];
    const title = escapeHtmlText(resource.title || resource.url);
    lines.push(`${indent}<DT><A ${attributes.join(" ")}>${title}</A>`);
    if (resource.description) {
      lines.push(`${indent}<DD>${escapeHtmlText(resource.description)}`);
    }
  };

  const folder = (collection: Collection, depth: number) => {
    const indent = "    ".repeat(depth);
    lines.push(
      `${indent}<DT><H3 ADD_DATE="${seconds(collection.createdAt)}" LAST_MODIFIED="${seconds(collection.updatedAt)}">${escapeHtmlText(collection.name)}</H3>`,
    );
    lines.push(`${indent}<DL><p>`);
    for (const child of byParent.get(collection.id) ?? []) folder(child, depth + 1);
    for (const resource of byCollection.get(collection.id) ?? []) bookmark(resource, depth + 1);
    lines.push(`${indent}</DL><p>`);
  };

  for (const resource of root) bookmark(resource, 1);
  for (const collection of byParent.get(null) ?? []) folder(collection, 1);
  lines.push("</DL><p>");
  return lines;
}

export async function exportHtml(
  database: FluidDeckDatabase,
  scope: ExportScope,
  options: FormatOptions & { now?: number } = {},
): Promise<ExportFile> {
  const source = await loadExportSource(database, scope, {
    now: options.now,
    version: FORMAT_VERSION,
  });
  return {
    blob: new Blob(htmlLines(source), { type: "text/html;charset=utf-8" }),
    filename: exportFilename(source.meta, "html"),
    meta: source.meta,
  };
}

// --- Markdown ---------------------------------------------------------------

function escapeMarkdown(value: string): string {
  return value.replace(/\s+/g, " ").replace(/([\\`*_[\]<>#|])/g, "\\$1");
}

/** Angle-bracket link destinations only need the delimiters escaped. */
function markdownUrl(value: string): string {
  return value.replace(/[\\<>]/g, (character) => encodeURIComponent(character));
}

function markdownParts(source: ExportSource, options: FormatOptions): string[] {
  const parts: string[] = [
    "# Fluid Deck export\n",
    `Exported ${source.meta.resourceCount} resources on ${source.meta.exportedAt}.\n`,
  ];

  for (const resource of source.resources) {
    const title = resource.title || resource.url;
    const collections = (source.collectionIds.get(resource.id) ?? [])
      .map((id) => source.collections.find((collection) => collection.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const tags = source.tagNames.get(resource.id) ?? [];

    // JSON string literals are valid YAML double-quoted scalars, so untrusted text
    // cannot break out of the frontmatter block. Arrays stay JSON flow sequences.
    const quoted = (value: string) => JSON.stringify(value);
    const frontmatter: Array<[string, string]> = [
      ["id", quoted(resource.id)],
      ["title", quoted(resource.title)],
      ["url", quoted(resource.url)],
      ["canonicalUrl", quoted(resource.canonicalUrl)],
      ["description", quoted(resource.description)],
      ["domain", quoted(resource.domain)],
      ["type", quoted(resource.type)],
      ["source", quoted(resource.source)],
      ["extractionStatus", quoted(resource.extractionStatus)],
      ["extractionNotes", JSON.stringify(resource.extractionNotes)],
      ["collections", JSON.stringify(collections)],
      ["tags", JSON.stringify(tags)],
      ["createdAt", quoted(new Date(resource.createdAt).toISOString())],
      ["updatedAt", quoted(new Date(resource.updatedAt).toISOString())],
      [
        "lastOpenedAt",
        resource.lastOpenedAt === null
          ? "null"
          : quoted(new Date(resource.lastOpenedAt).toISOString()),
      ],
      ["faviconUrl", quoted(resource.faviconUrl)],
    ];
    if (options.includeThumbnails === true) {
      frontmatter.push(["thumbnailUrl", quoted(resource.thumbnailUrl)]);
    }
    if (options.includeNotes !== false) {
      frontmatter.push(["notes", quoted(resource.notes)]);
    }

    const lines = ["---\n"];
    for (const [key, value] of frontmatter) lines.push(`${key}: ${value}\n`);
    lines.push("---\n\n");
    lines.push(`## ${escapeMarkdown(title)}\n\n`);
    lines.push(`[${escapeMarkdown(title)}](<${markdownUrl(resource.url)}>)\n\n`);
    if (resource.description) lines.push(`${escapeMarkdown(resource.description)}\n\n`);
    if (options.includeThumbnails === true && resource.thumbnailUrl) {
      lines.push(`![${escapeMarkdown(title)}](<${markdownUrl(resource.thumbnailUrl)}>)\n\n`);
    }
    parts.push(lines.join(""));
  }
  return parts;
}

export async function exportMarkdown(
  database: FluidDeckDatabase,
  scope: ExportScope,
  options: FormatOptions & { now?: number } = {},
): Promise<ExportFile> {
  const source = await loadExportSource(database, scope, {
    now: options.now,
    version: FORMAT_VERSION,
  });
  return {
    blob: new Blob(markdownParts(source, options), { type: "text/markdown;charset=utf-8" }),
    filename: exportFilename(source.meta, "md"),
    meta: source.meta,
  };
}

// --- CSV --------------------------------------------------------------------

export const CSV_COLUMNS = [
  "resourceId",
  "url",
  "canonicalUrl",
  "title",
  "description",
  "type",
  "source",
  "collections",
  "tags",
  "createdAt",
  "updatedAt",
  "thumbnailUrl",
  "faviconUrl",
  "notes",
] as const;

/** Spreadsheet formula injection guard: `= + - @` and leading tab/CR. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function csvParts(source: ExportSource): string[] {
  const parts: string[] = [`${CSV_COLUMNS.join(",")}\r\n`];
  for (const resource of source.resources) {
    const collections = (source.collectionIds.get(resource.id) ?? [])
      .map((id) => source.collections.find((collection) => collection.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const row = [
      resource.id,
      resource.url,
      resource.canonicalUrl,
      resource.title,
      resource.description,
      resource.type,
      resource.source,
      collections.join(", "),
      (source.tagNames.get(resource.id) ?? []).join(", "),
      new Date(resource.createdAt).toISOString(),
      new Date(resource.updatedAt).toISOString(),
      resource.thumbnailUrl,
      resource.faviconUrl,
      resource.notes,
    ];
    parts.push(`${row.map(csvCell).join(",")}\r\n`);
  }
  return parts;
}

export async function exportCsv(
  database: FluidDeckDatabase,
  scope: ExportScope,
  options: FormatOptions & { now?: number } = {},
): Promise<ExportFile> {
  const source = await loadExportSource(database, scope, {
    now: options.now,
    version: FORMAT_VERSION,
  });
  return {
    blob: new Blob(csvParts(source), { type: "text/csv;charset=utf-8" }),
    filename: exportFilename(source.meta, "csv"),
    meta: source.meta,
  };
}
