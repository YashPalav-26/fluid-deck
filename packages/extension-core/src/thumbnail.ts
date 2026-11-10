/**
 * EXT-003 — thumbnail availability probe (M2).
 *
 * The card owns placeholder rendering; this module owns one question: can the
 * captured `imageUrl` be shown? It fetches headers only (the body is cancelled),
 * and it remembers 429 cooldowns in memory so a rate-limited host is not hit
 * again for the retry window.
 *
 * Deliberately small: no background service, no persisted queue, no scheduler.
 * Cooldowns live for the session and are keyed by exact URL.
 */
import { httpUrlSchema } from "@fluid-deck/core";

export const THUMBNAIL_TIMEOUT_MS = 5_000;
/** Declared-size gate; the body is never downloaded, so this is a sanity bound. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const MIN_RETRY_AFTER_MS = 1_000;
export const DEFAULT_RETRY_AFTER_MS = 60_000;
/** Hostile or mistaken headers cannot suppress a host for longer than a day. */
export const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1_000;

export type ThumbnailOutcome =
  | "ok"
  | "invalid-url"
  | "cooling-down"
  | "rate-limited"
  | "http-error"
  | "not-image"
  | "too-large"
  | "timeout"
  | "network-error";

export interface ThumbnailProbeResult {
  outcome: ThumbnailOutcome;
  status?: number;
  /** Present for rate limiting and cooldown: how long until a retry is allowed. */
  retryAfterMs?: number;
}

export interface ThumbnailProbeOptions {
  fetchImpl?: typeof fetch;
  /** Injected clock (epoch ms) so cooldowns are testable. */
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  /** Shared cooldown state; pass one to reuse it, omit for a session-local map. */
  cooldowns?: Map<string, number>;
}

export type ThumbnailProbe = (url: string) => Promise<ThumbnailProbeResult>;

function clampRetryAfter(ms: number): number {
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, Math.round(ms)));
}

/**
 * Parses `Retry-After` (delta-seconds or HTTP-date) into a bounded delay.
 * `undefined` means "no usable header" — the caller applies its own default.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  if (/^\d+$/.test(raw)) {
    return clampRetryAfter(Number.parseInt(raw, 10) * 1_000);
  }

  // Anything starting with a digit or sign is not an HTTP-date (delta-seconds
  // was already handled); `Date.parse("-5")` would otherwise invent a year.
  if (/^[+-]?\d/.test(raw)) return undefined;

  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return undefined;
  return clampRetryAfter(date - nowMs);
}

function isImageContentType(contentType: string | null): boolean {
  return contentType !== null && /^image\//i.test(contentType);
}

/**
 * Creates a probe bound to one fetch implementation and one clock. Every call
 * resolves — failures are outcomes, never throws.
 */
export function createThumbnailProbe(options: ThumbnailProbeOptions = {}): ThumbnailProbe {
  const {
    fetchImpl = fetch,
    now = Date.now,
    timeoutMs = THUMBNAIL_TIMEOUT_MS,
    maxBytes = THUMBNAIL_MAX_BYTES,
    cooldowns = new Map<string, number>(),
  } = options;

  return async (url) => {
    if (!httpUrlSchema.safeParse(url).success) return { outcome: "invalid-url" };

    const startedAt = now();
    const until = cooldowns.get(url);
    if (until !== undefined && startedAt < until) {
      return { outcome: "cooling-down", retryAfterMs: until - startedAt };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancelBody = (result: Response) => result.body?.cancel().catch(() => undefined);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: { accept: "image/*" },
      });
    } catch {
      return { outcome: controller.signal.aborted ? "timeout" : "network-error" };
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      const retryAfterMs =
        parseRetryAfter(response.headers.get("retry-after"), startedAt) ?? DEFAULT_RETRY_AFTER_MS;
      cooldowns.set(url, startedAt + retryAfterMs);
      await cancelBody(response);
      return { outcome: "rate-limited", status: 429, retryAfterMs };
    }

    if (!response.ok) {
      await cancelBody(response);
      return { outcome: "http-error", status: response.status };
    }

    if (!isImageContentType(response.headers.get("content-type"))) {
      await cancelBody(response);
      return { outcome: "not-image", status: response.status };
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await cancelBody(response);
      return { outcome: "too-large", status: response.status };
    }

    // Availability check only: never download the image here.
    await cancelBody(response);
    return { outcome: "ok", status: response.status };
  };
}
