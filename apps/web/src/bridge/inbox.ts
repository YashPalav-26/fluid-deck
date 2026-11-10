/**
 * EXT-004 — web app capture inbox (hop 3).
 *
 * Receives `capture.deliver` envelopes from the content-script relay, proves
 * they belong to this tab load (origin + source + per-load nonce + envelope
 * schema), writes through the existing Dexie repository, and **only after the
 * transaction commits** posts `capture.ack`. Nothing is acked on a failed or
 * partial write.
 *
 * Idempotency has two layers, both already owned by the repository:
 * - `captureId` becomes `resources.id` (replay of the same capture);
 * - `canonicalUrl` is a unique index (same page captured twice).
 * A duplicate delivery therefore acks `outcome: "duplicate"` and creates no
 * second resource. There is deliberately no in-memory replay cache.
 *
 * Not here: retry loops, queue state, thumbnail probing, or metadata
 * extraction. Those belong to the extension core and the resource card.
 */
import { httpUrlSchema } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import type { CreateResourceResult } from "../repositories/resources.ts";
import { createResourceWithMembers } from "../repositories/resources.ts";
import { RepositoryError } from "../repositories/errors.ts";
import {
  MAX_ENVELOPE_BYTES,
  PERMANENT_NACK_CODES,
  PROTOCOL,
  PROTOCOL_VERSION,
  isSupportedVersion,
  parseCaptureDraft,
  parseEnvelope,
  type CaptureDraft,
  type Envelope,
  type MessageType,
  type NackCode,
} from "./contract.ts";

/** Per-tab-load binding. sessionStorage survives reloads, matching the relay. */
export const NONCE_STORAGE_KEY = "fluid-deck:bridge-nonce";

/** Structural view of the browser window; lets tests inject a fake surface. */
export interface InboxWindow {
  location: { origin: string };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, targetOrigin: string): void;
}

type NonceStorage = Pick<Storage, "getItem" | "setItem">;

export interface InboxOptions {
  database: FluidDeckDatabase;
  windowRef?: InboxWindow;
  sessionStorageRef?: NonceStorage | null;
  now?: () => number;
  createNonce?: () => string;
  /** Test seam only; production uses the real transactional repository. */
  persist?: (draft: CaptureDraft) => Promise<CreateResourceResult>;
  /** Called after a commit so the UI can invalidate its query cache. */
  onCommitted?: (result: CreateResourceResult) => void;
}

export interface InboxHandle {
  readonly nonce: string;
  stop(): void;
}

function defaultWindow(): InboxWindow {
  return window as unknown as InboxWindow;
}

function defaultSessionStorage(): NonceStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function serializedBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function safeOptionalUrl(value: string | undefined): string {
  return value !== undefined && httpUrlSchema.safeParse(value).success ? value : "";
}

function toResourceInput(draft: CaptureDraft) {
  return {
    url: draft.url,
    title: draft.title,
    description: draft.description ?? "",
    // Both are optional URLs in the domain model; an unsafe value is dropped
    // rather than rejecting an otherwise valid capture.
    thumbnailUrl: safeOptionalUrl(draft.thumbnailUrl),
    faviconUrl: safeOptionalUrl(draft.faviconUrl),
    type: draft.type ?? "other",
    source: "extension" as const,
    notes: draft.notes ?? "",
  };
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    return String((error as { name: unknown }).name);
  }
  return "";
}

function classifyFailure(error: unknown): NackCode {
  const name = errorName(error);
  if (name === "QuotaExceededError") return "quota";
  if (name === "DatabaseClosedError" || name === "InvalidStateError") return "db_unavailable";
  if (error instanceof RepositoryError) {
    return error.code === "VALIDATION" || error.code === "CONSTRAINT"
      ? "invalid_payload"
      : "transient";
  }
  return "transient";
}

function initialNonce(storage: NonceStorage | null, createNonce: () => string): string {
  try {
    const stored = storage?.getItem(NONCE_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Storage can throw in privacy modes; fall back to memory-only.
  }
  const nonce = createNonce();
  try {
    storage?.setItem(NONCE_STORAGE_KEY, nonce);
  } catch {
    // See above.
  }
  return nonce;
}

export function startInbox(options: InboxOptions): InboxHandle {
  const windowRef = options.windowRef ?? defaultWindow();
  const origin = windowRef.location.origin;
  const now = options.now ?? (() => Date.now());
  const createNonce = options.createNonce ?? (() => crypto.randomUUID());
  const nonce = initialNonce(
    options.sessionStorageRef === undefined ? defaultSessionStorage() : options.sessionStorageRef,
    createNonce,
  );

  const persist =
    options.persist ??
    ((draft: CaptureDraft) =>
      createResourceWithMembers(
        options.database,
        toResourceInput(draft),
        { collectionIds: draft.collectionIds, tagNames: draft.tagNames },
        { id: draft.captureId, dropMissingMembers: true },
      ));

  const post = (type: MessageType, captureId: string, payload: Record<string, unknown>) => {
    const envelope: Envelope = {
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      type,
      messageId: crypto.randomUUID(),
      captureId,
      sentAt: now(),
      senderRole: "webapp",
      payload,
      meta: { nonce },
    };
    windowRef.postMessage(envelope, origin);
  };

  // Acks/nacks are statements about a database state, so the code travels in
  // the payload and `permanent` follows the approved NACK table.
  const nack = (captureId: string, code: NackCode) => {
    post("capture.nack", captureId, {
      captureId,
      code,
      permanent: PERMANENT_NACK_CODES.includes(code),
    });
  };

  const commit = async (captureId: string, draft: CaptureDraft) => {
    try {
      const result = await persist(draft);
      post("capture.ack", captureId, {
        captureId,
        outcome: result.duplicate ? "duplicate" : "created",
        resourceId: result.resource.id,
        ...(result.duplicate ? { duplicateOf: result.resource.id } : {}),
      });
      options.onCommitted?.(result);
    } catch (error) {
      // Never ack a failed write: the extension keeps the draft and retries.
      nack(captureId, classifyFailure(error));
    }
  };

  const handler = (event: MessageEvent) => {
    try {
      if (event.source !== windowRef) return;
      if (event.origin !== origin) return;

      const envelope = parseEnvelope(event.data);
      if (!envelope.success) return;
      const message = envelope.data;
      if (message.type !== "capture.deliver") return;
      if (message.senderRole !== "extension") return;
      // No nonce, no reply: an unbound message is untrusted, not merely invalid.
      if (nonce === "" || message.meta?.nonce !== nonce) return;

      if (!isSupportedVersion(message.protocolVersion)) {
        nack(message.captureId, "version");
        return;
      }

      const bytes = serializedBytes(event.data);
      if (bytes === null) {
        nack(message.captureId, "invalid_payload");
        return;
      }
      if (bytes > MAX_ENVELOPE_BYTES) {
        nack(message.captureId, "payload_too_large");
        return;
      }

      const draft = parseCaptureDraft(message.payload);
      if (!draft.success) {
        const candidate = message.payload.url;
        const code: NackCode =
          typeof candidate === "string" && !httpUrlSchema.safeParse(candidate).success
            ? "invalid_url"
            : "invalid_payload";
        nack(message.captureId, code);
        return;
      }
      if (draft.data.captureId !== message.captureId) {
        nack(message.captureId, "invalid_payload");
        return;
      }

      void commit(message.captureId, draft.data);
    } catch {
      // A malformed event must never take down the app shell.
    }
  };

  windowRef.addEventListener("message", handler);

  // Announce readiness once per load, after the listener exists. `captureId`
  // is unused for ready but required by the envelope contract.
  post("capture.ready", crypto.randomUUID(), {
    nonce,
    protocolVersion: PROTOCOL_VERSION,
  });

  return {
    nonce,
    stop() {
      windowRef.removeEventListener("message", handler);
    },
  };
}
