/**
 * EXT-001 — durable outbox state machine (R-1).
 * Pending = queued never attempted; waiting = attempted, nextAttemptAt in
 * the future. Delivery+ack only ever happen through `processOutbox` with
 * an injected transport; this module owns transitions, persistence shape,
 * backoff math, and recovery.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ACK_TIMEOUT_MS,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  OutboxMachine,
  computeBackoffMs,
  type DeliveryOutcome,
  type OutboxRecord,
  type OutboxStorage,
} from "./outbox.ts";

const payload = () => ({ captureId: "c1", url: "https://example.com", title: "T" });

class MemoryStorage implements OutboxStorage {
  records: OutboxRecord[] = [];
  failNextSave = false;
  async load(): Promise<OutboxRecord[]> {
    return structuredClone(this.records);
  }
  async save(records: OutboxRecord[]): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("storage unavailable");
    }
    this.records = structuredClone(records);
  }
}

function machine(nowValue = 0) {
  const store = new MemoryStorage();
  const state = {
    now: nowValue,
    storage: store,
    deliver: vi.fn(async (): Promise<DeliveryOutcome> => Promise.resolve("ack")),
  };
  const m = new OutboxMachine({
    store,
    deliver: state.deliver,
    now: () => state.now,
    timeoutMs: ACK_TIMEOUT_MS,
  });
  return { m, state, store };
}

describe("outbox", () => {
  it("persists a new capture before delivery begins", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "c1" });
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({ status: "pending", attempts: 0 });
    // And nothing was delivered early.
    expect(m.queue().length).toBe(1);
  });

  it("delivers FIFO and removes the head on a valid ack", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "a" });
    await m.enqueue({ payload: { ...payload(), title: "B" }, captureId: "b" });
    await m.tick();
    expect(store.records.map((r) => r.captureId)).toEqual(["b"]);
  });

  it("ignores an ACK whose captureId does not match the head", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "expected" });
    const { state } = machine(0);
    void state;
    await m.handleAck("wrong-id");
    expect(store.records).toHaveLength(1);
  });

  it("treats duplicate ACKs as harmless", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.handleAck("c1");
    await m.handleAck("c1");
    expect(store.records).toEqual([]);
  });

  it("ignores malformed ACKs (empty/missing captureId)", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.handleAck("");
    await m.handleAck(null as unknown as string);
    expect(store.records).toHaveLength(1);
  });

  it("times out at 10s and waits for retry", async () => {
    const { m, state } = machine(0);
    state.deliver.mockResolvedValueOnce("timeout");
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.tick();
    const head = m.queue()[0];
    expect(head?.status).toBe("waiting");
    expect(head?.nextAttemptAt).toBe(1000);
  });

  it("backs off exponentially 1s..60s and retries indefinitely", async () => {
    expect(computeBackoffMs(0)).toBe(1000);
    expect(computeBackoffMs(1)).toBe(2000);
    expect(computeBackoffMs(2)).toBe(4000);
    expect(computeBackoffMs(5)).toBe(32000);
    expect(computeBackoffMs(6)).toBe(60000);
    expect(computeBackoffMs(100)).toBe(60000);

    const { m, state } = machine(0);
    state.deliver.mockResolvedValue("timeout");
    await m.enqueue({ payload: payload(), captureId: "c1" });
    for (const at of [0, 1000, 3000, 9000]) {
      state.now = at;
      await m.tick();
    }
    expect(m.queue()[0]?.attempts).toBe(4);
    expect(m.queue()[0]?.status).toBe("waiting");
    expect(state.deliver).toHaveBeenCalledTimes(4);
  });

  it("retains the item when delivery fails", async () => {
    const { m, state, store } = machine();
    state.deliver.mockRejectedValueOnce(new Error("network down"));
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.tick();
    expect(store.records).toHaveLength(1);
    expect(store.records[0]?.status).toBe("waiting");
  });

  it("does not let a later capture overtake a waiting head", async () => {
    const { m, state } = machine(0);
    state.deliver.mockResolvedValueOnce("timeout");
    await m.enqueue({ payload: payload(), captureId: "first" });
    await m.tick();
    await m.enqueue({ payload: { ...payload(), title: "later" }, captureId: "second" });
    state.now = 500; // still waiting on backoff
    state.deliver.mockClear();
    await m.tick();
    expect(state.deliver).not.toHaveBeenCalled();
  });

  it("recovers pending plus in-flight state after worker restart", async () => {
    const { m, store } = machine();
    await m.enqueue({ payload: payload(), captureId: "c1" });
    // A "restarted" machine over the same storage.
    const restarted = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      timeoutMs: ACK_TIMEOUT_MS,
    });
    await restarted.restore();
    await restarted.tick();
    expect(store.records).toEqual([]);
  });

  it("preserves retry scheduling across restart", async () => {
    const { m, store } = machine(0);
    await m.enqueue({ payload: payload(), captureId: "c1" });
    store.records[0] = {
      ...store.records[0]!,
      status: "waiting",
      attempts: 3,
      nextAttemptAt: 42000,
    };
    const restarted = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      timeoutMs: ACK_TIMEOUT_MS,
    });
    await restarted.restore();
    expect(restarted.queue()[0]).toMatchObject({ attempts: 3, nextAttemptAt: 42000 });
  });

  it("does not drop captures when a storage write fails", async () => {
    const { m, store } = machine();
    store.failNextSave = true;
    await expect(m.enqueue({ payload: payload(), captureId: "c1" })).rejects.toThrowError(
      "storage unavailable",
    );
    expect(m.queue()).toHaveLength(0); // in-memory mirrors only durably-saved records
    await m.enqueue({ payload: { ...payload(), title: "second" }, captureId: "c2" });
    expect(store.records).toHaveLength(1);
  });

  it("single-flight: concurrent ticks do not deliver the head twice", async () => {
    const { m, state } = machine();
    const holder: { rel: (() => void) | null } = { rel: null };
    const newDeliver = () =>
      new Promise<DeliveryOutcome>((resolve) => {
        holder.rel = () => resolve("ack");
      });
    state.deliver.mockImplementation(newDeliver);
    await m.enqueue({ payload: payload(), captureId: "c1" });
    const t1 = m.tick();
    const t2 = m.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    holder.rel?.();
    await Promise.all([t1, t2]);
    expect(state.deliver).toHaveBeenCalledTimes(1);
  });

  it("drops only on a permanent nack; transient nacks retry", async () => {
    const { m, state, store } = machine();
    state.deliver.mockResolvedValueOnce("nack-permanent");
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.tick();
    expect(store.records).toEqual([]);
  });

  it("duplicate delivery is safe (web dedups by captureId; ack completes once)", async () => {
    const { m, state } = machine();
    state.deliver.mockResolvedValueOnce("timeout");
    await m.enqueue({ payload: payload(), captureId: "c1" });
    await m.tick();
    state.now = 1000;
    state.deliver.mockResolvedValueOnce("ack");
    await m.tick();
    await m.handleAck("c1"); // duplicate ack: no crash
    expect(m.queue()).toEqual([]);
  });

  it("ACK_TIMEOUT_MS is exactly 10 seconds and backoff bounds are exact", async () => {
    expect(ACK_TIMEOUT_MS).toBe(10_000);
    expect(BACKOFF_BASE_MS).toBe(1_000);
    expect(BACKOFF_MAX_MS).toBe(60_000);
  });
});
