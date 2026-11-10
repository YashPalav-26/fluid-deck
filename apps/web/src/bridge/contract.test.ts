/**
 * EXT-007 acceptance: the web app consumes the SAME canonical protocol
 * definitions as the extension (`@fluid-deck/extension-core`) — no
 * duplicated envelope schemas, no drifted constants. This seam is the
 * shared contract surface; EXT-004 will import `parseEnvelope` here.
 */
import { describe, expect, it } from "vitest";
import {
  MESSAGE_TYPES,
  PERMANENT_NACK_CODES,
  PRETTY_PROTOCOL,
  PROTOCOL,
  PROTOCOL_VERSION,
  isSupportedVersion,
  parseCaptureDraft,
  parseEnvelope,
  parseReadyPayload,
  PROTOCOL_PACKAGE_NAME,
} from "./contract.ts";

const captureId = crypto.randomUUID();
const draft = () => ({
  captureId,
  url: "https://example.com/post",
  title: "A post",
  capturedAt: 1,
  source: "extension" as const,
});

const envelope = () => ({
  protocol: PROTOCOL,
  protocolVersion: PROTOCOL_VERSION,
  type: "capture.deliver" as const,
  messageId: crypto.randomUUID(),
  captureId,
  senderRole: "extension" as const,
  payload: {},
});

describe("shared protocol seam", () => {
  it("exposes the approved identity and shapes", () => {
    expect(PRETTY_PROTOCOL).toBe("fluiddeck.capture");
    expect(PROTOCOL).toBe("fluiddeck.capture");
    expect(PROTOCOL_VERSION).toBe(1);
    expect(PROTOCOL_PACKAGE_NAME).toBe("@fluid-deck/extension-core");
    expect([...MESSAGE_TYPES]).toEqual([
      "capture.deliver",
      "capture.ack",
      "capture.nack",
      "capture.ready",
    ]);
    expect(PERMANENT_NACK_CODES).toEqual([
      "version",
      "payload_too_large",
      "invalid_payload",
      "invalid_url",
    ]);
  });

  it("accepts a valid envelope and parses its draft payload", () => {
    expect(parseEnvelope(envelope()).success).toBe(true);
    const parsed = parseCaptureDraft(draft());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.url).toBe("https://example.com/post");
  });

  it("rejects a wrong-protocol / unknown-type / bad-url message", () => {
    expect(parseEnvelope({ ...envelope(), protocol: "fluiddeck.other" }).success).toBe(false);
    expect(parseEnvelope({ ...envelope(), type: "capture.ping" }).success).toBe(false);
    expect(parseCaptureDraft({ ...draft(), url: "javascript:attack" }).success).toBe(false);
  });

  it("version gate uses the canonical supported version", () => {
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(2)).toBe(false);
    expect(parseReadyPayload({ nonce: "n", protocolVersion: 2 }).success).toBe(true);
  });
});
