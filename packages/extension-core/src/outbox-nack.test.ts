/**
 * EXT-004 — late NACK cleanup in the durable outbox. The normal permanent-nack
 * path is inside `tick()`; this covers a NACK whose ACK timeout already passed
 * (or whose delivery promise was already resolved by a newer attempt).
 */
import { describe, expect, it, vi } from "vitest";
import {
  OutboxMachine,
  type DeliveryOutcome,
  type OutboxRecord,
  type OutboxStorage,
} from "./outbox.ts";

class MemoryStorage implements OutboxStorage {
  records: OutboxRecord[] = [];
  async load(): Promise<OutboxRecord[]> {
    return structuredClone(this.records);
  }
  async save(records: OutboxRecord[]): Promise<void> {
    this.records = structuredClone(records);
  }
}

function machine(outcome: DeliveryOutcome = "timeout") {
  const store = new MemoryStorage();
  const deliver = vi.fn(async () => outcome);
  const onSchedule = vi.fn();
  const outbox = new OutboxMachine({ store, deliver, onSchedule, now: () => 10_000 });
  return { outbox, store, deliver, onSchedule };
}

describe("outbox late nack handling", () => {
  it("discards the matching head on a permanent nack", async () => {
    const { outbox, store } = machine();
    await outbox.enqueue({ captureId: "a", payload: { captureId: "a" } });
    await outbox.enqueue({ captureId: "b", payload: { captureId: "b" } });

    await outbox.handleNack("a", true);

    expect(outbox.queue().map((record) => record.captureId)).toEqual(["b"]);
    expect(store.records.map((record) => record.captureId)).toEqual(["b"]);
  });

  it("ignores a transient nack (the scheduled backoff owns the retry)", async () => {
    const { outbox, store } = machine();
    await outbox.enqueue({ captureId: "a", payload: { captureId: "a" } });

    await outbox.handleNack("a", false);

    expect(outbox.queue()).toHaveLength(1);
    expect(store.records).toHaveLength(1);
  });

  it("ignores an unknown or non-head capture id", async () => {
    const { outbox } = machine();
    await outbox.enqueue({ captureId: "a", payload: { captureId: "a" } });
    await outbox.enqueue({ captureId: "b", payload: { captureId: "b" } });

    await outbox.handleNack("b", true);
    await outbox.handleNack("missing", true);

    expect(outbox.queue().map((record) => record.captureId)).toEqual(["a", "b"]);
  });

  it("discards a waiting head when the permanent nack arrives after timeout", async () => {
    const { outbox } = machine("timeout");
    await outbox.enqueue({ captureId: "a", payload: { captureId: "a" } });
    await outbox.tick();
    expect(outbox.queue()[0]?.status).toBe("waiting");

    await outbox.handleNack("a", true);

    expect(outbox.queue()).toEqual([]);
  });
});
