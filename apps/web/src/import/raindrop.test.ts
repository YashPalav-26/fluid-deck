/**
 * IMPORT-002 — Raindrop.io JSON parser tests.
 *
 * Fixtures: e2e/fixtures/import/raindrop/{small,large,malformed}.json
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseRaindropJson, RaindropParseError } from "./raindrop";

const FIXTURES_DIR = path.resolve("e2e/fixtures/import/raindrop");
const read = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");

const smallJson = read("small.json");
const largeJson = read("large.json");
const malformedJson = read("malformed.json");

describe("IMPORT-002: Raindrop JSON parser", () => {
  describe("small export", () => {
    const result = parseRaindropJson(smallJson);

    it("parses 50 resources, 3 collections and 4 tags", () => {
      expect(result.resources).toHaveLength(50);
      expect(result.collections).toHaveLength(3);
      expect(result.tags).toHaveLength(4);
      expect(result.skipped).toHaveLength(0);
    });

    it("preserves the nested collection tree and order", () => {
      const reading = result.collections.find((collection) => collection.sourceId === "1");
      const development = result.collections.find((collection) => collection.sourceId === "2");
      const design = result.collections.find((collection) => collection.sourceId === "3");
      expect(reading).toMatchObject({ name: "Reading", parentSourceId: null, orderIndex: 0 });
      expect(development).toMatchObject({
        name: "Development",
        parentSourceId: "1",
        orderIndex: 1,
      });
      expect(design).toMatchObject({ name: "Design", parentSourceId: null, orderIndex: 2 });
    });

    it("maps metadata, description, notes, thumbnail, type and timestamp", () => {
      expect(result.resources[0]).toMatchObject({
        url: "https://example0.com/article/0",
        title: "Raindrop item 0",
        description: "Long description for item 0.\n\nExcerpt for item 0.",
        notes: "Note for item 0.",
        thumbnailUrl: "https://cdn.example0.com/cover.jpg",
        faviconUrl: "",
        type: "pdf",
        source: "import",
        extractionStatus: "complete",
        extractionNotes: [],
        createdAt: Date.parse("2024-01-01T00:00:00.000Z"),
        collectionSourceIds: ["1"],
        tags: ["reading"],
      });
      expect(result.resources[1]).toMatchObject({
        title: "Raindrop item 1",
        type: "article",
        thumbnailUrl: "",
        notes: "",
        collectionSourceIds: ["2"],
        tags: ["development", "design"],
      });
      expect(result.resources[1]?.createdAt).toBe(Date.parse("2024-01-02T00:00:00.000Z"));
    });

    it("parses tag usage counts from the export", () => {
      expect(result.tags).toEqual([
        { name: "reading", usageCount: 13 },
        { name: "development", usageCount: 13 },
        { name: "design", usageCount: 25 },
        { name: "reference", usageCount: 12 },
      ]);
    });

    it("emits resource inputs the core schema accepts", () => {
      for (const resource of result.resources) {
        expect(resource.url).toMatch(/^https?:\/\//);
        expect(resource.source).toBe("import");
        expect(resource.extractionStatus).toBe("complete");
        expect(Array.isArray(resource.extractionNotes)).toBe(true);
      }
    });
  });

  describe("large export", () => {
    const result = parseRaindropJson(largeJson);

    it("parses 500 resources, 12 collections and 10 tags", () => {
      expect(result.resources).toHaveLength(500);
      expect(result.collections).toHaveLength(12);
      expect(result.tags).toHaveLength(10);
      expect(result.skipped).toHaveLength(0);
    });

    it("preserves nested collection parents", () => {
      const byId = new Map(
        result.collections.map((collection) => [collection.sourceId, collection]),
      );
      expect(byId.get("1")?.parentSourceId).toBeNull();
      expect(byId.get("2")?.parentSourceId).toBe("1");
      expect(byId.get("5")?.parentSourceId).toBeNull();
      expect(byId.get("6")?.parentSourceId).toBe("5");
      expect(byId.get("12")?.parentSourceId).toBe("11");
    });
  });

  describe("malformed export", () => {
    const result = parseRaindropJson(malformedJson);

    it("keeps usable records and reports every skipped record", () => {
      expect(result.resources).toHaveLength(4);
      expect(result.collections).toHaveLength(1);
      expect(result.tags).toHaveLength(3);
      expect(result.skipped).toHaveLength(7);
      expect(result.skipped.filter((record) => record.kind === "resource")).toHaveLength(4);
      expect(result.skipped.filter((record) => record.kind === "collection")).toHaveLength(2);
      expect(result.skipped.filter((record) => record.kind === "tag")).toHaveLength(1);
    });

    it("dedupes by canonical URL and keeps the first record", () => {
      const links = result.resources.map((resource) => resource.url);
      expect(links).toEqual([
        "https://valid.example.com/first",
        "https://no-title.example.com/",
        "https://wrong-types.example.com/",
        "https://duplicate.example.com/page",
      ]);
      expect(
        result.skipped.some(
          (record) => record.kind === "resource" && record.reason === "duplicate canonical URL",
        ),
      ).toBe(true);
    });

    it("does not crash on wrong field types", () => {
      const wrongTypes = result.resources[2];
      expect(wrongTypes).toMatchObject({
        title: "",
        thumbnailUrl: "",
        tags: [],
        collectionSourceIds: [],
      });
      expect(wrongTypes?.createdAt).toBeUndefined();
    });

    it("preserves resource tags missing from the top-level list", () => {
      expect(result.tags).toEqual([
        { name: "good", usageCount: 2 },
        { name: "plain-tag", usageCount: 0 },
        { name: "nested", usageCount: 1 },
      ]);
      expect(result.resources[0]?.tags).toEqual(["good", "nested"]);
    });
  });

  describe("input shapes", () => {
    it("rejects invalid JSON with a stable error", () => {
      expect(() => parseRaindropJson("not json")).toThrow(RaindropParseError);
      expect(() => parseRaindropJson("not json")).toThrow(
        "Invalid Raindrop JSON: file is not valid JSON",
      );
    });

    it("rejects a file without an items array", () => {
      expect(() => parseRaindropJson(JSON.stringify({ foo: 1 }))).toThrow(
        "Unsupported Raindrop export: expected an items array",
      );
      expect(() => parseRaindropJson("null")).toThrow(RaindropParseError);
    });

    it("accepts a bare array of items", () => {
      const result = parseRaindropJson(
        JSON.stringify([{ link: "https://bare.example.com/", title: "Bare" }]),
      );
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]?.title).toBe("Bare");
      expect(result.collections).toHaveLength(0);
      expect(result.tags).toHaveLength(0);
    });

    it("returns an empty result for an empty export", () => {
      expect(parseRaindropJson(JSON.stringify({ items: [] }))).toEqual({
        resources: [],
        collections: [],
        tags: [],
        skipped: [],
      });
    });

    it("dedupes fragment variants and maps collectionId membership", () => {
      const result = parseRaindropJson(
        JSON.stringify({
          items: [
            { link: "https://example.com/page", title: "One", collectionId: 7 },
            { link: "https://example.com/page#section", title: "Two" },
          ],
        }),
      );
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]?.collectionSourceIds).toEqual(["7"]);
      expect(result.skipped).toEqual([
        {
          kind: "resource",
          index: 1,
          reason: "duplicate canonical URL",
          link: "https://example.com/page#section",
        },
      ]);
    });

    it("maps url, image object and created_at aliases", () => {
      const result = parseRaindropJson(
        JSON.stringify({
          items: [
            {
              url: "https://alias.example.com/",
              image: { src: "https://cdn.alias.example.com/cover.png" },
              created_at: "2023-05-06T07:08:09.000Z",
              ext: "video",
            },
          ],
        }),
      );
      expect(result.resources[0]).toMatchObject({
        url: "https://alias.example.com/",
        thumbnailUrl: "https://cdn.alias.example.com/cover.png",
        type: "video",
        createdAt: Date.parse("2023-05-06T07:08:09.000Z"),
      });
    });
  });
});
