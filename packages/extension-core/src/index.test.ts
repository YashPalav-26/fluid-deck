import { describe, expect, it } from "vitest";
import {
  PERMANENT_NACK_CODES,
  PROTOCOL,
  PROTOCOL_VERSION,
  captureDraftSchema,
  envelopeSchema,
  isSupportedVersion,
} from "./index.ts";

const draft = {
  captureId: crypto.randomUUID(),
  url: "https://example.com/post",
  title: "A post",
  capturedAt: 1,
  source: "extension" as const,
};

const envelope = {
  protocol: PROTOCOL,
  protocolVersion: PROTOCOL_VERSION,
  type: "capture.deliver" as const,
  messageId: crypto.randomUUID(),
  captureId: draft.captureId,
  senderRole: "extension" as const,
  payload: {},
};

describe("extension-core protocol", () => {
  it("accepts a valid envelope and a valid draft", () => {
    expect(envelopeSchema.safeParse(envelope).success).toBe(true);
    expect(captureDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects wrong protocol, unknown type and bad uuid", () => {
    expect(envelopeSchema.safeParse({ ...envelope, protocol: "other" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...envelope, type: "capture.ping" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...envelope, messageId: "x" }).success).toBe(false);
  });

  it("rejects non-http drafts", () => {
    expect(captureDraftSchema.safeParse({ ...draft, url: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("version gate and permanent-code list match R-2", () => {
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(2)).toBe(false);
    expect(PERMANENT_NACK_CODES).toHaveLength(4);
  });
});
