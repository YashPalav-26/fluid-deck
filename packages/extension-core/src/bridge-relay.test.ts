/**
 * EXT-004 — content-script relay: origin + source + role + nonce checks,
 * background→page nonce injection. Browser globals are injected.
 */
import { describe, expect, it } from "vitest";
import { PROTOCOL, PROTOCOL_VERSION } from "./index.ts";
import { createBridgeRelay } from "./bridge-relay.ts";

const ORIGIN = "http://127.0.0.1:5199";
const PAGE_WINDOW = { name: "page-window" };

function setup(initialNonce = "") {
  const posted: Array<{ message: unknown; targetOrigin: string }> = [];
  const forwarded: unknown[] = [];
  const relay = createBridgeRelay({
    allowedOrigin: ORIGIN,
    pageWindow: PAGE_WINDOW,
    postToPage: (message, targetOrigin) => posted.push({ message, targetOrigin }),
    sendToBackground: (message) => forwarded.push(message),
    readNonce: () => initialNonce,
  });
  return { relay, posted, forwarded };
}

function readyEnvelope(nonce = crypto.randomUUID(), overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.ready",
    messageId: crypto.randomUUID(),
    captureId: crypto.randomUUID(),
    senderRole: "webapp",
    payload: { nonce, protocolVersion: PROTOCOL_VERSION },
    ...overrides,
  };
}

function ackEnvelope(id: string, nonce: string, overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.ack",
    messageId: crypto.randomUUID(),
    captureId: id,
    senderRole: "webapp",
    payload: { captureId: id, outcome: "duplicate" },
    meta: { nonce },
    ...overrides,
  };
}

function deliverEnvelope(id: string, overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.deliver",
    messageId: crypto.randomUUID(),
    captureId: id,
    senderRole: "extension",
    payload: {
      captureId: id,
      url: "https://example.com/a",
      title: "A",
      capturedAt: 1,
      source: "extension",
    },
    ...overrides,
  };
}

describe("bridge relay", () => {
  it("drops messages from a different origin", () => {
    const { relay, forwarded } = setup();
    const accepted = relay.handlePageMessage({
      origin: "https://evil.example",
      source: PAGE_WINDOW,
      data: readyEnvelope(),
    });
    expect(accepted).toBe(false);
    expect(forwarded).toEqual([]);
  });

  it("drops messages from another frame/source", () => {
    const { relay, forwarded } = setup();
    const accepted = relay.handlePageMessage({
      origin: ORIGIN,
      source: { name: "other-frame" },
      data: readyEnvelope(),
    });
    expect(accepted).toBe(false);
    expect(forwarded).toEqual([]);
  });

  it("drops non-envelope traffic and wrong roles", () => {
    const { relay } = setup();
    expect(
      relay.handlePageMessage({ origin: ORIGIN, source: PAGE_WINDOW, data: { hello: true } }),
    ).toBe(false);
    expect(
      relay.handlePageMessage({
        origin: ORIGIN,
        source: PAGE_WINDOW,
        data: readyEnvelope(undefined, { senderRole: "extension" }),
      }),
    ).toBe(false);
  });

  it("installs the nonce from a valid ready and forwards it", () => {
    const { relay, forwarded } = setup();
    const nonce = crypto.randomUUID();
    const ready = readyEnvelope(nonce);
    expect(relay.handlePageMessage({ origin: ORIGIN, source: PAGE_WINDOW, data: ready })).toBe(
      true,
    );
    expect(relay.currentNonce()).toBe(nonce);
    expect(forwarded).toEqual([ready]);
  });

  it("injects the nonce and pins targetOrigin when forwarding a deliver", () => {
    const { relay, posted } = setup("nonce-1");
    const id = crypto.randomUUID();
    expect(relay.handleBackgroundMessage(deliverEnvelope(id))).toBe(true);
    expect(posted).toHaveLength(1);
    const { message, targetOrigin } = posted[0]!;
    expect(targetOrigin).toBe(ORIGIN);
    expect(message).toMatchObject({
      type: "capture.deliver",
      captureId: id,
      meta: { nonce: "nonce-1" },
    });
  });

  it("rejects a deliver with the wrong role or version", () => {
    const { relay, posted } = setup("nonce-1");
    expect(
      relay.handleBackgroundMessage(deliverEnvelope(crypto.randomUUID(), { senderRole: "webapp" })),
    ).toBe(false);
    expect(
      relay.handleBackgroundMessage(deliverEnvelope(crypto.randomUUID(), { protocolVersion: 2 })),
    ).toBe(false);
    expect(posted).toEqual([]);
  });

  it("requires the current nonce on acks and passes valid ones through", () => {
    const nonce = crypto.randomUUID();
    const { relay, forwarded } = setup(nonce);
    const id = crypto.randomUUID();

    expect(
      relay.handlePageMessage({
        origin: ORIGIN,
        source: PAGE_WINDOW,
        data: ackEnvelope(id, "stale-nonce"),
      }),
    ).toBe(false);
    expect(
      relay.handlePageMessage({
        origin: ORIGIN,
        source: PAGE_WINDOW,
        data: ackEnvelope(id, nonce),
      }),
    ).toBe(true);
    expect(forwarded).toHaveLength(1);
  });

  it("requires a ready nonce before any ack can be forwarded", () => {
    const { relay, forwarded } = setup("");
    expect(
      relay.handlePageMessage({
        origin: ORIGIN,
        source: PAGE_WINDOW,
        data: ackEnvelope(crypto.randomUUID(), ""),
      }),
    ).toBe(false);
    expect(forwarded).toEqual([]);
  });
});
