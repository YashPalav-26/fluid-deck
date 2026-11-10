/**
 * EXT-001 — durable outbox state machine (R-1).
 *
 * Canonical protocol lives in `index.ts`; this module owns ONLY the
 * queue lifecycle: enqueue → attempt → ack/nack/timeout transitions,
 * exponential backoff, FIFO ordering, single-flight ticking, and the
 * durable record shape that survives MV3 suspension.
 *
 * Delivery is injected (`deliver`): EXT-004 wires the real transport.
 * This module never touches `browser.*` — tests run with an in-memory
 * adapter and a fake clock; the background supplies the WXT storage
 * adapter.
 */

export type DeliveryOutcome = "ack" | "nack-permanent" | "nack-transient" | "timeout";

export type OutboxEntry = {
  captureId: string;
  payload: Record<string, unknown>;
};

export type OutboxRecord = OutboxEntry & {
  status: "pending" | "waiting";
  attempts: number;
  nextAttemptAt: number;
  /** Persisted ACK deadline for the in-flight attempt (EXT-001 correction). Null when no attempt is armed. */
  ackDeadlineAt?: number;
  createdAt: number;
};

export interface OutboxStorage {
  load(): Promise<OutboxRecord[]>;
  save(records: OutboxRecord[]): Promise<void>;
}

export interface OutboxMachineOptions {
  store: OutboxStorage;
  deliver: (entry: OutboxEntry) => Promise<DeliveryOutcome>;
  now?: () => number;
  timeoutMs?: number;
  /** EXT-001 correction: called with the head's next attempt deadline (epoch ms) after enqueue/failure transitions. */
  onSchedule?: (deadlineMs: number) => void;
}

/** R-1 approved parameters. */
export const ACK_TIMEOUT_MS = 10_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

export function computeBackoffMs(consecutiveFailures: number): number {
  const exponent = Math.min(consecutiveFailures, 30);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

function isValidCaptureId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

export class OutboxMachine {
  readonly #records: OutboxRecord[] = [];
  readonly #store: OutboxStorage;
  readonly #deliver: (entry: OutboxEntry) => Promise<DeliveryOutcome>;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  readonly #onSchedule?: (deadlineMs: number) => void;
  #inFlight = false;

  constructor(options: OutboxMachineOptions) {
    this.#store = options.store;
    this.#deliver = options.deliver;
    this.#now = options.now ?? (() => Date.now());
    this.#timeoutMs = options.timeoutMs ?? ACK_TIMEOUT_MS;
    this.#onSchedule = options.onSchedule;
  }

  /** FIFO snapshot for diagnostics/tests. */
  queue(): OutboxRecord[] {
    return structuredClone(this.#records);
  }

  /** Load durable records after worker restart (called once at boot). */
  async restore(): Promise<void> {
    const records = await this.#store.load();
    const now = this.#now();
    const converted = records.map((record): OutboxRecord => {
      // An interrupted in-flight attempt (attempt started, worker died) is a
      // timed-out attempt — it must not silently reset backoff.
      if (record.ackDeadlineAt != null && now >= record.ackDeadlineAt) {
        return {
          ...record,
          status: "waiting",
          attempts: record.attempts + 1,
          nextAttemptAt: now + computeBackoffMs(record.attempts),
          ackDeadlineAt: undefined,
        };
      }
      return record;
    });
    const changed = converted.some((r, i) => r !== records[i]);
    this.#records.length = 0;
    this.#records.push(...converted);
    if (changed) {
      await this.#store.save(converted);
      this.#onSchedule?.(this.#records[0]?.nextAttemptAt ?? 0);
    }
  }

  /**
   * Enqueue a capture. The record is durable BEFORE any delivery can
   * start: the caller's `await enqueue()` resolves only after storage
   * confirms the write. Storage failures throw (never swallowed) and
   * leave the in-memory mirror untouched.
   */
  async enqueue(entry: OutboxEntry): Promise<void> {
    const record: OutboxRecord = {
      captureId: entry.captureId,
      payload: entry.payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: this.#now(),
    };
    const next = [...this.#records, record];
    await this.#store.save(next);
    this.#records.push(record);
    this.#onSchedule?.(this.#records[0]!.nextAttemptAt);
  }

  /**
   * Attempt delivery of the current head (FIFO). Later items cannot
   * overtake a waiting head. Single-flight: concurrent ticks share one
   * attempt.
   */
  async tick(): Promise<void> {
    if (this.#inFlight) return;
    const head = this.#records[0];
    if (!head) return;
    // Early alarm: re-arm the consumed alarm and do NOT deliver early.
    if (head.status === "waiting" && this.#now() < head.nextAttemptAt) {
      this.#onSchedule?.(head.nextAttemptAt);
      return;
    }
    // Already-armed attempt (ACK deadline in the future): a duplicate /
    // early wake must not deliver twice — re-arm and wait for the deadline.
    if (
      head.status === "pending" &&
      head.ackDeadlineAt != null &&
      this.#now() < head.ackDeadlineAt
    ) {
      this.#onSchedule?.(head.ackDeadlineAt);
      return;
    }
    this.#inFlight = true;
    let deliveryStarted = false;
    try {
      // Persist the attempt + ack deadline BEFORE delivering: a suspended
      // worker leaves an in-flight record, and the ack-deadline alarm is
      // armed so the timeout transition is never lost.
      if (head.ackDeadlineAt == null || this.#now() >= head.ackDeadlineAt) {
        const ackDeadlineAt = this.#now() + this.#timeoutMs;
        const armed: OutboxRecord = { ...head, ackDeadlineAt };
        const next = [armed, ...this.#records.slice(1)];
        await this.#store.save(next);
        this.#records.length = 0;
        this.#records.push(...next);
        this.#onSchedule?.(ackDeadlineAt);
        Object.assign(head, armed);
      }
      deliveryStarted = true;
      const outcome = await this.#deliverWithTimeout(head);
      if (outcome === "ack" || outcome === "nack-permanent") {
        const next = this.#records.filter((r) => r.captureId !== head.captureId);
        await this.#store.save(next);
        this.#records.length = 0;
        this.#records.push(...next);
        this.#onSchedule?.(next[0]?.nextAttemptAt ?? 0);
      } else if (outcome === "timeout" || outcome === "nack-transient") {
        const attempts = head.attempts + 1;
        const nextAttemptAt = this.#now() + computeBackoffMs(head.attempts);
        // Clear the consumed ACK deadline: a stale ackDeadlineAt would
        // re-trigger the restart conversion and double-count the attempt.
        const record: OutboxRecord = {
          ...head,
          status: "waiting",
          attempts,
          nextAttemptAt,
          ackDeadlineAt: undefined,
        };
        const next = [record, ...this.#records.slice(1)];
        await this.#store.save(next);
        this.#records.length = 0;
        this.#records.push(...next);
        this.#onSchedule?.(record.nextAttemptAt);
      }
    } catch (error) {
      // Storage failure BEFORE delivery started: durable state is
      // untouched, no attempt was made — surface it, count nothing.
      if (!deliveryStarted) throw error;
      // A delivery failure (throw) is a transient outcome: retain + wait.
      const attempts = head.attempts + 1;
      const nextAttemptAt = this.#now() + computeBackoffMs(head.attempts);
      const record: OutboxRecord = {
        ...head,
        status: "waiting",
        attempts,
        nextAttemptAt,
        ackDeadlineAt: undefined,
      };
      const next = [record, ...this.#records.slice(1)];
      await this.#store.save(next).catch(() => undefined);
      this.#records.length = 0;
      this.#records.push(...next);
      this.#onSchedule?.(record.nextAttemptAt);
    } finally {
      this.#inFlight = false;
    }
  }

  /**
   * EXT-004 — late permanent NACK cleanup. The normal path is the transport
   * resolving `"nack-permanent"` inside `tick()`; this covers a NACK that
   * arrives after the ACK timeout (worker/transport already moved on).
   *
   * Only a matching head is removed, and only `permanent: true` acts: a late
   * transient NACK changes nothing because the scheduled backoff already owns
   * the retry. Ignoring it also makes the call safe when `tick()` handled the
   * same NACK microseconds earlier (no double increment).
   */
  async handleNack(captureId: string, permanent: boolean): Promise<void> {
    if (!permanent) return;
    if (!isValidCaptureId(captureId)) return;
    const head = this.#records[0];
    if (!head || head.captureId !== captureId) return;
    const next = this.#records.filter((r) => r.captureId !== captureId);
    await this.#store.save(next);
    this.#records.length = 0;
    this.#records.push(...next);
    this.#onSchedule?.(next[0]?.nextAttemptAt ?? 0);
  }

  /**
   * Web-originated ACK validation entry point: only a captureId matching
   * the current head completes it. Everything else (empty, malformed,
   * unknown, stale/duplicated acks) is ignored idempotently.
   */
  async handleAck(captureId: string): Promise<void> {
    if (!isValidCaptureId(captureId)) return;
    const head = this.#records[0];
    if (!head || head.captureId !== captureId) return;
    const next = this.#records.filter((r) => r.captureId !== head.captureId);
    await this.#store.save(next);
    this.#records.length = 0;
    this.#records.push(...next);
    this.#onSchedule?.(next[0]?.nextAttemptAt ?? 0);
  }

  async #deliverWithTimeout(head: OutboxEntry): Promise<DeliveryOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<DeliveryOutcome>((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.#timeoutMs);
    });
    const delivery = Promise.resolve().then(() => this.#deliver(head));
    const outcome = await Promise.race([delivery, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    return outcome;
  }
}
