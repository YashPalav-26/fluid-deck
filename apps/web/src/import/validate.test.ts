// @vitest-environment jsdom
/**
 * IMPORT-003 — validation, sanitization and caps. DOMPurify needs a DOM.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  collectionInputSchema,
  MAX_NAME_LENGTH,
  resourceInputSchema,
  tagSchema,
} from "@fluid-deck/core";
import {
  IMPORT_LIMITS,
  ImportValidationError,
  sanitizeBookmarkHtml,
  validateHtmlImport,
  validateRaindropImport,
} from "./validate";

const IMPORTS_DIR = path.resolve("e2e/fixtures/import");
const read = (...parts: string[]) => fs.readFileSync(path.join(IMPORTS_DIR, ...parts), "utf8");

const smallJson = read("raindrop", "small.json");
const malformedJson = read("raindrop", "malformed.json");
const chromeHtml = read("html", "chrome-bookmarks.html");

function expectError(run: () => unknown, code: ImportValidationError["code"]): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).code).toBe(code);
    return;
  }
  throw new Error(`expected ImportValidationError(${code})`);
}

describe("IMPORT-003: Raindrop validation", () => {
  it("validates the small fixture into strict, persistence-ready resources", () => {
    const result = validateRaindropImport(smallJson);
    expect(result.format).toBe("raindrop");
    expect(result.resources).toHaveLength(50);
    expect(result.collections).toHaveLength(3);
    expect(result.tags).toHaveLength(4);
    expect(result.warnings).toEqual([]);

    for (const resource of result.resources) {
      expect(resourceInputSchema.safeParse(resource.input).success).toBe(true);
      expect(resource.input).not.toHaveProperty("createdAt");
      expect(resource.input).not.toHaveProperty("collectionSourceIds");
      expect(resource.input).not.toHaveProperty("tags");
      expect(resource.input.source).toBe("import");
    }
    // Strict schema still rejects import-only metadata if it leaked back in.
    const first = result.resources[0];
    expect(first).toBeDefined();
    expect(resourceInputSchema.safeParse({ ...first!.input, createdAt: 1 }).success).toBe(false);
  });

  it("keeps import-only metadata beside the resource, not inside it", () => {
    const result = validateRaindropImport(smallJson);
    expect(result.resources[0]?.meta).toEqual({
      createdAt: Date.parse("2024-01-01T00:00:00.000Z"),
      collectionSourceIds: ["1"],
      tags: ["reading"],
    });
  });

  it("preserves nested collection parents and warns only at the approved depth", () => {
    const result = validateRaindropImport(smallJson);
    const byName = new Map(result.collections.map((collection) => [collection.name, collection]));
    expect(byName.get("Reading")?.parentSourceId).toBeNull();
    expect(byName.get("Development")?.parentSourceId).toBe("1");
    expect(result.warnings).toEqual([]);

    const deep = validateRaindropImport(
      JSON.stringify({
        items: [],
        collections: [
          { _id: 1, title: "L1" },
          { _id: 2, title: "L2", parent: { $id: 1 } },
          { _id: 3, title: "L3", parent: { $id: 2 } },
          { _id: 4, title: "L4", parent: { $id: 3 } },
        ],
      }),
    );
    expect(deep.collections).toHaveLength(4);
    expect(deep.warnings).toEqual([
      expect.objectContaining({ kind: "collection", reason: expect.stringContaining("nests 4+") }),
    ]);
  });

  it("normalizes tag identities and keeps the highest usage count", () => {
    const result = validateRaindropImport(
      JSON.stringify({
        items: [],
        tags: [
          { tag: "  AI   Tools ", count: 3 },
          { tag: "ai tools", count: 5 },
          { tag: "x".repeat(MAX_NAME_LENGTH + 1), count: 2 },
        ],
      }),
    );
    expect(result.tags).toEqual([{ name: "AI Tools", normalizedName: "ai tools", usageCount: 5 }]);
    expect(tagSchema.shape.normalizedName.safeParse(result.tags[0]?.normalizedName).success).toBe(
      true,
    );
    expect(result.warnings).toEqual([
      expect.objectContaining({ kind: "tag", reason: expect.stringContaining("tag rejected") }),
    ]);
  });

  it("drops unsafe URL schemes with warnings", () => {
    const result = validateRaindropImport(
      JSON.stringify({
        items: [
          { link: "javascript:alert(1)" },
          { link: "data:text/html,<script>alert(1)</script>" },
          { link: "file:///etc/passwd" },
          { link: "/relative" },
          { link: "https://safe.example/" },
        ],
      }),
    );
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.input.url).toBe("https://safe.example/");
    expect(result.warnings.filter((warning) => warning.kind === "resource")).toHaveLength(4);
  });

  it("stores HTML payloads from JSON as inert text (Zod only, never rendered)", () => {
    const payload = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
    const result = validateRaindropImport(
      JSON.stringify({
        items: [{ link: "https://text.example/", title: payload, description: payload }],
      }),
    );
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.input.title).toBe(payload);
    expect(result.resources[0]?.input.description).toBe(payload);
  });

  it("rejects oversized fields through the core schema", () => {
    const result = validateRaindropImport(
      JSON.stringify({
        items: [{ link: "https://long.example/", title: "x".repeat(8193) }],
      }),
    );
    expect(result.resources).toHaveLength(0);
    expect(result.warnings[0]?.reason).toContain("does not fit the resource schema");
  });

  it("rejects a file over the approved JSON byte cap", () => {
    expectError(
      () => validateRaindropImport(" ".repeat(IMPORT_LIMITS.raindrop.maxBytes + 1)),
      "file_too_large",
    );
  });

  it("accepts exactly the record cap and rejects one more", () => {
    const items = (count: number) => JSON.stringify({ items: Array(count).fill({ link: null }) });
    expect(validateRaindropImport(items(IMPORT_LIMITS.raindrop.maxRecords)).resources).toHaveLength(
      0,
    );
    expectError(
      () => validateRaindropImport(items(IMPORT_LIMITS.raindrop.maxRecords + 1)),
      "too_many_records",
    );
  });

  it("enforces the 20-level JSON depth limit on the exact boundary", () => {
    const nest = (depth: number) => {
      let value: unknown = "leaf";
      for (let index = 0; index < depth; index += 1) value = [value];
      return value;
    };
    const item = (depth: number) => ({
      items: [{ link: "https://depth.example/", junk: nest(depth) }],
    });

    expect(validateRaindropImport(JSON.stringify(item(16))).resources).toHaveLength(1);
    expectError(() => validateRaindropImport(JSON.stringify(item(17))), "json_too_deep");
  });

  it("strips prototype keys before parsing", () => {
    const result = validateRaindropImport(
      '{"items":[{"link":"https://proto.example/","__proto__":{"polluted":true}}]}',
    );
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(result.resources).toHaveLength(1);
  });

  it("reports invalid JSON and unsupported exports as deterministic errors", () => {
    expectError(() => validateRaindropImport("not json"), "invalid_json");
    expectError(() => validateRaindropImport("{}"), "unsupported_export");
    try {
      validateRaindropImport("not json");
    } catch (error) {
      expect((error as Error).message).toBe("Invalid Raindrop JSON: file is not valid JSON");
    }
  });

  it("keeps parser-level skips as warnings on the malformed fixture", () => {
    const result = validateRaindropImport(malformedJson);
    expect(result.resources).toHaveLength(4);
    expect(result.warnings).toHaveLength(7);
    expect(result.warnings.map((warning) => warning.reason)).toContain("duplicate canonical URL");
  });
});

describe("IMPORT-003: HTML validation", () => {
  it("strips scripts, event handlers and unsafe hrefs before parsing", () => {
    const sanitized = sanitizeBookmarkHtml(
      `<script>alert(1)</script><DT><A HREF="javascript:alert(1)" onclick="alert(1)">Bad</A>`,
    );
    expect(sanitized).not.toMatch(/script|javascript:|onclick/i);

    const result = validateHtmlImport(
      `<DL><p>Safe</p>
       <DT><A HREF="https://ok.example/" onclick="alert(1)">Ok</A>
       <DT><A HREF="javascript:alert(1)">Bad</A>
       </DL>
       <script>alert(1)</script>`,
    );
    expect(result.resources.map((resource) => resource.input.url)).toEqual(["https://ok.example/"]);
  });

  it("validates browser fixture resources and folders", () => {
    const result = validateHtmlImport(chromeHtml);
    expect(result.format).toBe("html");
    expect(result.resources).toHaveLength(10);
    expect(result.collections.map((collection) => collection.name)).toEqual([
      "Unorganized",
      "Development",
      "Design",
    ]);
    expect(result.warnings).toEqual([]);
    for (const resource of result.resources) {
      expect(resourceInputSchema.safeParse(resource.input).success).toBe(true);
      expect(resource.meta.tags).toEqual([]);
      expect(resource.meta.collectionSourceIds).toHaveLength(1);
    }
    // Folder membership follows the exported nested folder, not a flat list.
    const folderBySourceId = new Map(
      result.collections.map((collection) => [collection.sourceId, collection.name]),
    );
    const folderNames = result.resources.map((resource) =>
      folderBySourceId.get(resource.meta.collectionSourceIds[0] ?? ""),
    );
    expect(folderNames).toEqual([
      "Unorganized",
      "Unorganized",
      "Unorganized",
      "Unorganized",
      "Unorganized",
      "Development",
      "Development",
      "Development",
      "Design",
      "Design",
    ]);
    expect(collectionInputSchema.safeParse(result.collections[0]).success).toBe(false);
  });

  it("dedupes canonical URL variants and warns", () => {
    const result = validateHtmlImport(
      `<DL><p>Unorganized</p>
       <DT><A HREF="https://dup.example/page">One</A>
       <DT><A HREF="https://dup.example/page?utm_source=x">Two</A>
       </DL>`,
    );
    expect(result.resources).toHaveLength(1);
    expect(result.warnings).toEqual([
      expect.objectContaining({ kind: "resource", reason: "duplicate canonical URL" }),
    ]);
  });

  it("rejects a file over the approved HTML byte cap before parsing", () => {
    expectError(
      () => validateHtmlImport(" ".repeat(IMPORT_LIMITS.html.maxBytes + 1)),
      "file_too_large",
    );
  });

  it("rejects excessive HTML record counts before parsing", () => {
    const anchor = '<DT><A HREF="https://many.example/">x</A>';
    expectError(
      () => validateHtmlImport(anchor.repeat(IMPORT_LIMITS.html.maxRecords + 1)),
      "too_many_records",
    );
  });

  it("drops a resource whose field exceeds the core text cap", () => {
    const result = validateHtmlImport(
      `<DL><p>Unorganized</p><DT><A HREF="https://long.example/">${"x".repeat(8193)}</A></DL>`,
    );
    expect(result.resources).toHaveLength(0);
    expect(result.warnings[0]?.reason).toContain("resource rejected");
  });
});
