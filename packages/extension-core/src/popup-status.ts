/**
 * EXT-006 - the popup's status model, derived from the real outbox.
 *
 * This module owns NO transitions. It derives a read-only view from the
 * durable outbox records (EXT-001) plus the small registries the background
 * maintains for captures that have *left* the outbox:
 *
 * - saved: recorded only after `OutboxMachine.handleAck` resolved for a
 *   validated `capture.ack` (the web app committed first);
 * - failed: recorded only after a validated `capture.nack` whose code is
 *   permanent (EXT-001 then discarded the record).
 *
 * Everything else (queued / saving / retrying) is derived from the record
 * itself, so a reopened popup reconstructs the truth from durable state with
 * no second queue and no duplicated state machine.
 */
import { canonicalizeUrl } from "@fluid-deck/core";
import type { CaptureResult, CaptureTrigger } from "./capture.ts";
import type { OutboxRecord } from "./outbox.ts";

/** The exact key the background persists outbox records under (EXT-001). */
export const OUTBOX_STORAGE_KEY = "fluid-deck:outbox";

/** Extension storage keys for the two outbox-exit registries. */
export const SAVED_CAPTURES_STORAGE_KEY = "fluid-deck:saved-captures";
export const FAILED_CAPTURES_STORAGE_KEY = "fluid-deck:failed-captures";

/**
 * Internal popup → background runtime message (same family as
 * `READ_METADATA_MESSAGE`: extension-internal, never part of the R-2 web
 * bridge protocol). The background captures the popup's selected tab through
 * the one shared capture pipeline and returns a sanitized result.
 */
export const POPUP_CAPTURE_MESSAGE = "fluiddeck:popup:capture";

/**
 * The popup-facing shape of a `CaptureResult`: the same statuses and fields,
 * with the un-serializable `error` object replaced by a plain message string.
 */
export interface PopupCaptureResult {
  status: "accepted" | "rejected" | "failed";
  trigger: CaptureTrigger;
  captureId?: string;
  url?: string;
  degraded?: boolean;
  queueDepth?: number;
  reason?: string;
  errorMessage?: string;
}

/** Maps a capture result to the sanitized shape the popup can render. */
export function toPopupCaptureResult(result: CaptureResult): PopupCaptureResult {
  if (result.status === "accepted") {
    return {
      status: "accepted",
      trigger: result.trigger,
      captureId: result.captureId,
      url: result.url,
      degraded: result.degraded,
      queueDepth: result.queueDepth,
    };
  }
  if (result.status === "rejected") {
    return { status: "rejected", trigger: result.trigger, reason: result.reason, url: result.url };
  }
  return {
    status: "failed",
    trigger: result.trigger,
    reason: result.reason,
    captureId: result.captureId,
    url: result.url,
    errorMessage: result.error instanceof Error ? result.error.message : String(result.error),
  };
}

export interface SavedCaptureEntry {
  captureId: string;
  url: string;
  canonicalUrlHint?: string;
  /** ACK arrival time (accepted boundary for "Saved"). */
  savedAt: number;
}

export interface FailedCaptureEntry {
  captureId: string;
  url?: string;
  /** The permanent NACK code, e.g. `invalid_url` (omitted where unknowable). */
  code?: string;
  at: number;
}

/**
 * The popup's capture status for the page it is showing. One kind per
 * distinct user-facing state; nothing infers "saved" from click handlers,
 * messages, extraction, enqueue, or a started delivery.
 */
export type PageCaptureStatus =
  | { kind: "not-captured" }
  | { kind: "queued"; captureId: string; position: number }
  | {
      /** An attempt is in flight. At best "saving"; never "saved". */
      kind: "saving";
      captureId: string;
    }
  | {
      /** Durable retry scheduled by R-1 (timeout or transient nack). */
      kind: "retrying";
      captureId: string;
      attempts: number;
      nextRetryAt?: number;
    }
  | { kind: "saved"; captureId: string; savedAt: number }
  | {
      /** Permanent nack (record discarded) or an outbox storage failure. */
      kind: "failed";
      captureId?: string;
      reason: string;
      code?: string;
    };

const MAX_REGISTRY_ENTRIES = 40;

function captureUrl(item: Record<string, unknown>): string | undefined {
  return typeof item.url === "string" ? item.url : undefined;
}

function captureCanonical(item: Record<string, unknown>): string | undefined {
  const value = item.canonicalUrlHint;
  return typeof value === "string" ? value : undefined;
}

/** Same page when either side's URL or canonical hint matches exactly or canonically. */
function samePage(pageUrl: string, payload: Record<string, unknown>): boolean {
  const url = captureUrl(payload);
  const canonical = captureCanonical(payload);
  if (pageUrl === url || pageUrl === canonical) return true;
  // Tracking params/`#fragment` differences count as the same library page.
  const pageCanonical = canonicalUrlHint(pageUrl);
  return (
    pageCanonical !== undefined &&
    (pageCanonical === url ||
      pageCanonical === canonical ||
      canonicalUrlHint(url) === pageCanonical ||
      canonicalUrlHint(canonical) === pageCanonical)
  );
}

/** Canonical form of a URL, or undefined when it is not a usable absolute URL. */
function canonicalUrlHint(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return canonicalizeUrl(url);
  } catch {
    return undefined;
  }
}

function classifyRecord(record: OutboxRecord, position: number): PageCaptureStatus {
  const captureId = record.captureId;
  if (record.status === "waiting") {
    return {
      kind: "retrying",
      captureId,
      attempts: record.attempts,
      nextRetryAt: record.nextAttemptAt > 0 ? record.nextAttemptAt : undefined,
    };
  }
  if (record.attempts > 0) {
    // An attempt is armed on the durable record: in flight, best case.
    return { kind: "saving", captureId };
  }
  return { kind: "queued", captureId, position };
}

export interface DerivePageStatusInput {
  pageUrl?: string;
  records: OutboxRecord[];
  saved: SavedCaptureEntry[];
  failed: FailedCaptureEntry[];
}

/**
 * Derives the current capture status for one page. Precedence:
 * outbox record (newest first) -> newest saved/failed exit entry ->
 * not captured.
 */
export function derivePageCaptureStatus(input: DerivePageStatusInput): PageCaptureStatus {
  const { pageUrl, records, saved, failed } = input;
  if (!pageUrl) return { kind: "not-captured" };

  // FIFO: an earlier record may still be the head/in flight, but the newest
  // record for this URL is what a repeat trigger produced, so it wins.
  let newest: OutboxRecord | undefined;
  let position = 0;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record === undefined) continue;
    const payload = record.payload as Record<string, unknown>;
    if (!samePage(pageUrl, payload)) continue;
    if (newest === undefined || (record.createdAt ?? 0) > (newest.createdAt ?? 0)) {
      newest = record;
      position = index + 1;
    }
  }

  if (newest) return classifyRecord(newest, position);

  const exits: Array<{ kind: PageCaptureStatus; stamp: number }> = [
    ...failed
      .filter((f) => f.url === pageUrl)
      .map((f) => ({
        stamp: f.at,
        kind: {
          kind: "failed",
          captureId: f.captureId,
          reason: "delivery-rejected",
          code: f.code,
        } as PageCaptureStatus,
      })),
    ...saved
      .filter((s) => samePage(pageUrl, s as unknown as Record<string, unknown>))
      .map((s) => ({
        stamp: s.savedAt,
        kind: { kind: "saved", captureId: s.captureId, savedAt: s.savedAt } as PageCaptureStatus,
      })),
  ];
  if (exits.length === 0) return { kind: "not-captured" };
  // The newest exit wins: a failed capture that was later recaptured and
  // acked shows as saved, and the other way round as failed.
  exits.sort((a, b) => b.stamp - a.stamp);
  const latest = exits[0];
  return latest ? latest.kind : { kind: "not-captured" };
}

/** Queue counts for the popup's summary line, straight from the records. */
export function summarizeOutbox(records: OutboxRecord[]): { pending: number; retrying: number } {
  let pending = 0;
  let retrying = 0;
  for (const record of records) {
    if (record.status === "waiting") retrying++;
    else pending++;
  }
  return { pending, retrying };
}

function mergeRegistry<T extends { captureId: string } & { savedAt?: number; at?: number }>(
  entry: T,
  existing: T[],
  limit: number,
): T[] {
  const withoutId = existing.filter((item) => item.captureId !== entry.captureId);
  return [{ ...entry }, ...withoutId]
    .sort((a, b) => (b.savedAt ?? b.at ?? 0) - (a.savedAt ?? a.at ?? 0))
    .slice(0, limit);
}

/** Adds (or refreshes) the saved entry and prunes to the newest `limit` items. */
export function addSavedCapture(
  entry: SavedCaptureEntry,
  existing: SavedCaptureEntry[],
  limit = MAX_REGISTRY_ENTRIES,
): SavedCaptureEntry[] {
  return mergeRegistry(entry, existing, limit);
}

/** Adds (or refreshes) the failed entry and prunes to the newest `limit` items. */
export function addFailedCapture(
  entry: FailedCaptureEntry,
  existing: FailedCaptureEntry[],
  limit = MAX_REGISTRY_ENTRIES,
): FailedCaptureEntry[] {
  return mergeRegistry(entry, existing, limit);
}
