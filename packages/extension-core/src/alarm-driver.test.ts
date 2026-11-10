/**
 * EXT-001 correction — alarm driver for MV3 wake-ups.
 * One-shot alarms only (no polling, no aggressive recurring alarms).
 * The durable outbox stays the source of truth; alarms are pure wake-up
 * signals — duplicates, stale names, and early firings are all harmless
 * because `tick()` is idempotent and single-flight.
 */
import { describe, expect, it } from "vitest";
import {
  ALARM_NAME,
  createAlarmAdapter,
  effectiveDeadlineMs,
  type AlarmApi,
} from "./alarm-driver.ts";

class FakeAlarms implements AlarmApi {
  alarms = new Map<string, number>();
  create(name: string, whenSec: number): void {
    this.alarms.set(name, whenSec);
  }
  clear(name: string): void {
    this.alarms.delete(name);
  }
  async getAll(): Promise<Array<{ name: string; scheduledTime: number }>> {
    return [...this.alarms.entries()].map(([name, scheduledTime]) => ({ name, scheduledTime }));
  }
}

describe("alarm driver", () => {
  it("creates a one-shot alarm at the persisted epoch-ms time", () => {
    const api = new FakeAlarms();
    const scheduler = createAlarmAdapter(api);
    scheduler.scheduleAt(10_000);
    expect(api.alarms.get(ALARM_NAME)).toBe(10);
  });

  it("does not create an alarm for a null/invalid deadline", () => {
    const api = new FakeAlarms();
    const scheduler = createAlarmAdapter(api);
    scheduler.scheduleAt(null);
    expect(api.alarms.size).toBe(0);
  });

  it("reconciles: a restart clears and recreates a missing alarm", () => {
    const api = new FakeAlarms();
    const scheduler = createAlarmAdapter(api);
    scheduler.scheduleAt(20_000);
    scheduler.clear();
    expect(api.alarms.size).toBe(0);
    scheduler.reconcile(20_000);
    expect(api.alarms.get(ALARM_NAME)).toBe(20);
  });

  it("early/stale alarm events are harmless (clear + no throw)", () => {
    const api = new FakeAlarms();
    const scheduler = createAlarmAdapter(api);
    scheduler.scheduleAt(5_000);
    scheduler.clear();
    expect(() => scheduler.clear()).not.toThrow();
    expect(api.alarms.size).toBe(0);
  });

  it("a zero/negative deadline clears instead of arming an epoch-0 alarm", () => {
    const api = new FakeAlarms();
    const scheduler = createAlarmAdapter(api);
    scheduler.scheduleAt(0);
    expect(api.alarms.size).toBe(0);
  });

  it("effectiveDeadlineMs wakes on the ACK deadline for an in-flight head", () => {
    expect(
      effectiveDeadlineMs({ status: "pending", nextAttemptAt: 0, ackDeadlineAt: 10_000 }, 0),
    ).toBe(10_000);
  });

  it("effectiveDeadlineMs wakes on the retry deadline for a waiting head", () => {
    expect(effectiveDeadlineMs({ status: "waiting", nextAttemptAt: 42_000 }, 0)).toBe(42_000);
  });

  it("effectiveDeadlineMs takes the earliest and ignores past deadlines", () => {
    expect(
      effectiveDeadlineMs(
        { status: "waiting", nextAttemptAt: 42_000, ackDeadlineAt: 5_000 },
        1_000,
      ),
    ).toBe(5_000);
    expect(effectiveDeadlineMs({ status: "waiting", nextAttemptAt: 42_000 }, 50_000)).toBeNull();
    expect(effectiveDeadlineMs({ status: "pending", nextAttemptAt: 0 }, 0)).toBeNull();
    expect(effectiveDeadlineMs(undefined, 0)).toBeNull();
  });
});
