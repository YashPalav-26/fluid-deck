/**
 * EXT-005 - the single capture path shared by every approved trigger.
 *
 * A trigger (context menu, keyboard command, popup button) supplies nothing
 * but the tab URL, the tab id (when the browser gives us one) and its own
 * name. This module owns the rest of the approved flow:
 *
 *   validate URL → metadata (EXT-002) → canonical draft → durable outbox
 *   enqueue (EXT-001) → EXT-004 delivers and acks.
 *
 * Metadata comes from the *live DOM* path (`readMetadata` in the capture content
 * script), not `extractMetadata(url)`: an MV3 service worker has no `DOMParser`,
 * so the streaming fetch path cannot parse there. `readMetadata` is the approved
 * mechanism for a page that is already loaded (SYSTEM_ARCHITECTURE §7); the
 * caller falls back to `fallbackMetadata` when no content script answers.
 *
 * The accepted boundary is the enqueue result: `status: "accepted"` is only
 * returned after storage confirmed the write. There is deliberately no "saved"
 * outcome here — only the web app's ACK can say that (EXT-006 owns the
 * user-facing status surfaces).
 *
 * No `browser.*` here: metadata, enqueue and the id/clock are injected, so
 * every branch is testable without a browser.
 */
import { httpUrlSchema } from "@fluid-deck/core";
import { createCaptureDraft } from "./index.ts";
import { fallbackMetadata, type CaptureMetadata } from "./metadata.ts";
import type { OutboxEntry } from "./outbox.ts";

export const CAPTURE_TRIGGERS = ["context-menu", "command", "popup"] as const;
export type CaptureTrigger = (typeof CAPTURE_TRIGGERS)[number];

/**
 * Internal extension runtime message (hop: background → capture content
 * script). Deliberately NOT part of the R-2 web bridge protocol: it never
 * crosses the extension boundary and adds no protocol version or message type.
 */
export const READ_METADATA_MESSAGE = "fluiddeck:internal:read-metadata";

export type CaptureRejectionReason = "missing-url" | "unsupported-url";

export interface CaptureTarget {
  url?: string;
  /** Present when the trigger knows the tab (menu click, active-tab query). */
  tabId?: number;
}

export type CaptureResult =
  | {
      status: "accepted";
      trigger: CaptureTrigger;
      captureId: string;
      url: string;
      /** True when metadata fell back; the capture itself is retained. */
      degraded: boolean;
      queueDepth: number;
    }
  | { status: "rejected"; trigger: CaptureTrigger; reason: CaptureRejectionReason; url?: string }
  | {
      status: "failed";
      trigger: CaptureTrigger;
      reason: "outbox-unavailable";
      captureId: string;
      url: string;
      error: unknown;
    };

export interface CaptureServiceOptions {
  /** EXT-002 metadata for the target (live DOM via the content script). */
  extract: (target: { url: string; tabId?: number }) => Promise<CaptureMetadata>;
  /** EXT-001 durable enqueue; resolves only after the record is persisted. */
  enqueue: (entry: OutboxEntry) => Promise<void>;
  /** Current durable queue depth, for truthful feedback. */
  queueDepth?: () => number;
  now?: () => number;
  createId?: () => string;
}

export interface CaptureService {
  capture(input: CaptureTarget & { trigger: CaptureTrigger }): Promise<CaptureResult>;
}

const EXTRACTION_STATUSES: readonly string[] = ["complete", "partial", "failed"];

/**
 * Structural gate for the content-script response. It is our own isolated-world
 * script, but a message response is still an untrusted boundary.
 */
export function isCaptureMetadata(value: unknown): value is CaptureMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CaptureMetadata>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.status === "string" &&
    EXTRACTION_STATUSES.includes(candidate.status) &&
    Array.isArray(candidate.notes) &&
    candidate.notes.every((note) => typeof note === "string") &&
    (candidate.description === undefined || typeof candidate.description === "string") &&
    (candidate.canonicalUrl === undefined || typeof candidate.canonicalUrl === "string") &&
    (candidate.faviconUrl === undefined || typeof candidate.faviconUrl === "string") &&
    (candidate.imageUrl === undefined || typeof candidate.imageUrl === "string")
  );
}

export function createCaptureService(options: CaptureServiceOptions): CaptureService {
  const {
    extract,
    enqueue,
    queueDepth = () => 0,
    now = Date.now,
    createId = () => crypto.randomUUID(),
  } = options;

  return {
    async capture({ url, tabId, trigger }) {
      const candidate = url?.trim();
      if (!candidate) return { status: "rejected", trigger, reason: "missing-url" };
      if (!httpUrlSchema.safeParse(candidate).success) {
        return { status: "rejected", trigger, reason: "unsupported-url", url: candidate };
      }

      // The extractor never throws by contract; a throw here still degrades
      // rather than dropping an otherwise valid capture.
      let metadata: CaptureMetadata;
      try {
        metadata = await extract({ url: candidate, tabId });
      } catch {
        metadata = fallbackMetadata(candidate);
      }

      const captureId = createId();
      const draft = createCaptureDraft({
        url: candidate,
        metadata,
        captureId,
        capturedAt: now(),
      });

      try {
        await enqueue({ captureId, payload: draft });
      } catch (error) {
        // Storage refused the write: nothing is queued, so nothing is saved.
        return {
          status: "failed",
          trigger,
          reason: "outbox-unavailable",
          captureId,
          url: candidate,
          error,
        };
      }

      return {
        status: "accepted",
        trigger,
        captureId,
        url: candidate,
        degraded: metadata.status !== "complete",
        queueDepth: queueDepth(),
      };
    },
  };
}
