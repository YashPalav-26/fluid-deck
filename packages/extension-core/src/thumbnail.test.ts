/**
 * EXT-003 — thumbnail probe: 429 + Retry-After, cooldown, URL and content gates.
 * Deterministic: injected fetch, injected clock, no live image services.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_AFTER_MS,
  MAX_RETRY_AFTER_MS,
  MIN_RETRY_AFTER_MS,
  createThumbnailProbe,
  parseRetryAfter,
} from "./thumbnail.ts";

const IMAGE_URL = "https://cdn.example.com/cover.jpg";
const NOW = Date.parse("2026-01-01T00:00:00Z");

function response(init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status ?? 200;
  // `null` body is legal only for these statuses.
  const body = status === 204 || status === 205 || status === 304 ? null : "";
  return new Response(body, { status, headers: init.headers });
}

function imageOk(headers: Record<string, string> = {}): Response {
  return response({ headers: { "content-type": "image/jpeg; charset=binary", ...headers } });
}

function stubFetch(...responses: Array<Response | (() => Promise<Response>)>) {
  const mock = vi.fn<typeof fetch>();
  for (const item of responses) {
    mock.mockImplementationOnce(() =>
      typeof item === "function" ? item() : Promise.resolve(item),
    );
  }
  return mock;
}

function clock(start = NOW) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("30", NOW)).toBe(30_000);
  });

  it("floors delta-seconds at one second so a zero header cannot spin", () => {
    expect(parseRetryAfter("0", NOW)).toBe(MIN_RETRY_AFTER_MS);
  });

  it("caps delta-seconds so a hostile header cannot disable fetching for good", () => {
    expect(parseRetryAfter("999999999", NOW)).toBe(MAX_RETRY_AFTER_MS);
  });

  it("reads an HTTP-date as the remaining time", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", NOW)).toBe(30_000);
  });

  it("floors an HTTP-date already in the past at one second", () => {
    expect(parseRetryAfter("Wed, 31 Dec 2025 23:00:00 GMT", NOW)).toBe(MIN_RETRY_AFTER_MS);
  });

  it("returns undefined for a missing header", () => {
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter("", NOW)).toBeUndefined();
    expect(parseRetryAfter("   ", NOW)).toBeUndefined();
  });

  it("returns undefined for malformed values", () => {
    expect(parseRetryAfter("soon", NOW)).toBeUndefined();
    expect(parseRetryAfter("-5", NOW)).toBeUndefined();
    expect(parseRetryAfter("1.5", NOW)).toBeUndefined();
  });
});

describe("createThumbnailProbe", () => {
  it("rejects unsafe or relative image URLs without fetching", async () => {
    const fetchImpl = stubFetch();
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "file:///etc/passwd",
      "/relative.png",
      "",
    ]) {
      expect(await probe(url)).toEqual({ outcome: "invalid-url" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recognizes 429 and reports the Retry-After delta", async () => {
    const fetchImpl = stubFetch(response({ status: 429, headers: { "retry-after": "30" } }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({
      outcome: "rate-limited",
      status: 429,
      retryAfterMs: 30_000,
    });
  });

  it("falls back to the default delay when Retry-After is missing", async () => {
    const fetchImpl = stubFetch(response({ status: 429 }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({
      outcome: "rate-limited",
      status: 429,
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
    });
  });

  it("falls back to the default delay when Retry-After is malformed", async () => {
    const fetchImpl = stubFetch(response({ status: 429, headers: { "retry-after": "later" } }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({
      outcome: "rate-limited",
      status: 429,
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
    });
  });

  it("reads an HTTP-date Retry-After", async () => {
    const time = clock();
    const fetchImpl = stubFetch(
      response({ status: 429, headers: { "retry-after": "Thu, 01 Jan 2026 00:01:00 GMT" } }),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: time.now });

    expect(await probe(IMAGE_URL)).toEqual({
      outcome: "rate-limited",
      status: 429,
      retryAfterMs: 60_000,
    });
  });

  it("does not refetch while the cooldown is active, then resumes after it", async () => {
    const time = clock();
    const fetchImpl = stubFetch(
      response({ status: 429, headers: { "retry-after": "30" } }),
      imageOk(),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: time.now });

    expect(await probe(IMAGE_URL)).toMatchObject({ outcome: "rate-limited" });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "cooling-down", retryAfterMs: 30_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    time.advance(30_000);
    expect(await probe(IMAGE_URL)).toMatchObject({ outcome: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats the exact cooldown boundary as expired", async () => {
    const time = clock();
    const fetchImpl = stubFetch(
      response({ status: 429, headers: { "retry-after": "10" } }),
      imageOk(),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: time.now });

    await probe(IMAGE_URL);
    time.advance(10_000);
    expect(await probe(IMAGE_URL)).toMatchObject({ outcome: "ok" });
  });

  it("keeps cooldowns per URL", async () => {
    const fetchImpl = stubFetch(
      response({ status: 429, headers: { "retry-after": "30" } }),
      imageOk(),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    await probe(IMAGE_URL);
    expect(await probe("https://cdn.example.com/other.jpg")).toMatchObject({ outcome: "ok" });
  });

  it("does not classify other HTTP errors as rate limiting", async () => {
    const fetchImpl = stubFetch(response({ status: 404 }), response({ status: 500 }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "http-error", status: 404 });
    expect(await probe(IMAGE_URL)).toEqual({ outcome: "http-error", status: 500 });
  });

  it("accepts an image response and requests it without credentials or referrer", async () => {
    const fetchImpl = stubFetch(imageOk());
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "ok", status: 200 });

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("rejects a non-image content type", async () => {
    const fetchImpl = stubFetch(
      response({ headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "not-image", status: 200 });
  });

  it("rejects a declared size over the budget before reading the body", async () => {
    const fetchImpl = stubFetch(imageOk({ "content-length": "5000000" }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now, maxBytes: 1024 });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "too-large", status: 200 });
  });

  it("cancels the body instead of downloading the image", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel,
    });
    const fetchImpl = stubFetch(new Response(stream, { headers: { "content-type": "image/png" } }));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toMatchObject({ outcome: "ok" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline")));
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now });

    expect(await probe(IMAGE_URL)).toEqual({ outcome: "network-error" });
  });

  it("reports a timeout when the request outlives the budget", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const probe = createThumbnailProbe({ fetchImpl, now: clock().now, timeoutMs: 100 });

    const pending = probe(IMAGE_URL);
    await vi.advanceTimersByTimeAsync(100);

    expect(await pending).toEqual({ outcome: "timeout" });
  });
});
