import { describe, expect, it } from "vitest";
import { canonicalizeUrl, extractDomain, UrlNormalizationError } from "./url.ts";

describe("canonicalizeUrl", () => {
  it("strips www, lowercases scheme and host, keeps path casing", () => {
    expect(canonicalizeUrl("HTTPS://WWW.Example.COM/Some/Path")).toBe(
      "https://example.com/Some/Path",
    );
  });

  it("drops the fragment", () => {
    expect(canonicalizeUrl("https://example.com/doc#section-2")).toBe("https://example.com/doc");
  });

  it("drops default ports", () => {
    expect(canonicalizeUrl("https://example.com:443/x")).toBe("https://example.com/x");
    expect(canonicalizeUrl("http://example.com:80/x")).toBe("http://example.com/x");
    expect(canonicalizeUrl("http://example.com:8080/x")).toBe("http://example.com:8080/x");
  });

  it("removes known tracking params and keeps everything else", () => {
    const result = canonicalizeUrl(
      "https://example.com/post?utm_source=news&utm_medium=email&fbclid=abc&gclid=1&msclkid=2&mc_cid=3&igshid=4&yclid=5&ref=hn",
    );
    expect(result).toBe("https://example.com/post?ref=hn");
  });

  it("sorts remaining params lexicographically", () => {
    expect(canonicalizeUrl("https://example.com/p?b=2&a=1&tab=readme")).toBe(
      "https://example.com/p?a=1&b=2&tab=readme",
    );
  });

  it("normalizes the root path to a trailing slash", () => {
    expect(canonicalizeUrl("https://example.com")).toBe("https://example.com/");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("does not merge distinct pages", () => {
    expect(canonicalizeUrl("https://example.com/a")).not.toBe(
      canonicalizeUrl("https://example.com/b"),
    );
    expect(canonicalizeUrl("https://example.com/A")).not.toBe(
      canonicalizeUrl("https://example.com/a"),
    );
  });

  it("preserves the fragment for hash-routed SPA exception hosts only", () => {
    const options = { hashRouteExceptionHosts: ["app.example"] };
    expect(canonicalizeUrl("https://app.example/#/doc/123", options)).toBe(
      "https://app.example/#/doc/123",
    );
    expect(canonicalizeUrl("https://docs.app.example/#/doc/123", options)).toBe(
      "https://docs.app.example/#/doc/123",
    );
    // Default list is empty: fragments are dropped (documented U4 precondition).
    expect(canonicalizeUrl("https://app.example/#/doc/123")).toBe("https://app.example/");
    expect(canonicalizeUrl("https://other.example/#/doc/123", options)).toBe(
      "https://other.example/",
    );
  });

  it("decodes IDN hosts to their ASCII form consistently", () => {
    expect(canonicalizeUrl("https://bücher.de/x")).toBe(
      canonicalizeUrl("https://xn--bcher-kva.de/x"),
    );
  });

  it("rejects non-http(s) and relative URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "file:///c:/x",
      "data:text/html,x",
      "/relative",
      "",
    ]) {
      expect(() => canonicalizeUrl(bad)).toThrow(UrlNormalizationError);
    }
  });
});

describe("extractDomain", () => {
  it("returns the lowercased hostname without www", () => {
    expect(extractDomain("https://WWW.Example.com/a")).toBe("example.com");
    expect(extractDomain("https://sub.example.com:8443/a")).toBe("sub.example.com");
  });
});
