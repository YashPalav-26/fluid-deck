/**
 * EXT-004 — production bridge transport (background side, hop 1).
 *
 * This module is the `deliver` seam wired into `OutboxMachine`. It never
 * touches `browser.*`: the background injects `sendToTab`, the tab registry is
 * fed by `capture.ready` messages and `tabs.query`, and every incoming ack /
 * nack is re-validated here before it can complete a delivery.
 *
 * What it is NOT: a queue, a retry loop, or a second state machine. The
 * durable outbox owns attempts, backoff, FIFO and ACK timeouts; this object
 * only turns one outbox entry into one `capture.deliver` envelope and reports
 * the web app's response back to that same machine.
 *
 * Nonce ownership: the content-script relay injects the per-load nonce, not
 * this module (see `bridge-relay.ts`). Background only routes validated
 * `capture.ready`/`capture.ack`/`capture.nack` envelopes.
 */
import {
  PROTOCOL,
  PROTOCOL_VERSION,
  ackPayloadSchema,
  envelopeSchema,
  isSupportedVersion,
  nackPayloadSchema,
  readyPayloadSchema,
  type Envelope,
} from "./index.ts";
import type { DeliveryOutcome, OutboxEntry } from "./outbox.ts";

export interface BridgeTransportOptions {
  /** Deliver one envelope to a specific app tab (`browser.tabs.sendMessage`). */
  sendToTab: (tabId: number, message: unknown) => Promise<void>;
  now?: () => number;
  createMessageId?: () => string;
}

export interface AckRoute {
  captureId: string;
  outcome: "created" | "duplicate";
  /** True when a pending `deliver()` promise was resolved by this ack. */
  consumed: boolean;
}

export interface NackRoute {
  captureId: string;
  code: string;
  permanent: boolean;
  /** True when a pending `deliver()` promise was resolved by this nack. */
  consumed: boolean;
}

type PendingDelivery = {
  tabId: number;
  resolve: (outcome: DeliveryOutcome) => void;
};

export class BridgeTransport {
  readonly #sendToTab: (tabId: number, message: unknown) => Promise<void>;
  readonly #now: () => number;
  readonly #createMessageId: () => string;
  /** App tabs known to host the relay (ready handshake or query-discovered). */
  readonly #tabs = new Set<number>();
  readonly #pending = new Map<string, PendingDelivery>();

  constructor(options: BridgeTransportOptions) {
    this.#sendToTab = options.sendToTab;
    this.#now = options.now ?? (() => Date.now());
    this.#createMessageId = options.createMessageId ?? (() => crypto.randomUUID());
  }

  /**
   * Registers a tab that completed the `capture.ready` handshake. Returns
   * false for anything that is not a valid, version-compatible ready envelope
   * — those tabs are simply not delivery targets.
   */
  markReady(tabId: number, envelope: unknown): boolean {
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) return false;
    const message = parsed.data;
    if (message.type !== "capture.ready" || message.senderRole !== "webapp") return false;
    if (!isSupportedVersion(message.protocolVersion)) return false;
    const payload = readyPayloadSchema.safeParse(message.payload);
    if (!payload.success) return false;
    if (!isSupportedVersion(payload.data.protocolVersion)) return false;
    this.#tabs.add(tabId);
    return true;
  }

  /**
   * Registers a tab discovered by URL (startup/worker-restart recovery). The
   * page may already be ready — the relay still holds the nonce — so this is
   * enough to attempt delivery without a new handshake.
   */
  markCandidate(tabId: number): void {
    this.#tabs.add(tabId);
  }

  forgetTab(tabId: number): void {
    this.#tabs.delete(tabId);
    for (const [captureId, pending] of this.#pending) {
      if (pending.tabId === tabId) this.#pending.delete(captureId);
    }
  }

  knownTabs(): number[] {
    return [...this.#tabs];
  }

  /** Outbox `deliver` implementation: one entry → one envelope → one outcome. */
  async deliver(entry: OutboxEntry): Promise<DeliveryOutcome> {
    const tabId = this.#tabs.values().next().value;
    if (tabId === undefined) return "timeout";

    const envelope: Envelope = {
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      type: "capture.deliver",
      messageId: this.#createMessageId(),
      captureId: entry.captureId,
      sentAt: this.#now(),
      senderRole: "extension",
      payload: entry.payload,
    };

    return new Promise<DeliveryOutcome>((resolve) => {
      this.#pending.set(entry.captureId, { tabId, resolve });
      this.#sendToTab(tabId, envelope).catch(() => {
        // No receiver (relay absent, tab navigated, extension reloaded):
        // resolve as a timeout so the outbox backs off. Never reject — the
        // machine would count the same failure from its catch path too.
        const current = this.#pending.get(entry.captureId);
        if (current?.resolve === resolve) this.#pending.delete(entry.captureId);
        resolve("timeout");
      });
    });
  }

  /** Validates a web-originated ack. Returns null when it must be ignored. */
  routeAck(tabId: number, envelope: unknown): AckRoute | null {
    const message = this.#parseFromWebapp(tabId, envelope, "capture.ack");
    if (!message) return null;
    const payload = ackPayloadSchema.safeParse(message.payload);
    if (!payload.success) return null;
    if (payload.data.captureId !== message.captureId) return null;

    const pending = this.#pending.get(message.captureId);
    const consumed = pending !== undefined && pending.tabId === tabId;
    if (consumed) {
      this.#pending.delete(message.captureId);
      pending.resolve("ack");
    }
    return { captureId: message.captureId, outcome: payload.data.outcome, consumed };
  }

  /** Validates a web-originated nack. Returns null when it must be ignored. */
  routeNack(tabId: number, envelope: unknown): NackRoute | null {
    const message = this.#parseFromWebapp(tabId, envelope, "capture.nack");
    if (!message) return null;
    const payload = nackPayloadSchema.safeParse(message.payload);
    if (!payload.success) return null;
    if (payload.data.captureId !== message.captureId) return null;

    const pending = this.#pending.get(message.captureId);
    const consumed = pending !== undefined && pending.tabId === tabId;
    if (consumed) {
      this.#pending.delete(message.captureId);
      pending.resolve(payload.data.permanent ? "nack-permanent" : "nack-transient");
    }
    return {
      captureId: message.captureId,
      code: payload.data.code,
      permanent: payload.data.permanent,
      consumed,
    };
  }

  #parseFromWebapp(
    tabId: number,
    envelope: unknown,
    expectedType: "capture.ack" | "capture.nack",
  ): Envelope | null {
    if (!this.#tabs.has(tabId)) return null;
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) return null;
    const message = parsed.data;
    if (message.type !== expectedType) return null;
    if (message.senderRole !== "webapp") return null;
    if (!isSupportedVersion(message.protocolVersion)) return null;
    return message;
  }
}
