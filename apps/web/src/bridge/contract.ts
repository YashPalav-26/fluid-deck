/**
 * EXT-007 — canonical shared-protocol seam. The web app's bridge consumes
 * these definitions from `@fluid-deck/extension-core`; the extension
 * imports the same package. No envelope logic, no Zod duplication, no
 * second protocol record lives outside the shared package.
 */
export {
  PROTOCOL,
  PROTOCOL_VERSION,
  MESSAGE_TYPES,
  NACK_CODES,
  PERMANENT_NACK_CODES,
  envelopeSchema,
  captureDraftSchema,
  ackPayloadSchema,
  nackPayloadSchema,
  readyPayloadSchema,
  isSupportedVersion,
  MAX_ENVELOPE_BYTES,
  MAX_STRING_LENGTH,
} from "@fluid-deck/extension-core";
export type { Envelope, CaptureDraft, MessageType, NackCode } from "@fluid-deck/extension-core";

import {
  ackPayloadSchema,
  captureDraftSchema,
  envelopeSchema,
  nackPayloadSchema,
  readyPayloadSchema,
} from "@fluid-deck/extension-core";
/** Package this seam re-exports from (canonical contract owner). */
export const PROTOCOL_PACKAGE_NAME = "@fluid-deck/extension-core";
/** Human-friendly protocol name, for badges/logs only. */
export const PRETTY_PROTOCOL = "fluiddeck.capture";

/** Parse an incoming `window.postMessage` envelope against the shared schema. */
export function parseEnvelope(data: unknown) {
  return envelopeSchema.safeParse(data);
}

/** Parse a verified `capture.deliver` payload into a capture draft. */
export function parseCaptureDraft(data: unknown) {
  return captureDraftSchema.safeParse(data);
}

/** Parse a `capture.ack` payload before posting it back. */
export function parseAckPayload(data: unknown) {
  return ackPayloadSchema.safeParse(data);
}

/** Parse a `capture.nack` payload. */
export function parseNackPayload(data: unknown) {
  return nackPayloadSchema.safeParse(data);
}

/** Parse a `capture.ready` payload (listener handshake). */
export function parseReadyPayload(data: unknown) {
  return readyPayloadSchema.safeParse(data);
}
