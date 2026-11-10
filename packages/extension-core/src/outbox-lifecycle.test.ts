/**
 * Lifecycle — ACK deadline persistence and restart recovery.
 * The ACK deadline is persisted (alarm observed to be scheduled) BEFORE
 * delivery begins, so a suspended worker still has a durable record.
 */
import { describe, expect, it } from "vitest";
import { OutboxMachine, type OutboxStorage } from "./outbox.ts";
import type { OutboxRecord } from "./outbox.ts";

class MemoryStorage implements OutboxStorage {
  records: OutboxRecord[] = [];
  failNextSave = false;
  failSaves = 0;
  async load(): Promise<OutboxRecord[]> {
    return structuredClone(this.records);
  }
  async save(records: OutboxRecord[]): Promise<void> {
    if (this.failSaves > 0) {
      this.failSaves -= 1;
      throw new Error("storage unavailable");
    }
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("storage unavailable");
    }
    this.records = structuredClone(records);
  }
}

describe("ACK deadline lifecycle", () => {
  it("persists the ACK deadline and schedules an alarm before delivery starts", async () => {
    const store = new MemoryStorage();
    const state = { now: 0, scheduled: [] as number[] };
    let duringDelivery: OutboxRecord | undefined;
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        duringDelivery = store.records[0];
        return "ack";
      },
      now: () => state.now,
      onSchedule: (deadline) => state.scheduled.push(deadline),
    });
    await machine.enqueue({ payload: { url: "https://a" }, captureId: "c" });
    await machine.tick(); // ACK deadline is persisted when the attempt starts
    expect(state.scheduled).toContain(10_000);
    expect(duringDelivery).toMatchObject({ ackDeadlineAt: 10_000 });
  });

  it("restores the persisted deadline on restart and does not reset attempts", async () => {
    const store = new MemoryStorage();
    store.records = [
      {
        captureId: "c",
        payload: {},
        status: "pending",
        attempts: 2,
        nextAttemptAt: 0,
        ackDeadlineAt: 5_000,
        createdAt: 0,
      },
    ];
    const machine = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      onSchedule: () => undefined,
    });
    await machine.restore();
    const head = machine.queue()[0];
    expect(head).toMatchObject({ attempts: 2, ackDeadlineAt: 5_000 });
  });

  it("an interrupted in-flight record becomes a timed-out attempt on restart", async () => {
    const store = new MemoryStorage();
    const state = { now: 6_000, scheduled: [] as number[] };
    const machine = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => state.now,
      onSchedule: (deadline) => state.scheduled.push(deadline),
    });
    store.records = [
      {
        captureId: "c",
        payload: {},
        status: "pending",
        attempts: 1,
        nextAttemptAt: 0,
        ackDeadlineAt: 5_000,
        createdAt: 0,
      },
    ];
    await machine.restore();
    await machine.tick();
    const head = machine.queue()[0];
    expect(head?.status).toBe("waiting");
    expect(head?.attempts).toBe(2);
    expect(state.scheduled).toContain(head!.nextAttemptAt);
  });

  it("a single failed transition save is retried best-effort and survives restart", async () => {
    const store = new MemoryStorage();
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        store.failNextSave = true; // the outcome/transition save fails once
        return "timeout";
      },
      now: () => 0,
      onSchedule: () => undefined,
    });
    await machine.enqueue({ payload: {}, captureId: "c" });
    await machine.tick();
    // The catch path's best-effort re-save landed: durable shows the
    // counted attempt, not a silent loss.
    expect(store.records[0]).toMatchObject({ status: "waiting", attempts: 1 });
    expect(store.records[0]?.ackDeadlineAt).toBeFalsy();
    const restarted = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      onSchedule: () => undefined,
    });
    await restarted.restore();
    expect(restarted.queue()[0]).toMatchObject({
      status: "waiting",
      attempts: 1,
      nextAttemptAt: 1000,
    });
  });

  it("when every transition save fails, durable state stays at the last persisted attempt", async () => {
    const store = new MemoryStorage();
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        store.failSaves = 2; // outcome save + best-effort re-save both fail
        return "timeout";
      },
      now: () => 0,
      onSchedule: () => undefined,
    });
    await machine.enqueue({ payload: {}, captureId: "c" });
    await machine.tick();
    // Durable truth: both transition saves failed, so storage still holds
    // the armed attempt. In-memory may run ahead; it is never truth.
    expect(store.records[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      ackDeadlineAt: 10_000,
    });
    const restarted = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      onSchedule: () => undefined,
    });
    await restarted.restore();
    const head = restarted.queue()[0];
    expect(head).toBeDefined(); // capture not lost
    expect(head!.attempts).toBe(0); // not incremented (never durable), never reset below durable
    expect(head!.ackDeadlineAt).toBe(10_000); // armed deadline survives restart
    // Exact limitation: the failed saves mean that one failure is
    // re-attempted at the same backoff step — never escalated, never reset.
  });

  it("an early alarm on an armed attempt does not deliver twice and re-arms", async () => {
    const store = new MemoryStorage();
    const state = { now: 5_000, scheduled: [] as number[] };
    let deliverCount = 0;
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        deliverCount += 1;
        return "ack";
      },
      now: () => state.now,
      onSchedule: (deadline) => state.scheduled.push(deadline),
    });
    // Worker suspended mid-attempt: durable record is armed (ack deadline
    // 10000). It wakes early (now 5000) and ticks.
    store.records = [
      {
        captureId: "c",
        payload: {},
        status: "pending",
        attempts: 0,
        nextAttemptAt: 0,
        ackDeadlineAt: 10_000,
        createdAt: 0,
      },
    ];
    await machine.restore();
    await machine.tick();
    expect(deliverCount).toBe(0); // not delivered early / not twice
    expect(state.scheduled).toContain(10_000); // re-armed, not lost
  });

  it("a timeout transition clears the consumed ACK deadline", async () => {
    const store = new MemoryStorage();
    const machine = new OutboxMachine({
      store,
      deliver: async () => "timeout",
      now: () => 0,
      onSchedule: () => undefined,
    });
    await machine.enqueue({ payload: {}, captureId: "c" });
    await machine.tick();
    expect(store.records[0]?.ackDeadlineAt).toBeFalsy();
    // Restart must not double-count the attempt via the stale deadline.
    const restarted = new OutboxMachine({
      store,
      deliver: async () => "ack",
      now: () => 0,
      onSchedule: () => undefined,
    });
    await restarted.restore();
    expect(restarted.queue()[0]?.attempts).toBe(1);
  });

  it("storage failure while arming (before delivery) surfaces and counts no attempt", async () => {
    const store = new MemoryStorage();
    let deliverCount = 0;
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        deliverCount += 1;
        return "ack" as const;
      },
      now: () => 0,
      onSchedule: () => undefined,
    });
    await machine.enqueue({ payload: {}, captureId: "c" });
    store.failSaves = 1; // the arming save is the next save
    await expect(machine.tick()).rejects.toThrowError("storage unavailable");
    expect(deliverCount).toBe(0); // delivery never started without a durable deadline
    expect(store.records[0]).toMatchObject({ status: "pending", attempts: 0 });
    await machine.tick(); // storage recovered: proceeds normally
    expect(deliverCount).toBe(1);
  });

  it("an early tick on a waiting head re-arms its retry alarm and never delivers early", async () => {
    const store = new MemoryStorage();
    const state = { now: 0, scheduled: [] as number[] };
    let deliverCount = 0;
    const machine = new OutboxMachine({
      store,
      deliver: async () => {
        deliverCount += 1;
        return "timeout";
      },
      now: () => state.now,
      onSchedule: (deadline) => state.scheduled.push(deadline),
    });
    await machine.enqueue({ payload: {}, captureId: "c" });
    await machine.tick();
    state.now = 500; // before nextAttemptAt (1000)
    await machine.tick();
    expect(deliverCount).toBe(1);
    expect(state.scheduled).toContain(1000);
  });
});
