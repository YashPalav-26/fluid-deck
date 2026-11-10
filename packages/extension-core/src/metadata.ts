/**
 * EXT-002 — metadata extraction (M1).
 *
 * Precedence is the approved fallback chain in SYSTEM_ARCHITECTURE §7:
 * Open Graph → Twitter Card → `<title>`/meta description/canonical/favicon →
 * URL-derived title. First hit wins per field; steps that miss fall through.
 * Step 4 (first `<img>`) is thumbnail work and belongs to EXT-003.
 *
 * Two acquire paths, one extractor:
 * - `readMetadata(document)` for the live page (content script / offscreen document).
 * - `extractMetadata(url)` for captures with no live DOM, with timeout, size and
 *   content-type guards. Every failure degrades to `fallbackMetadata`, never throws.
 *
 * Everything here treats the page as untrusted text: no script execution, no HTML
 * injection, http(s)-only URLs, size-capped fields.
 */
import {
  MAX_EXTRACTION_NOTES,
  MAX_TEXT_LENGTH,
  canonicalizeUrl,
  httpUrlSchema,
  type ExtractionStatus,
} from "@fluid-deck/core";

/** Fields EXT-002 can produce; `type` stays unset (rule-based detection is M3, CORE-side). */
export interface CaptureMetadata {
  title: string;
  description?: string;
  /** Display-only; the frozen R-2 draft has no site-name field. */
  siteName?: string;
  /** Canonicalized absolute http(s) URL, advisory (`canonicalUrlHint`). */
  canonicalUrl?: string;
  faviconUrl?: string;
  /** og:image / twitter:image; consumed as `thumbnailUrl` (EXT-003 owns fetching it). */
  imageUrl?: string;
  status: ExtractionStatus;
  /** Machine-readable degradation steps — never page content. */
  notes: string[];
}

export const EXTRACTION_TIMEOUT_MS = 5_000;
export const EXTRACTION_MAX_BYTES = 512 * 1024;

export interface ExtractMetadataOptions {
  fetchImpl?: typeof fetch;
  parseHtml?: (html: string) => Document | null;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Collapses whitespace, drops control characters, caps at the shared text limit. */
function clean(value: string | null | undefined): string | undefined {
  const text = value
    ?.replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function resolveUrl(raw: string | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const absolute = new URL(raw.trim(), base).href;
    return httpUrlSchema.safeParse(absolute).success ? absolute : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** Step 5: domain + path slug, so a title always exists. */
function deriveTitle(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    let slug: string | undefined;
    try {
      slug = decodeURIComponent(url.pathname).split("/").filter(Boolean).pop();
    } catch {
      slug = url.pathname.split("/").filter(Boolean).pop();
    }
    const words = clean(slug?.replace(/[-_]+/g, " "));
    return words ? `${host} — ${words}` : host || rawUrl.trim().slice(0, MAX_TEXT_LENGTH);
  } catch {
    return rawUrl.trim().slice(0, MAX_TEXT_LENGTH);
  }
}

function collectMeta(document: Document): Map<string, string> {
  const found = new Map<string, string>();
  for (const element of document.querySelectorAll("meta")) {
    const key = (element.getAttribute("property") ?? element.getAttribute("name") ?? "")
      .trim()
      .toLowerCase();
    const content = element.getAttribute("content");
    if (key && content && !found.has(key)) found.set(key, content);
  }
  return found;
}

function collectLinks(document: Document): { canonical?: string; icon?: string } {
  const links: { canonical?: string; icon?: string } = {};
  for (const element of document.querySelectorAll("link")) {
    const href = element.getAttribute("href");
    const rels = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (!href) continue;
    if (links.canonical === undefined && rels.includes("canonical")) links.canonical = href;
    if (links.icon === undefined && rels.includes("icon")) links.icon = href;
  }
  return links;
}

/** Pure DOM extraction — the approved mechanism (no network, no parsing library). */
export function readMetadata(document: Document, pageUrl: string): CaptureMetadata {
  const metas = collectMeta(document);
  const links = collectLinks(document);

  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = clean(metas.get(key));
      if (value) return value;
    }
    return undefined;
  };

  const pageTitle = clean(document.title);
  const ogTitle = pick("og:title");
  const twitterTitle = pick("twitter:title");
  const title = ogTitle ?? twitterTitle ?? pageTitle ?? deriveTitle(pageUrl);
  const titleFromUrl = !ogTitle && !twitterTitle && !pageTitle;

  const description = pick("og:description") ?? pick("twitter:description") ?? pick("description");
  const imageUrl =
    resolveUrl(pick("og:image", "og:image:url"), pageUrl) ??
    resolveUrl(pick("twitter:image", "twitter:image:src"), pageUrl);
  const siteName = pick("og:site_name") ?? hostOf(pageUrl);

  const rawCanonical = resolveUrl(pick("og:url"), pageUrl) ?? resolveUrl(links.canonical, pageUrl);
  // A page without a declared canonical is its own identity (canonicalized at enqueue).
  let canonicalUrl: string | undefined;
  try {
    canonicalUrl = canonicalizeUrl(rawCanonical ?? pageUrl);
  } catch {
    canonicalUrl = rawCanonical;
  }

  const notes: string[] = [];
  if (titleFromUrl) notes.push("title:url-derived");

  return {
    title,
    description,
    siteName,
    canonicalUrl,
    faviconUrl: resolveUrl(links.icon, pageUrl),
    imageUrl,
    status: !titleFromUrl && description && imageUrl ? "complete" : "partial",
    notes: notes.slice(0, MAX_EXTRACTION_NOTES),
  };
}

/** Predictable payload when there is no page to read: URL-derived title only. */
export function fallbackMetadata(pageUrl: string): CaptureMetadata {
  return {
    title: deriveTitle(pageUrl),
    siteName: hostOf(pageUrl),
    status: "failed",
    notes: [],
  };
}

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function isHtmlContentType(contentType: string | null): boolean {
  return contentType !== null && /^(text\/html|application\/xhtml\+xml)\b/i.test(contentType);
}

/**
 * Reads at most `maxBytes` and returns `null` as soon as the limit is crossed,
 * so oversized content never reaches the parser. Stream errors reject.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Fetch + parse one HTML document and extract its metadata. Never throws. */
export async function extractMetadata(
  pageUrl: string,
  options: ExtractMetadataOptions = {},
): Promise<CaptureMetadata> {
  const {
    fetchImpl = fetch,
    parseHtml = parseHtmlDocument,
    timeoutMs = EXTRACTION_TIMEOUT_MS,
    maxBytes = EXTRACTION_MAX_BYTES,
  } = options;

  const fail = (note: string): CaptureMetadata => ({
    ...fallbackMetadata(pageUrl),
    status: "failed",
    notes: [note],
  });

  if (!httpUrlSchema.safeParse(pageUrl).success) return fail("url:invalid");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(pageUrl, {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return fail(`fetch:http-${response.status}`);
    if (!isHtmlContentType(response.headers.get("content-type"))) {
      return fail("fetch:content-type");
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return fail("fetch:too-large");

    const body = await readBoundedText(response, maxBytes);
    if (body === null) return fail("fetch:too-large");
    if (!body.trim()) return fail("fetch:empty");

    const document = parseHtml(body);
    if (!document) return fail("parse:failed");

    // Redirected responses resolve relative metadata against the final URL.
    try {
      return readMetadata(document, response.url || pageUrl);
    } catch {
      return fail("extract:failed");
    }
  } catch {
    return fail(controller.signal.aborted ? "fetch:timeout" : "fetch:error");
  } finally {
    clearTimeout(timer);
  }
}
