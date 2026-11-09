/**
 * DB-007 — URL canonicalization (Phase 2.2 §2.4).
 *
 * Only the documented transformations happen here: trim/parse, lowercase scheme+host,
 * strip leading `www.`, drop the fragment, drop default ports, strip known tracking
 * params, sort the remaining params, normalize the root path to `/`.
 * Interior paths are never lowercased and no host aliasing is attempted.
 */

export class UrlNormalizationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UrlNormalizationError";
  }
}

/**
 * U4 exception list: hosts whose content lives in the URL fragment (hash-routed
 * SPAs). Fragments on these hosts are part of resource identity and are preserved.
 *
 * The mechanism is approved; the host *contents* were never specified in an
 * approved document, so the default list is empty and callers may supply one.
 * See DATABASE_IMPLEMENTATION_NOTES.md (U4 open item).
 */
export const HASH_ROUTE_EXCEPTION_HOSTS: readonly string[] = [];

const TRACKING_PARAM_PATTERNS: readonly RegExp[] = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_/i,
  /^igshid$/i,
  /^yclid$/i,
];

function isTrackingParam(name: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(name));
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isHashRouteHost(hostname: string, exceptions: readonly string[]): boolean {
  const host = stripWww(hostname.toLowerCase());
  return exceptions.some((entry) => {
    const allowed = stripWww(entry.toLowerCase());
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

export interface CanonicalizeOptions {
  /** Overrides `HASH_ROUTE_EXCEPTION_HOSTS` (tests, and future user settings). */
  hashRouteExceptionHosts?: readonly string[];
}

/**
 * Returns the canonical identity of an absolute http(s) URL.
 * @throws {UrlNormalizationError} for anything that is not an absolute http(s) URL.
 */
export function canonicalizeUrl(raw: string, options: CanonicalizeOptions = {}): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch (error) {
    throw new UrlNormalizationError(`Not an absolute URL: ${raw}`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlNormalizationError(`Unsupported URL scheme: ${url.protocol}`);
  }

  if (url.hostname === "") {
    throw new UrlNormalizationError(`URL has no host: ${raw}`);
  }

  url.hostname = stripWww(url.hostname);
  // Default ports are dropped by the URL parser on serialization.

  const exceptions = options.hashRouteExceptionHosts ?? HASH_ROUTE_EXCEPTION_HOSTS;
  if (!isHashRouteHost(url.hostname, exceptions)) {
    url.hash = "";
  }

  const kept = [...url.searchParams.entries()].filter(([name]) => !isTrackingParam(name));
  const sorted = new URLSearchParams();
  for (const [name, value] of kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted.append(name, value);
  }
  url.search = sorted.toString();

  // `URL` already serializes the root path as `/` and preserves interior path casing.
  return url.toString();
}

/** Lowercased hostname of a canonical URL, used for the `domain` index. */
export function extractDomain(canonicalUrl: string): string {
  try {
    return stripWww(new URL(canonicalUrl).hostname.toLowerCase());
  } catch (error) {
    throw new UrlNormalizationError(`Not an absolute URL: ${canonicalUrl}`, { cause: error });
  }
}
