/**
 * EXT-004 — content-script bridge relay (hop 2).
 *
 * Runs only on exact app origins (manifest `matches`). It is a message
 * forwarder, not a participant: it owns the per-load nonce and the two
 * origin checks, and nothing else.
 *
 * Page → relay: accept only `event.origin === allowedOrigin`,
 * `event.source === pageWindow`, a canonical envelope, `senderRole:
 * "webapp"`, and — for ack/nack — the current nonce. `capture.ready`
 * installs the nonce; it is the only message allowed without one.
 *
 * Relay → page: accept only a valid `capture.deliver` from the extension,
 * inject `meta.nonce`, and post with `targetOrigin = allowedOrigin`.
 *
 * Browser globals are injected so this module stays unit-testable and
 * `extension-core` stays free of `window`/`browser` references.
 */
import { envelopeSchema, isSupportedVersion, readyPayloadSchema, type Envelope } from "./index.ts";

export interface BridgeRelayEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

export interface BridgeRelayOptions {
  /** Exact app origin (no wildcard, no subdomain matching). */
  allowedOrigin: string;
  /** The page's `window`, used to reject messages from other frames. */
  pageWindow: unknown;
  postToPage: (message: unknown, targetOrigin: string) => void;
  sendToBackground: (message: unknown) => void;
  /** Optional persistence for the nonce (content-script sessionStorage). */
  readNonce?: () => string;
  writeNonce?: (nonce: string) => void;
}

export interface BridgeRelay {
  handlePageMessage(event: BridgeRelayEvent): boolean;
  handleBackgroundMessage(message: unknown): boolean;
  currentNonce(): string;
}

export function createBridgeRelay(options: BridgeRelayOptions): BridgeRelay {
  const { allowedOrigin, pageWindow, postToPage, sendToBackground, readNonce, writeNonce } =
    options;
  let nonce = readNonce?.() ?? "";

  return {
    handlePageMessage(event) {
      if (event.origin !== allowedOrigin) return false;
      if (event.source !== pageWindow) return false;

      const parsed = envelopeSchema.safeParse(event.data);
      if (!parsed.success) return false;
      const message = parsed.data;
      if (message.senderRole !== "webapp") return false;

      if (message.type === "capture.ready") {
        const payload = readyPayloadSchema.safeParse(message.payload);
        if (!payload.success) return false;
        nonce = payload.data.nonce;
        writeNonce?.(nonce);
        sendToBackground(message);
        return true;
      }

      if (message.type !== "capture.ack" && message.type !== "capture.nack") return false;
      if (nonce === "" || message.meta?.nonce !== nonce) return false;
      sendToBackground(message);
      return true;
    },

    handleBackgroundMessage(message) {
      const parsed = envelopeSchema.safeParse(message);
      if (!parsed.success) return false;
      const envelope = parsed.data;
      if (envelope.type !== "capture.deliver") return false;
      if (envelope.senderRole !== "extension") return false;
      if (!isSupportedVersion(envelope.protocolVersion)) return false;

      const forwarded: Envelope = {
        ...envelope,
        meta: { ...envelope.meta, nonce },
      };
      postToPage(forwarded, allowedOrigin);
      return true;
    },

    currentNonce() {
      return nonce;
    },
  };
}
