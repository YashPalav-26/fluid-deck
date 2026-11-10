/**
 * EXT-004 — web capture inbox: validation, ack-after-commit, idempotency,
 * failure mapping, and no-reply paths for untrusted traffic. Uses the real
 * Dexie repository on a fake-indexeddb fixture (not mocked helpers).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createCollection } from "../repositories/collections.ts";
import { listCollectionMembers, listResourceTags } from "../repositories/relationships.ts";
import { getResource } from "../repositories/resources.ts";
import { PROTOCOL, PROTOCOL_VERSION, type CaptureDraft, type Envelope } from "./contract.ts";
import type { CreateResourceResult } from "../repositories/resources.ts";
import { startInbox, type InboxWindow } from "./inbox.ts";

const ORIGIN = "http://127.0.0.1:5199";
const fixture = useTestDatabase();
let db: FluidDeckDatabase;
beforeEach(() => {
  db = fixture.db;
});

function createWindow(origin = ORIGIN) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posted: Array<{ message: Envelope; targetOrigin: string }> = [];
  const win: InboxWindow = {
    location: { origin },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    postMessage: (message, targetOrigin) => {
      posted.push({ message: message as Envelope, targetOrigin });
    },
  };
  const emit = (data: unknown, options: { origin?: string; source?: unknown } = {}) => {
    for (const listener of [...listeners]) {
      listener({
        origin: options.origin ?? origin,
        source: options.source ?? win,
        data,
      } as MessageEvent);
    }
  };
  return { win, posted, emit, listeners };
}

function draftInput(id: string, overrides: Partial<CaptureDraft> = {}): Record<string, unknown> {
  return {
    captureId: id,
    url: "https://example.com/article",
    title: "Bridge capture",
    capturedAt: 1_700_000_000_000,
    source: "extension",
    ...overrides,
  };
}

function deliverEnvelope(
  id: string,
  nonce: string,
  payload: Record<string, unknown> = draftInput(id),
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.deliver",
    messageId: crypto.randomUUID(),
    captureId: id,
    senderRole: "extension",
    payload,
    meta: { nonce },
    ...overrides,
  };
}

function start(win: InboxWindow, options: Partial<Parameters<typeof startInbox>[0]> = {}) {
  return startInbox({
    database: db,
    windowRef: win,
    sessionStorageRef: null,
    now: () => 1_000,
    ...options,
  });
}

function acked(posted: Array<{ message: Envelope }>) {
  return posted.filter((entry) => entry.message.type === "capture.ack");
}
function nacked(posted: Array<{ message: Envelope }>) {
  return posted.filter((entry) => entry.message.type === "capture.nack");
}

function fakeResource(id: string, url = "https://example.com/article"): Resource {
  return {
    id,
    url,
    canonicalUrl: url,
    title: "T",
    description: "",
    thumbnailUrl: "",
    faviconUrl: "",
    domain: "example.com",
    type: "other",
    source: "extension",
    notes: "",
    extractionStatus: "complete",
    extractionNotes: [],
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: null,
    deletedAt: null,
  };
}

describe("capture inbox", () => {
  it("announces readiness once with the per-load nonce", () => {
    const { win, posted, listeners } = createWindow();
    const handle = start(win, { createNonce: () => "nonce-1" });

    expect(handle.nonce).toBe("nonce-1");
    expect(listeners.size).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      targetOrigin: ORIGIN,
      message: {
        type: "capture.ready",
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        senderRole: "webapp",
        payload: { nonce: "nonce-1", protocolVersion: PROTOCOL_VERSION },
      },
    });

    handle.stop();
    expect(listeners.size).toBe(0);
  });

  it("commits the resource, then acks created", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    const id = crypto.randomUUID();

    emit(deliverEnvelope(id, handle.nonce));

    await vi.waitFor(() => expect(acked(posted)).toHaveLength(1));
    expect(acked(posted)[0]!.message.payload).toMatchObject({
      captureId: id,
      outcome: "created",
      resourceId: id,
    });
    const stored = await getResource(db, id);
    expect(stored?.title).toBe("Bridge capture");
    expect(stored?.canonicalUrl).toBe("https://example.com/article");
  });

  it("acks a duplicate without creating a second resource", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    const id = crypto.randomUUID();

    emit(deliverEnvelope(id, handle.nonce));
    await vi.waitFor(() => expect(acked(posted)).toHaveLength(1));
    emit(deliverEnvelope(id, handle.nonce));
    await vi.waitFor(() => expect(acked(posted)).toHaveLength(2));

    expect(acked(posted)[1]!.message.payload).toMatchObject({ outcome: "duplicate" });
    expect(await db.resources.count()).toBe(1);
  });

  it("never acks before the transaction commits", async () => {
    const { win, posted, emit } = createWindow();
    let release!: () => void;
    const persist = vi.fn(
      (draft: CaptureDraft) =>
        new Promise<CreateResourceResult>((resolve) => {
          release = () => resolve({ resource: fakeResource(draft.captureId), duplicate: false });
        }),
    );
    const handle = start(win, { createNonce: () => "n", persist });
    const id = crypto.randomUUID();

    emit(deliverEnvelope(id, handle.nonce));
    await Promise.resolve();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(acked(posted)).toHaveLength(0);
    expect(nacked(posted)).toHaveLength(0);

    release();
    await vi.waitFor(() => expect(acked(posted)).toHaveLength(1));
  });

  it("maps commit failures to retryable nacks and never acks", async () => {
    const cases: Array<{ error: unknown; code: string; permanent: boolean }> = [
      {
        error: Object.assign(new Error("full"), { name: "QuotaExceededError" }),
        code: "quota",
        permanent: false,
      },
      {
        error: Object.assign(new Error("closed"), { name: "DatabaseClosedError" }),
        code: "db_unavailable",
        permanent: false,
      },
      { error: new Error("boom"), code: "transient", permanent: false },
    ];

    for (const testCase of cases) {
      const { win, posted, emit } = createWindow();
      const handle = start(win, {
        createNonce: () => "n",
        persist: vi.fn(async () => {
          throw testCase.error;
        }),
      });

      emit(deliverEnvelope(crypto.randomUUID(), handle.nonce));
      await vi.waitFor(() => expect(nacked(posted)).toHaveLength(1));
      expect(nacked(posted)[0]!.message.payload).toMatchObject({
        code: testCase.code,
        permanent: testCase.permanent,
      });
      expect(acked(posted)).toHaveLength(0);
    }
  });

  it("nacks a version mismatch permanently", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    emit(deliverEnvelope(crypto.randomUUID(), handle.nonce, undefined, { protocolVersion: 99 }));
    await vi.waitFor(() => expect(nacked(posted)).toHaveLength(1));
    expect(nacked(posted)[0]!.message.payload).toMatchObject({ code: "version", permanent: true });
  });

  it("nacks oversized envelopes permanently before touching the database", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    const id = crypto.randomUUID();
    emit(deliverEnvelope(id, handle.nonce, draftInput(id, { title: "x".repeat(70_000) })));
    await vi.waitFor(() => expect(nacked(posted)).toHaveLength(1));
    expect(nacked(posted)[0]!.message.payload).toMatchObject({
      code: "payload_too_large",
      permanent: true,
    });
    expect(await db.resources.count()).toBe(0);
  });

  it("distinguishes an invalid URL from an invalid payload", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });

    const badUrl = crypto.randomUUID();
    emit(deliverEnvelope(badUrl, handle.nonce, draftInput(badUrl, { url: "javascript:alert(1)" })));
    await vi.waitFor(() => expect(nacked(posted)).toHaveLength(1));
    expect(nacked(posted)[0]!.message.payload).toMatchObject({
      code: "invalid_url",
      permanent: true,
    });

    const badPayload = crypto.randomUUID();
    const withoutTitle = draftInput(badPayload);
    delete withoutTitle.title;
    emit(deliverEnvelope(badPayload, handle.nonce, withoutTitle));
    await vi.waitFor(() => expect(nacked(posted)).toHaveLength(2));
    expect(nacked(posted)[1]!.message.payload).toMatchObject({
      code: "invalid_payload",
      permanent: true,
    });
    expect(await db.resources.count()).toBe(0);
  });

  it("ignores wrong origin, wrong source, wrong nonce and wrong role without replying", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    const id = crypto.randomUUID();
    const valid = deliverEnvelope(id, handle.nonce);

    emit(valid, { origin: "https://evil.example" });
    emit(valid, { source: { other: true } });
    emit(deliverEnvelope(id, "stale"));
    emit({ ...valid, senderRole: "webapp" });
    emit({ ...valid, meta: undefined });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted.filter((entry) => entry.message.type !== "capture.ready")).toEqual([]);
  });

  it("resolves tag names and drops unknown collection ids", async () => {
    const { win, posted, emit } = createWindow();
    const handle = start(win, { createNonce: () => "n" });
    const { collection } = await createCollection(db, { name: "Known", parentId: null });
    const id = crypto.randomUUID();

    emit(
      deliverEnvelope(
        id,
        handle.nonce,
        draftInput(id, {
          collectionIds: [collection.id, crypto.randomUUID()],
          tagNames: ["Bridge", "reading"],
        }),
      ),
    );

    await vi.waitFor(() => expect(acked(posted)).toHaveLength(1));
    expect((await listCollectionMembers(db, collection.id)).map((r) => r.id)).toEqual([id]);
    expect(await listResourceTags(db, id)).toHaveLength(2);
  });
});
