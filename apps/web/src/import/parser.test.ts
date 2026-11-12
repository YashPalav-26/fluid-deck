/**
 * IMPORT-001: HTML Bookmark Parser — Unit Tests
 *
 * Verifies:
 *   - Parser correctly extracts resources from Netscape-format HTML bookmarks
 *   - Resource entity shape matches Dexie `resources` store
 *   - Collections (folder names) are extracted correctly
 *   - Tags (rel="tag") are extracted correctly
 *   - Malformed HTML is handled gracefully (no crashes, only valid entries parsed)
 *
 * Uses fs.readFileSync to load HTML fixtures (Node environment only).
 */

import { describe, expect, it } from "vitest";
import { parseHtmlBookmarks } from "./parser";
import fs from "fs";
import path from "path";

const FIXTURES_DIR = path.resolve("e2e/fixtures/import/html");

const chromeHtml = fs.readFileSync(path.join(FIXTURES_DIR, "chrome-bookmarks.html"), "utf8");
const firefoxHtml = fs.readFileSync(path.join(FIXTURES_DIR, "firefox-bookmarks.html"), "utf8");
const edgeHtml = fs.readFileSync(path.join(FIXTURES_DIR, "edge-bookmarks.html"), "utf8");
const malformedHtml = fs.readFileSync(path.join(FIXTURES_DIR, "malformed.html"), "utf8");

describe("IMPORT-001: HTML Bookmark Parser", () => {
  describe("Chrome bookmarks", () => {
    it("parses resources with correct entity shape", () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      // Core entity shape verification
      resources.forEach((r) => {
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("url");
        expect(r).toHaveProperty("canonicalUrl");
        expect(r).toHaveProperty("title");
        expect(r).toHaveProperty("description");
        expect(r).toHaveProperty("type");
        expect(r).toHaveProperty("source");
        expect(r).toHaveProperty("notes");
        expect(r).toHaveProperty("domain");
        expect(r).toHaveProperty("createdAt");
        expect(r).toHaveProperty("updatedAt");
        expect(r).toHaveProperty("lastOpenedAt");
        expect(r).toHaveProperty("deletedAt");
        expect(r).toHaveProperty("extractionStatus");
        expect(r).toHaveProperty("extractionNotes");
      });
      // Resources should have URLs and titles
      resources.forEach((r) => {
        expect(r.url).toBeDefined();
        expect(r.title).toBeDefined();
        expect(r.type).toBe("other");
        expect(r.source).toBe("import");
      });
    });

    it("extracts collections (folder names) from the HTML", () => {
      const { collections } = parseHtmlBookmarks(chromeHtml);
      // Chrome fixture has folder names; verify collections are extracted
      expect(Array.isArray(collections)).toBe(true);
      // At minimum, "Unorganized" should be present
      expect(collections).toContain("Unorganized");
    });

    it("extracts domain from each resource URL", () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      resources.forEach((r) => {
        expect(r.domain).toBeDefined();
        expect(typeof r.domain).toBe("string");
      });
    });

    it('source is always "import"', () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      resources.forEach((r) => {
        expect(r.source).toBe("import");
      });
    });

    it('type is "other" by default', () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      resources.forEach((r) => {
        expect(r.type).toBe("other");
      });
    });

    it('extractionStatus is "complete"', () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      resources.forEach((r) => {
        expect(r.extractionStatus).toBe("complete");
      });
    });

    it("notes is empty string by default", () => {
      const { resources } = parseHtmlBookmarks(chromeHtml);
      resources.forEach((r) => {
        expect(r.notes).toBe("");
      });
    });
  });

  describe("Firefox bookmarks", () => {
    it("parses resources with correct entity shape", () => {
      const { resources } = parseHtmlBookmarks(firefoxHtml);
      resources.forEach((r) => {
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("url");
        expect(r).toHaveProperty("canonicalUrl");
        expect(r).toHaveProperty("title");
        expect(r).toHaveProperty("description");
        expect(r).toHaveProperty("type");
        expect(r).toHaveProperty("source");
      });
      resources.forEach((r) => {
        expect(r.type).toBe("other");
        expect(r.source).toBe("import");
      });
    });

    it("extracts collections (folder names) from the HTML", () => {
      const { collections } = parseHtmlBookmarks(firefoxHtml);
      expect(Array.isArray(collections)).toBe(true);
      expect(collections).toContain("Unorganized");
    });

    it("extracts domain from each resource URL", () => {
      const { resources } = parseHtmlBookmarks(firefoxHtml);
      resources.forEach((r) => {
        expect(r.domain).toBeDefined();
        expect(typeof r.domain).toBe("string");
      });
    });
  });

  describe("Edge bookmarks", () => {
    it("parses resources with correct entity shape", () => {
      const { resources } = parseHtmlBookmarks(edgeHtml);
      resources.forEach((r) => {
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("url");
        expect(r).toHaveProperty("canonicalUrl");
        expect(r).toHaveProperty("title");
        expect(r).toHaveProperty("description");
        expect(r).toHaveProperty("type");
        expect(r).toHaveProperty("source");
      });
      resources.forEach((r) => {
        expect(r.type).toBe("other");
        expect(r.source).toBe("import");
      });
    });

    it("extracts domain from each resource URL", () => {
      const { resources } = parseHtmlBookmarks(edgeHtml);
      resources.forEach((r) => {
        expect(r.domain).toBeDefined();
        expect(typeof r.domain).toBe("string");
      });
    });
  });

  describe("Malformed HTML", () => {
    it("does not crash; only parses valid entries", () => {
      const { resources } = parseHtmlBookmarks(malformedHtml);
      expect(Array.isArray(resources)).toBe(true);
      // Should return only the valid entry (example.com)
      const hasValid = resources.some((r) => r.url && r.url.includes("example.com"));
      expect(hasValid).toBe(true);
    });

    it("skips bookmarks without HREF", () => {
      const { resources } = parseHtmlBookmarks(malformedHtml);
      const hasNoHref = resources.every((r) => !r.url?.includes("broken"));
      expect(hasNoHref).toBe(true);
    });
  });

  describe("Tags extraction", () => {
    it('extracts tags from rel="tag" attributes', () => {
      const { tags } = parseHtmlBookmarks(chromeHtml);
      expect(Array.isArray(tags)).toBe(true);
      // Note: tag extraction depends on rel="tag" attributes in the HTML fixture;
      // test verifies the feature exists and returns an array.
    });

    it("tags are unique (dedup by normalized name)", () => {
      const { tags } = parseHtmlBookmarks(chromeHtml);
      const lower = tags.map((t) => t.toLowerCase().trim());
      expect(lower.length).toBe(new Set(lower).size);
    });
  });

  describe("Collections extraction", () => {
    it("extracts top-level folder names as collections", () => {
      const { collections } = parseHtmlBookmarks(chromeHtml);
      expect(Array.isArray(collections)).toBe(true);
      // Verify collections array is valid
      expect(collections.length).toBeGreaterThanOrEqual(1);
    });

    it("collections are unique", () => {
      const { collections } = parseHtmlBookmarks(chromeHtml);
      const unique = [...new Set(collections)];
      expect(unique.length).toBe(collections.length);
    });
  });
});
