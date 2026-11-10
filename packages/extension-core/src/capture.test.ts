// @vitest-environment jsdom
/**
 * EXT-005 - capture service tests.
 *
 * A trigger (context menu, keyboard command, popup button) supplies nothing but
 * the tab URL and its own name. One shared pipeline behind every trigger:
 * everything is injected
 * (extraction, enqueue, clock, id) so each case is deterministic; one case uses
 * the real EXT-002 extractor with a fixture response to prove the reuse.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_TRIGGERS,
  createCaptureService,
  isCaptureMetadata,
  type CaptureResult,
} from "./capture.ts";
import type { CaptureMetadata } from "./metadata.ts";
import { extractMetadata, fallbackMetadata } from "./metadata.ts";
import { OutboxMachine, type OutboxRecord, type OutboxStorage } from "./outbox.ts";
import { captureDraftSchema } from "./index.ts";

const PAGE = "https://example.com/docs/getting-started";
const NOW = 1_700_000_000_000;

function metadata(overrides: Partial<CaptureMetadata> = {}): CaptureMetadata {
  return {
    title: "Fixture title",
    description: "Fixture description",
    canonicalUrl: "https://example.com/docs/getting-started",
    faviconUrl: "https://example.com/favicon.ico",
    imageUrl: "https://cdn.example.com/thumb.png",
    status: "complete",
    notes: [],
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof createCaptureService>[0]> = {}) {
  const entries: Array<{ captureId: string; payload: Record<string, unknown> }> = [];
  const extract = vi.fn(async () => metadata());
  const enqueue = vi.fn(async (entry: { captureId: string; payload: Record<string, unknown> }) => {
    entries.push(entry);
  });
  const service = createCaptureService({
    extract,
    enqueue,
    now: () => NOW,
    createId: () => crypto.randomUUID(),
    queueDepth: () => entries.length,
    ...overrides,
  });
  return { service, extract, enqueue, entries };
}

function accepted(result: CaptureResult): Extract<CaptureResult, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  return result as Extract<CaptureResult, { status: "accepted" }>;
}

describe("capture triggers", () => {
  it("exposes exactly the three approved triggers (B1, B2, popup)", () => {
    expect([...CAPTURE_TRIGGERS]).toEqual(["context-menu", "command", "popup"]);
  });

  it.each(CAPTURE_TRIGGERS)("runs the same pipeline for the %s trigger", async (trigger) => {
    const { service, entries } = setup();
    const result = accepted(await service.capture({ url: PAGE, trigger }));

    expect(result.trigger).toBe(trigger);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.payload.url).toBe(PAGE);
  });
});

describe("url validation", () => {
  it("captures the active tab url and trims surrounding whitespace", async () => {
    const { service, extract, entries } = setup();
    await service.capture({ url: `  ${PAGE}  `, trigger: "context-menu" });

    expect(extract).toHaveBeenCalledWith({ url: PAGE, tabId: undefined });
    expect(entries[0]?.payload.url).toBe(PAGE);
  });

  it("passes the tab id through so metadata can be read from the live DOM", async () => {
    const { service, extract } = setup();
    await service.capture({ url: PAGE, tabId: 42, trigger: "context-menu" });

    expect(extract).toHaveBeenCalledWith({ url: PAGE, tabId: 42 });
  });

  it.each([
    ["missing", undefined],
    ["empty", "   "],
  ])("rejects a %s tab url without touching the pipeline", async (_label, url) => {
    const { service, extract, enqueue } = setup();
    const result = await service.capture({ url, trigger: "command" });

    expect(result).toMatchObject({ status: "rejected", reason: "missing-url", trigger: "command" });
    expect(extract).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    "chrome://extensions/",
    "about:blank",
    "file:///C:/Users/ADMIN/notes.txt",
    "javascript:alert(1)",
    "data:text/html,<title>x</title>",
    "edge://settings",
    "view-source:https://example.com/",
    "not a url",
  ])("rejects the unsupported page %s", async (url) => {
    const { service, extract, enqueue } = setup();
    const result = await service.capture({ url, trigger: "context-menu" });

    expect(result).toMatchObject({ status: "rejected", reason: "unsupported-url", url });
    expect(extract).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("metadata reuse", () => {
  it("extracts through the EXT-002 implementation", async () => {
    const html = `<!doctype html><html><head><title>OG page</title>
      <meta property="og:description" content="From Open Graph">
      <meta property="og:image" content="https://cdn.example.com/a.png">
      </head><body></body></html>`;
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const { service, entries } = setup({
      extract: ({ url }) => extractMetadata(url, { fetchImpl }),
    });

    const result = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));

    expect(fetchImpl).toHaveBeenCalledWith(PAGE, expect.objectContaining({ credentials: "omit" }));
    expect(result.degraded).toBe(false);
    expect(entries[0]?.payload).toMatchObject({
      title: "OG page",
      description: "From Open Graph",
      thumbnailUrl: "https://cdn.example.com/a.png",
    });
  });

  it("keeps the capture when extraction fails and degrades the fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    const { service, entries } = setup({
      extract: ({ url }) => extractMetadata(url, { fetchImpl }),
    });

    const result = accepted(await service.capture({ url: PAGE, trigger: "command" }));

    expect(result.degraded).toBe(true);
    expect(entries[0]?.payload).toMatchObject({
      title: "example.com — getting started",
      url: PAGE,
    });
  });

  it("survives an extractor that throws", async () => {
    const { service, entries } = setup({
      extract: async () => {
        throw new Error("boom");
      },
    });

    const result = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));

    expect(result.degraded).toBe(true);
    // Same URL-derived title the EXT-002 fallback chain would produce.
    expect(entries[0]?.payload).toMatchObject({
      title: fallbackMetadata(PAGE).title,
      url: PAGE,
    });
  });

  it("carries the extracted image and favicon as the draft thumbnail/favicon", async () => {
    const { service, entries } = setup();
    await service.capture({ url: PAGE, trigger: "context-menu" });

    expect(entries[0]?.payload).toMatchObject({
      thumbnailUrl: "https://cdn.example.com/thumb.png",
      faviconUrl: "https://example.com/favicon.ico",
    });
  });

  it("still captures when the page has no usable image (thumbnail is optional)", async () => {
    const { service, entries } = setup({
      extract: async () =>
        metadata({ imageUrl: undefined, faviconUrl: undefined, status: "partial" }),
    });

    const result = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));

    expect(result.degraded).toBe(true);
    expect(entries[0]?.payload.thumbnailUrl).toBeUndefined();
    expect(entries[0]?.payload.faviconUrl).toBeUndefined();
  });
});

describe("live metadata response validation", () => {
  it("accepts a structurally valid capture metadata object", () => {
    expect(isCaptureMetadata(metadata())).toBe(true);
    expect(isCaptureMetadata(fallbackMetadata(PAGE))).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "title"],
    ["a missing title", { status: "complete", notes: [] }],
    ["an unknown status", { title: "x", status: "saved", notes: [] }],
    ["non-string notes", { title: "x", status: "complete", notes: [1] }],
    ["a non-string image", { title: "x", status: "complete", notes: [], imageUrl: 3 }],
  ])("rejects %s", (_label, value) => {
    expect(isCaptureMetadata(value)).toBe(false);
  });
});

describe("draft and outbox contract", () => {
  it("enqueues a payload that passes the canonical shared schema", async () => {
    const { service, entries } = setup();
    const result = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));

    const draft = captureDraftSchema.parse(entries[0]?.payload);
    expect(draft).toMatchObject({
      captureId: result.captureId,
      url: PAGE,
      title: "Fixture title",
      source: "extension",
      capturedAt: NOW,
    });
    expect(entries[0]?.captureId).toBe(result.captureId);
  });

  it("reports the durable queue depth after enqueue", async () => {
    const { service } = setup();
    const first = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));
    const second = accepted(
      await service.capture({ url: "https://example.com/other", trigger: "command" }),
    );

    expect(first.queueDepth).toBe(1);
    expect(second.queueDepth).toBe(2);
  });

  it("does not resolve as accepted before the durable enqueue commits", async () => {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: string[] = [];
    const { service } = setup({
      enqueue: async () => {
        await gate;
        events.push("enqueued");
      },
    });

    const pending = service.capture({ url: PAGE, trigger: "context-menu" }).then((result) => {
      events.push("accepted");
      return result;
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    release();
    accepted(await pending);
    expect(events).toEqual(["enqueued", "accepted"]);
  });

  it("reports an outbox storage failure instead of a capture", async () => {
    const failure = new Error("QUOTA_BYTES quota exceeded");
    const { service } = setup({
      enqueue: async () => {
        throw failure;
      },
    });

    const result = await service.capture({ url: PAGE, trigger: "context-menu" });

    expect(result).toMatchObject({
      status: "failed",
      reason: "outbox-unavailable",
      trigger: "context-menu",
      url: PAGE,
      error: failure,
    });
    expect(result.status).not.toBe("accepted");
  });

  it("keeps one capture id per invocation so replays are deduplicated downstream", async () => {
    const { service, entries } = setup();
    const first = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));
    const second = accepted(await service.capture({ url: PAGE, trigger: "context-menu" }));

    expect(first.captureId).not.toBe(second.captureId);
    expect(entries[0]?.payload.canonicalUrlHint).toBe(entries[1]?.payload.canonicalUrlHint);
  });

  it("keeps accepted captures through a worker restart (durable outbox)", async () => {
    class MemoryStorage implements OutboxStorage {
      records: OutboxRecord[] = [];
      async load(): Promise<OutboxRecord[]> {
        return structuredClone(this.records);
      }
      async save(records: OutboxRecord[]): Promise<void> {
        this.records = structuredClone(records);
      }
    }

    const store = new MemoryStorage();
    const boot = () => new OutboxMachine({ store, deliver: async () => "timeout", now: () => NOW });
    const first = boot();
    const service = createCaptureService({
      extract: async () => metadata(),
      enqueue: (entry) => first.enqueue(entry),
      createId: () => crypto.randomUUID(),
      now: () => NOW,
    });

    const result = accepted(await service.capture({ url: PAGE, trigger: "command" }));

    const restarted = boot();
    await restarted.restore();
    expect(restarted.queue().map((record) => record.captureId)).toEqual([result.captureId]);
  });
});
