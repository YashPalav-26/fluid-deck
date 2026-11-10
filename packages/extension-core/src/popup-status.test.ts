// @vitest-environment jsdom
/**
 * EXT-006 - the popup's status model, derived from the real outbox.
 *
 * The popup never owns transition logic; it derives a view from
 * (a) the durable outbox records and (b) the small registry the background
 * maintains of captures that left the outbox (acked = saved, permanently
 * nacked = failed). Every status below has exactly one source:
 *
 *   queued / saving / retrying -> the OUTBOX record itself
 *   saved   -> recorded only after `OutboxMachine.handleAck` resolved
 *   failed  -> recorded only after a validated `capture.nack` (permanent)
 *
 * "Saving" and "Saved" follow R-1/R-2: an in-flight attempt is at best
 * "saving", and only an ACK after the web commit is "saved".
 */
import { describe, expect, it } from "vitest";
import type { OutboxRecord } from "./outbox.ts";
import {
  addFailedCapture,
  addSavedCapture,
  derivePageCaptureStatus,
  OUTBOX_STORAGE_KEY,
  summarizeOutbox,
  type FailedCaptureEntry,
  type SavedCaptureEntry,
} from "./popup-status.ts";

const URL_A = "https://example.com/article?utm_source=x";
const URL_A_CLEAN = "https://example.com/article";
const URL_B = "https://other.com/page";
const NOW = 1_700_000_000_000;

function record(
  overrides: Partial<OutboxRecord> & { captureId: string; payload?: Record<string, unknown> },
): OutboxRecord {
  return {
    payload: {
      captureId: overrides.captureId,
      url: URL_A_CLEAN,
      title: "Example",
      capturedAt: NOW,
      canonicalUrlHint: URL_A_CLEAN,
      source: "extension",
    },
    status: "pending" as const,
    attempts: 0,
    nextAttemptAt: NOW,
    createdAt: NOW,
    ...overrides,
  } as OutboxRecord;
}

function saved(captureId: string, url = URL_A_CLEAN, savedAt = NOW): SavedCaptureEntry {
  return { captureId, url, canonicalUrlHint: url, savedAt };
}

describe("derivePageCaptureStatus", () => {
  it("returns not-captured when nothing is known about the page", () => {
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [],
      saved: [],
      failed: [],
    });
    expect(status).toEqual({ kind: "not-captured" });
  });

  it("classifies a pending, never-attempted record as queued", () => {
    const r = record({ captureId: "c1" });
    expect(
      derivePageCaptureStatus({
        pageUrl: URL_A_CLEAN,
        records: [r],
        saved: [],
        failed: [],
      }).kind,
    ).toBe("queued");
  });

  it("classifies an in-flight attempt as saving, never saved", () => {
    const r = record({
      captureId: "c1",
      attempts: 1,
      ackDeadlineAt: NOW + 5_000,
    });
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [r],
      saved: [],
      failed: [],
    });
    expect(status).toMatchObject({ kind: "saving", captureId: "c1" });
  });

  it("classifies a waiting record as retrying with its next attempt time", () => {
    const r = record({
      captureId: "c1",
      status: "waiting",
      attempts: 2,
      nextAttemptAt: NOW + 4_000,
      ackDeadlineAt: undefined,
    });
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [r],
      saved: [],
      failed: [],
    });
    expect(status).toMatchObject({ kind: "retrying", attempts: 2, nextRetryAt: NOW + 4_000 });
  });

  it("matches the page through URL and canonicalUrlHint in both directions", () => {
    const r = record({ captureId: "c1" });
    const input = { records: [r], saved: [], failed: [] };
    // the tracked URL resolves to the same canonical page
    expect(derivePageCaptureStatus({ ...input, pageUrl: URL_A }).kind).toBe("queued");
    // the record's raw URL also matches a clean query
    const withHint = record({
      captureId: "c1",
      payload: { captureId: "c1", url: URL_A, canonicalUrlHint: URL_A_CLEAN },
    });
    expect(
      derivePageCaptureStatus({ ...input, records: [withHint], pageUrl: URL_A_CLEAN }).kind,
    ).toBe("queued");
    expect(derivePageCaptureStatus({ ...input, records: [withHint], pageUrl: URL_B }).kind).toBe(
      "not-captured",
    );
  });

  it("reports saved only from an ACKed registry entry, when the outbox no longer holds it", () => {
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [],
      saved: [saved("c1")],
      failed: [],
    });
    expect(status).toMatchObject({ kind: "saved", captureId: "c1" });
  });

  it("the outbox record wins over an older saved entry (the page was captured again)", () => {
    const r = record({ captureId: "c2", createdAt: NOW + 10 });
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [r],
      saved: [saved("c1", URL_A_CLEAN, NOW - 100)],
      failed: [],
    });
    expect(status).toMatchObject({ kind: "queued", captureId: "c2" });
  });

  it("reports failed from a permanent-nack registry entry", () => {
    const failed: FailedCaptureEntry = {
      captureId: "c1",
      url: URL_A_CLEAN,
      code: "invalid_payload",
      at: NOW,
    };
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [],
      saved: [],
      failed: [failed],
    });
    expect(status).toMatchObject({
      kind: "failed",
      reason: "delivery-rejected",
      code: "invalid_payload",
    });
  });

  it("prefers the newest saved/failed entry for the same page", () => {
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [],
      saved: [saved("c1")],
      failed: [{ captureId: "c0", url: URL_A_CLEAN, code: "quota", at: NOW - 50 }],
    });
    expect(status.kind).toBe("saved");
  });

  it("picks the newest of several matching outbox records", () => {
    const old = record({ captureId: "c0", createdAt: NOW - 10, status: "waiting", attempts: 1 });
    const fresh = record({ captureId: "c2", createdAt: NOW + 10 });
    const status = derivePageCaptureStatus({
      pageUrl: URL_A_CLEAN,
      records: [old, fresh],
      saved: [],
      failed: [],
    });
    expect(status).toMatchObject({ kind: "queued", captureId: "c2" });
  });

  it("returns not-captured for a missing page url", () => {
    expect(
      derivePageCaptureStatus({
        pageUrl: undefined,
        records: [],
        saved: [],
        failed: [],
      }).kind,
    ).toBe("not-captured");
  });
});

describe("summarizeOutbox", () => {
  it("counts nothing for an empty outbox", () => {
    expect(summarizeOutbox([])).toEqual({ pending: 0, retrying: 0 });
  });

  it("separates pending from waiting records", () => {
    const records = [
      record({ captureId: "c0", attempts: 1 }),
      record({ captureId: "c1" }),
      record({
        captureId: "c2",
        status: "waiting",
        attempts: 3,
        nextAttemptAt: NOW + 60_000,
      }),
    ];
    expect(summarizeOutbox(records)).toEqual({ pending: 2, retrying: 1 });
  });
});

describe("capture registries", () => {
  it("deduplicates by capture id and keeps the newest entry", () => {
    const list = addSavedCapture(saved("c1", URL_A_CLEAN, 10), [], 5);
    const again = addSavedCapture(saved("c1", URL_A_CLEAN, 20), list, 5);
    expect(again).toHaveLength(1);
    expect(again[0]?.savedAt).toBe(20);
  });

  it("prunes beyond the limit, keeping the most recent", () => {
    let list: SavedCaptureEntry[] = [];
    for (let i = 0; i < 7; i++) list = addSavedCapture(saved(`c${i}`, URL_A_CLEAN, i), list, 5);
    expect(list).toHaveLength(5);
    expect(list.map((e) => e.captureId)).toEqual(["c6", "c5", "c4", "c3", "c2"]);
  });

  it("works the same for failed entries", () => {
    const list = addFailedCapture(
      { captureId: "c1", url: URL_A_CLEAN, code: "quota", at: NOW },
      [],
      5,
    );
    expect(
      addFailedCapture({ captureId: "c1", url: URL_A_CLEAN, at: NOW + 1 }, list, 5),
    ).toHaveLength(1);
  });
});

describe("outbox storage key sharing", () => {
  it("exports the same storage key the background persists under", () => {
    expect(OUTBOX_STORAGE_KEY).toBe("fluid-deck:outbox");
  });
});

export { record, saved, URL_A, URL_A_CLEAN, URL_B, NOW };
