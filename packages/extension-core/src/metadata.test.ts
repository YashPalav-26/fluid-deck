// @vitest-environment jsdom
/**
 * EXT-002 — fixture-based extraction tests. Everything is deterministic: fixtures
 * instead of live sites, injected fetch, fake timers for the timeout path.
 */
import { describe, expect, it, vi } from "vitest";
import { captureDraftSchema, createCaptureDraft } from "./index.ts";
import {
  EXTRACTION_MAX_BYTES,
  extractMetadata,
  fallbackMetadata,
  readMetadata,
} from "./metadata.ts";

const PAGE = "https://example.com/docs/getting-started?utm_source=news#intro";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function read(html: string, url = PAGE) {
  return readMetadata(parse(html), url);
}

function htmlResponse(
  body: string,
  init: {
    url?: string;
    status?: number;
    contentType?: string | null;
    contentLength?: string;
  } = {},
): Response {
  const headers = new Headers();
  if (init.contentType !== null) {
    headers.set("content-type", init.contentType ?? "text/html; charset=utf-8");
  }
  if (init.contentLength) headers.set("content-length", init.contentLength);
  const response = new Response(body, { status: init.status ?? 200, headers });
  if (init.url) Object.defineProperty(response, "url", { value: init.url });
  return response;
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  return vi.fn<typeof fetch>(() =>
    typeof response === "function" ? response() : Promise.resolve(response),
  );
}

function streamResponse(
  chunks: Uint8Array[],
  init: {
    contentType?: string;
    contentLength?: string;
    cancel?: () => void;
    failAfter?: Error;
    /** Leaves the stream open, so `reader.cancel()` reaches the source. */
    open?: boolean;
  } = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (init.failAfter) controller.error(init.failAfter);
      else if (!init.open) controller.close();
    },
    cancel() {
      init.cancel?.();
    },
  });
  const headers = new Headers();
  headers.set("content-type", init.contentType ?? "text/html; charset=utf-8");
  if (init.contentLength) headers.set("content-length", init.contentLength);
  return new Response(stream, { headers });
}

const encoder = new TextEncoder();

describe("readMetadata — field precedence (SYSTEM_ARCHITECTURE §7)", () => {
  it("1. extracts the document title", () => {
    const metadata = read("<html><head><title>  Plain   page </title></head></html>");
    expect(metadata.title).toBe("Plain page");
    expect(metadata.notes).toEqual([]);
  });

  it("2. prefers Open Graph title and description", () => {
    const metadata = read(`
      <head>
        <title>Page title</title>
        <meta property="og:title" content="OG title">
        <meta property="og:description" content="OG description">
      </head>`);
    expect(metadata.title).toBe("OG title");
    expect(metadata.description).toBe("OG description");
  });

  it("3. falls back to the standard meta description", () => {
    const metadata = read(`
      <head>
        <meta property="og:title" content="OG title">
        <meta name="description" content="Standard description">
      </head>`);
    expect(metadata.description).toBe("Standard description");
  });

  it("4. extracts the site name, then the host", () => {
    expect(read(`<meta property="og:site_name" content="Example Docs">`).siteName).toBe(
      "Example Docs",
    );
    expect(read("<title>x</title>", "https://www.example.com/a").siteName).toBe("example.com");
  });

  it("5. handles the canonical URL: og:url wins, then link[rel=canonical], canonicalized", () => {
    const both = read(`
      <meta property="og:url" content="https://www.example.com/article?utm_source=x&b=2&a=1#frag">
      <link rel="canonical" href="https://example.com/other">`);
    expect(both.canonicalUrl).toBe("https://example.com/article?a=1&b=2");

    const linkOnly = read(`<link rel="canonical" href="/article">`);
    expect(linkOnly.canonicalUrl).toBe("https://example.com/article");
  });

  it("6. extracts a favicon and resolves it against the page", () => {
    expect(read(`<link rel="shortcut icon" href="/favicon.png">`).faviconUrl).toBe(
      "https://example.com/favicon.png",
    );
    expect(read(`<link rel="icon" href="javascript:alert(1)">`).faviconUrl).toBeUndefined();
  });

  it("7. missing metadata degrades to a URL-derived title", () => {
    const metadata = read("<html><body><p>no head</p></body></html>");
    expect(metadata.title).toBe("example.com — getting started");
    expect(metadata.description).toBeUndefined();
    expect(metadata.status).toBe("partial");

    const fallback = fallbackMetadata(PAGE);
    expect(fallback.title).toBe("example.com — getting started");
    expect(fallback.status).toBe("failed");
  });

  it("8. conflicting sources follow Open Graph → Twitter → document", () => {
    const metadata = read(`
      <title>Document title</title>
      <meta name="twitter:title" content="Twitter title">
      <meta name="twitter:description" content="Twitter description">
      <meta name="description" content="Standard description">
      <meta property="og:title" content="OG title">`);
    expect(metadata.title).toBe("OG title");
    expect(metadata.description).toBe("Twitter description");
  });

  it("9. survives malformed HTML", () => {
    const metadata = read(`
      <html><head><title>Broken <b>markup</title>
      <meta property="og:description" content="desc"
      <p>unclosed <div><span>`);
    expect(metadata.title).toContain("Broken");
    expect(metadata.description).toBe("desc");
    expect(metadata.status).not.toBe("failed");
  });

  it("11. drops unsafe metadata URLs instead of returning them", () => {
    const metadata = read(`
      <title>Safe</title>
      <meta property="og:image" content="javascript:alert(1)">
      <meta property="og:url" content="file:///etc/passwd">
      <link rel="canonical" href="data:text/html,hi">
      <link rel="icon" href="blob:https://example.com/abc">`);
    expect(metadata.imageUrl).toBeUndefined();
    // Declared canonical dropped; the page URL is its own identity.
    expect(metadata.canonicalUrl).toBe("https://example.com/docs/getting-started");
    expect(metadata.faviconUrl).toBeUndefined();
    expect(metadata.title).toBe("Safe");
  });
});

describe("extractMetadata — network and document guards", () => {
  it("10. rejects non-http(s) page URLs without touching the network", async () => {
    const fetchImpl = stubFetch(htmlResponse("<title>x</title>"));
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "nope"]) {
      const metadata = await extractMetadata(url, { fetchImpl });
      expect(metadata.status).toBe("failed");
      expect(metadata.notes).toEqual(["url:invalid"]);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("12. falls back on HTTP error responses", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse("nope", { status: 404 })),
    });
    expect(metadata.status).toBe("failed");
    expect(metadata.notes).toEqual(["fetch:http-404"]);
    expect(metadata.title).toBe("example.com — getting started");
  });

  it("13. falls back on network failure", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(() => Promise.reject(new TypeError("network down"))),
    });
    expect(metadata.notes).toEqual(["fetch:error"]);
    expect(metadata.title).not.toBe("");
  });

  it("14. falls back on a request timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const pending = extractMetadata(PAGE, { fetchImpl, timeoutMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      const metadata = await pending;
      expect(metadata.notes).toEqual(["fetch:timeout"]);
      expect(metadata.status).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("15. falls back on an empty body", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse("   ")),
    });
    expect(metadata.notes).toEqual(["fetch:empty"]);
  });

  it("16. rejects unsupported content types", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse('{"title":"nope"}', { contentType: "application/json" })),
    });
    expect(metadata.notes).toEqual(["fetch:content-type"]);
  });

  it("17. rejects oversized responses (declared and actual)", async () => {
    const declared = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(
        htmlResponse("<title>x</title>", { contentLength: String(EXTRACTION_MAX_BYTES + 1) }),
      ),
    });
    expect(declared.notes).toEqual(["fetch:too-large"]);

    const actual = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse("a".repeat(EXTRACTION_MAX_BYTES + 1))),
    });
    expect(actual.notes).toEqual(["fetch:too-large"]);
  });

  it("18. resolves metadata against the final URL after a redirect", async () => {
    const metadata = await extractMetadata("http://old.example.com/page", {
      fetchImpl: stubFetch(
        htmlResponse(
          `<title>Moved</title>
           <meta property="og:title" content="Moved page">
           <meta property="og:description" content="After redirect">
           <meta property="og:image" content="/img/cover.png">
           <link rel="canonical" href="/final">`,
          { url: "https://new.example.com/docs/final" },
        ),
      ),
    });
    expect(metadata.title).toBe("Moved page");
    expect(metadata.imageUrl).toBe("https://new.example.com/img/cover.png");
    expect(metadata.canonicalUrl).toBe("https://new.example.com/final");
  });

  it("uses the injected parser and fails closed when no parser exists", async () => {
    const parseHtml = vi.fn(() => parse("<title>Injected</title>"));
    const parsed = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse("<html></html>")),
      parseHtml,
    });
    expect(parsed.title).toBe("Injected");
    expect(parseHtml).toHaveBeenCalledOnce();

    const unparsed = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(htmlResponse("<html></html>")),
      parseHtml: () => null,
    });
    expect(unparsed.notes).toEqual(["parse:failed"]);
  });
});

describe("streaming size enforcement", () => {
  const prefix = "<title>Exact</title>";

  it("parses a response below the limit and exactly at the limit", async () => {
    const below = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(streamResponse([encoder.encode("<title>Small</title>")])),
    });
    expect(below.title).toBe("Small");
    expect(below.notes).toEqual([]);

    const exactBody = prefix + "a".repeat(EXTRACTION_MAX_BYTES - prefix.length);
    expect(encoder.encode(exactBody).byteLength).toBe(EXTRACTION_MAX_BYTES);
    const exact = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(
        streamResponse([
          encoder.encode(exactBody.slice(0, 1024)),
          encoder.encode(exactBody.slice(1024)),
        ]),
      ),
    });
    expect(exact.title).toBe("Exact");
    expect(exact.status).not.toBe("failed");
  });

  it("rejects a stream that exceeds the limit, even without content-length", async () => {
    const chunk = new Uint8Array(300_000).fill(97);
    const cancel = vi.fn();
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(streamResponse([chunk, chunk], { cancel, open: true })),
    });
    expect(metadata.notes).toEqual(["fetch:too-large"]);
    expect(metadata.status).toBe("failed");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("ignores a misleading content-length and still bounds the body", async () => {
    const chunk = new Uint8Array(400_000).fill(97);
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(streamResponse([chunk, chunk], { contentLength: "10" })),
    });
    expect(metadata.notes).toEqual(["fetch:too-large"]);
  });

  it("never hands oversized content to the parser", async () => {
    const parseHtml = vi.fn(() => parse("<title>nope</title>"));
    const chunk = new Uint8Array(300_000).fill(97);
    await extractMetadata(PAGE, {
      fetchImpl: stubFetch(streamResponse([chunk, chunk])),
      parseHtml,
    });
    expect(parseHtml).not.toHaveBeenCalled();
  });

  it("returns the safe fallback on stream failure", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(
        streamResponse([encoder.encode("<title>x</title>")], {
          failAfter: new Error("stream boom"),
        }),
      ),
    });
    expect(metadata.notes).toEqual(["fetch:error"]);
    expect(metadata.title).toBe("example.com — getting started");
  });

  it("returns fetch:timeout when aborted mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
          },
        });
        const headers = new Headers({ "content-type": "text/html" });
        return Promise.resolve(new Response(stream, { headers }));
      });
      const pending = extractMetadata(PAGE, { fetchImpl, timeoutMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      const metadata = await pending;
      expect(metadata.notes).toEqual(["fetch:timeout"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("capture draft integration", () => {
  it("19. invalid metadata never breaks a valid capture", () => {
    const metadata = read(`
      <title>Valid title</title>
      <meta property="og:image" content="data:image/png;base64,AAA">
      <link rel="canonical" href="javascript:void(0)">`);
    const draft = createCaptureDraft({
      url: "https://example.com/a",
      metadata,
      captureId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      capturedAt: 1_700_000_000_000,
    });
    expect(draft.title).toBe("Valid title");
    expect(draft.thumbnailUrl).toBeUndefined();
    expect(draft.canonicalUrlHint).toBe("https://example.com/docs/getting-started");
  });

  it("20. the final payload passes the shared Zod contract", async () => {
    const metadata = await extractMetadata(PAGE, {
      fetchImpl: stubFetch(
        htmlResponse(
          `<meta property="og:title" content="Contract page">
           <meta property="og:description" content="Validated end to end">
           <meta property="og:image" content="https://cdn.example.com/i.png">
           <meta property="og:site_name" content="Example">
           <link rel="icon" href="/favicon.ico">`,
        ),
      ),
    });
    const draft = createCaptureDraft({
      url: PAGE,
      metadata,
      captureId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      capturedAt: 1_700_000_000_000,
    });
    expect(captureDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft).toMatchObject({
      source: "extension",
      title: "Contract page",
      description: "Validated end to end",
      thumbnailUrl: "https://cdn.example.com/i.png",
      faviconUrl: "https://example.com/favicon.ico",
      canonicalUrlHint: "https://example.com/docs/getting-started",
    });
  });
});
