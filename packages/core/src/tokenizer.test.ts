import { describe, expect, it } from "vitest";
import { SEARCH_FIELD_WEIGHTS, tokenize } from "./tokenizer.ts";

describe("tokenizer (SEARCH-001)", () => {
  it("returns [] for non-string or empty input", () => {
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(42)).toEqual([]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("NFC-normalizes and lowercases", () => {
    // composed vs decomposed e-acute
    const composed = "caf\u00E9";
    const decomposed = "cafe\u0301";
    expect(tokenize(composed)).toEqual(tokenize(decomposed));
    expect(tokenize("Hello WORLD")).toEqual(["hello", "world"]);
  });

  it("retains diacritics", () => {
    expect(tokenize("café résumé naïve")).toEqual(["café", "résumé", "naïve"]);
  });

  it("splits on punctuation and non-alphanumerics", () => {
    expect(tokenize("foo,bar;baz:qux")).toEqual(["foo", "bar", "baz", "qux"]);
    expect(tokenize("a.b c-d e_f")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("splits CamelCase and retains the joined token", () => {
    expect(tokenize("useState")).toEqual(["use", "state", "usestate"]);
    expect(tokenize("myVar")).toEqual(["my", "var", "myvar"]);
  });

  it("splits acronyms in CamelCase identifiers", () => {
    expect(tokenize("HTTPRequest")).toEqual(["http", "request", "httprequest"]);
    expect(tokenize("XMLParser")).toEqual(["xml", "parser", "xmlparser"]);
  });

  it("tokenizes URLs by splitting on / ? = & . - _", () => {
    expect(tokenize("github.com/foo/react-hooks")).toEqual([
      "github",
      "com",
      "foo",
      "react",
      "hooks",
    ]);
    expect(tokenize("https://example.com/path?q=react&tag=hooks")).toEqual([
      "https",
      "example",
      "com",
      "path",
      "q",
      "react",
      "tag",
      "hooks",
    ]);
  });

  it("keeps numbers attached to adjacent letters", () => {
    expect(tokenize("react18")).toEqual(["react18"]);
    expect(tokenize("v2.0.1")).toEqual(["v2", "0", "1"]);
  });

  it("removes no stop words and applies no stemming", () => {
    expect(tokenize("the a an is are running runs")).toEqual([
      "the",
      "a",
      "an",
      "is",
      "are",
      "running",
      "runs",
    ]);
  });

  it("deduplicates tokens preserving first occurrence", () => {
    expect(tokenize("react react React")).toEqual(["react"]);
  });

  it("handles mixed delimiters and CamelCase in one string", () => {
    expect(tokenize("myVar-123")).toEqual(["my", "var", "myvar", "123"]);
  });

  it("exports approved field weights", () => {
    expect(SEARCH_FIELD_WEIGHTS.title).toBe(3);
    expect(SEARCH_FIELD_WEIGHTS.tagsText).toBe(2);
    expect(SEARCH_FIELD_WEIGHTS.description).toBe(1);
    expect(SEARCH_FIELD_WEIGHTS.urlText).toBe(0.6);
    expect(SEARCH_FIELD_WEIGHTS.collectionsText).toBe(0.5);
    expect(SEARCH_FIELD_WEIGHTS.typeText).toBe(0.4);
  });
});
