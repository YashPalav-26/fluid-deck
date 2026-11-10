/**
 * EXT-004 — background transport: env/profile, tab registry, ack/nack
 * validation. No browser APIs; `sendToTab` is a spy.
 */
import { describe, expect, it, vi } from "vitest";
import { PROTOCOL, PROTOCOL_VERSION } from "./index.ts";
import { BridgeTransport } from "./bridge-transport.ts";

const TAB = 7;

const captureId = () => crypto.randomUUID();
const messageId = () => crypto.randomUUID();

function deliverEntry(id = captureId()) {
  return {
    captureId: id,
    payload: {
      captureId: id,
      url: "https://example.com/a",
      title: "A",
      capturedAt: 1,
      source: "extension",
    },
  };
}

function readyEnvelope(overrides: Record<string, unknown> = {}) {
  const nonce = crypto.randomUUID();
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.ready",
    messageId: messageId(),
    captureId: nonce,
    senderRole: "webapp",
    payload: { nonce, protocolVersion: PROTOCOL_VERSION },
    ...overrides,
  };
}

function ackEnvelope(id: string, overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.ack",
    messageId: messageId(),
    captureId: id,
    senderRole: "webapp",
    payload: { captureId: id, outcome: "created" },
    meta: { nonce: "n" },
    ...overrides,
  };
}

function nackEnvelope(id: string, permanent: boolean, overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    type: "capture.nack",
    messageId: messageId(),
    captureId: id,
    senderRole: "webapp",
    payload: { captureId: id, code: permanent ? "invalid_payload" : "transient", permanent },
    meta: { nonce: "n" },
    ...overrides,
  };
}

function transport(
  sendToTab = vi.fn<(tabId: number, message: unknown) => Promise<void>>(async () => undefined),
) {
  return {
    transport: new BridgeTransport({ sendToTab, createMessageId: messageId, now: () => 1_000 }),
    sendToTab,
  };
}

describe("bridge transport", () => {
  it("resolves timeout when no app tab is known", async () => {
    const { transport: t, sendToTab } = transport();
    await expect(t.deliver(deliverEntry())).resolves.toBe("timeout");
    expect(sendToTab).not.toHaveBeenCalled();
  });

  it("delivers one canonical envelope to a known tab and completes on ack", async () => {
    const { transport: t, sendToTab } = transport();
    t.markCandidate(TAB);
    const entry = deliverEntry();

    const outcome = t.deliver(entry);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToTab).toHaveBeenCalledTimes(1);
    const [tabId, envelope] = sendToTab.mock.calls[0] as [number, Record<string, unknown>];
    expect(tabId).toBe(TAB);
    expect(envelope).toMatchObject({
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      type: "capture.deliver",
      captureId: entry.captureId,
      senderRole: "extension",
      payload: entry.payload,
    });

    const route = t.routeAck(TAB, ackEnvelope(entry.captureId));
    expect(route).toEqual({ captureId: entry.captureId, outcome: "created", consumed: true });
    await expect(outcome).resolves.toBe("ack");
  });

  it("resolves timeout when tabs.sendMessage rejects (no relay)", async () => {
    const sendToTab = vi.fn(async () => {
      throw new Error("Could not establish connection");
    });
    const { transport: t } = transport(sendToTab);
    t.markCandidate(TAB);
    await expect(t.deliver(deliverEntry())).resolves.toBe("timeout");
  });

  it("ignores an ack from a different tab", async () => {
    const { transport: t } = transport();
    t.markCandidate(TAB);
    t.markCandidate(8);
    const entry = deliverEntry();
    const outcome = t.deliver(entry);
    await Promise.resolve();

    expect(t.routeAck(8, ackEnvelope(entry.captureId))).toMatchObject({ consumed: false });
    expect(t.routeAck(99, ackEnvelope(entry.captureId))).toBeNull();
    expect(t.routeAck(TAB, ackEnvelope(entry.captureId))).toMatchObject({ consumed: true });
    await expect(outcome).resolves.toBe("ack");
  });

  it("maps permanent and transient nacks to their outcomes", async () => {
    const { transport: t } = transport();
    t.markCandidate(TAB);

    const permanent = deliverEntry();
    const permanentOutcome = t.deliver(permanent);
    await Promise.resolve();
    expect(t.routeNack(TAB, nackEnvelope(permanent.captureId, true))).toMatchObject({
      permanent: true,
      consumed: true,
    });
    await expect(permanentOutcome).resolves.toBe("nack-permanent");

    const transient = deliverEntry();
    const transientOutcome = t.deliver(transient);
    await Promise.resolve();
    expect(t.routeNack(TAB, nackEnvelope(transient.captureId, false))).toMatchObject({
      permanent: false,
      consumed: true,
    });
    await expect(transientOutcome).resolves.toBe("nack-transient");
  });

  it("accepts only valid ready envelopes", () => {
    const { transport: t } = transport();
    expect(t.markReady(TAB, readyEnvelope())).toBe(true);
    expect(t.knownTabs()).toEqual([TAB]);

    expect(t.markReady(8, readyEnvelope({ senderRole: "extension" }))).toBe(false);
    expect(t.markReady(8, readyEnvelope({ type: "capture.ack" }))).toBe(false);
    expect(t.markReady(8, readyEnvelope({ protocolVersion: 99 }))).toBe(false);
    expect(t.markReady(8, { protocol: "other" })).toBe(false);
  });

  it("rejects wrong-role, wrong-version and wrong-type acks", async () => {
    const { transport: t } = transport();
    t.markCandidate(TAB);
    const entry = deliverEntry();
    const outcome = t.deliver(entry);
    await Promise.resolve();

    expect(t.routeAck(TAB, ackEnvelope(entry.captureId, { senderRole: "extension" }))).toBeNull();
    expect(t.routeAck(TAB, ackEnvelope(entry.captureId, { protocolVersion: 2 }))).toBeNull();
    expect(t.routeAck(TAB, nackEnvelope(entry.captureId, true))).toBeNull();
    expect(
      t.routeAck(TAB, ackEnvelope(entry.captureId, { payload: { outcome: "created" } })),
    ).toBeNull();

    expect(t.routeAck(TAB, ackEnvelope(entry.captureId))).toMatchObject({ consumed: true });
    await expect(outcome).resolves.toBe("ack");
  });

  it("forgets removed tabs", async () => {
    const { transport: t } = transport();
    t.markCandidate(TAB);
    t.forgetTab(TAB);
    expect(t.knownTabs()).toEqual([]);
    await expect(t.deliver(deliverEntry())).resolves.toBe("timeout");
  });
});
