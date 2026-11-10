/**
 * Protocol contract for the extension <-> web bridge (R-2, approved v1).
 * Browser-independent: imports nothing but zod + core. No chrome.* here.
 */
import { z } from "zod";
import { RESOURCE_TYPES, httpUrlSchema } from "@fluid-deck/core";
import type { CaptureMetadata } from "./metadata.ts";

export const PROTOCOL = "fluiddeck.capture";
export const PROTOCOL_VERSION = 1;
export const MAX_ENVELOPE_BYTES = 64 * 1024;
export const MAX_STRING_LENGTH = 8 * 1024;

export const MESSAGE_TYPES = [
  "capture.deliver",
  "capture.ack",
  "capture.nack",
  "capture.ready",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const NACK_CODES = [
  "version",
  "payload_too_large",
  "invalid_payload",
  "invalid_url",
  "quota",
  "db_unavailable",
  "transient",
] as const;
export type NackCode = (typeof NACK_CODES)[number];

/** Permanent nacks are discarded from the outbox; the rest are retried. */
export const PERMANENT_NACK_CODES: readonly NackCode[] = [
  "version",
  "payload_too_large",
  "invalid_payload",
  "invalid_url",
];

const shortString = z.string().max(MAX_STRING_LENGTH);

export const envelopeSchema = z.object({
  protocol: z.literal(PROTOCOL),
  protocolVersion: z.number().int().positive(),
  type: z.enum(MESSAGE_TYPES),
  messageId: z.uuid(),
  captureId: z.uuid(),
  sentAt: z.number().int().nonnegative().optional(),
  senderRole: z.enum(["extension", "webapp"]),
  payload: z.record(z.string(), z.unknown()),
  meta: z
    .object({ nonce: shortString.optional(), attempts: z.number().int().nonnegative().optional() })
    .optional(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

export const captureDraftSchema = z.object({
  captureId: z.uuid(),
  url: httpUrlSchema,
  title: shortString,
  capturedAt: z.number().int().nonnegative(),
  source: z.literal("extension"),
  description: shortString.optional(),
  thumbnailUrl: shortString.optional(),
  faviconUrl: shortString.optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  collectionIds: z.array(z.uuid()).optional(),
  tagNames: z.array(z.string().min(1).max(200)).optional(),
  notes: shortString.optional(),
  canonicalUrlHint: z.string().max(MAX_STRING_LENGTH).optional(),
});
export type CaptureDraft = z.infer<typeof captureDraftSchema>;

export const ackPayloadSchema = z.object({
  captureId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
  resourceId: z.string().optional(),
  duplicateOf: z.string().optional(),
});

export const nackPayloadSchema = z.object({
  captureId: z.uuid(),
  code: z.enum(NACK_CODES),
  permanent: z.boolean(),
  message: z.string().optional(),
});

export const readyPayloadSchema = z.object({
  nonce: z.string().min(1),
  protocolVersion: z.number().int().positive(),
});

export function isSupportedVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}

export * from "./outbox.ts";
export * from "./alarm-driver.ts";
export * from "./metadata.ts";

/** Maps EXT-002 metadata onto the frozen R-2 draft (validated at the boundary). */
export function createCaptureDraft(input: {
  url: string;
  metadata: CaptureMetadata;
  captureId: string;
  capturedAt: number;
}): CaptureDraft {
  return captureDraftSchema.parse({
    captureId: input.captureId,
    url: input.url,
    capturedAt: input.capturedAt,
    source: "extension",
    title: input.metadata.title,
    description: input.metadata.description,
    thumbnailUrl: input.metadata.imageUrl,
    faviconUrl: input.metadata.faviconUrl,
    canonicalUrlHint: input.metadata.canonicalUrl,
  });
}
