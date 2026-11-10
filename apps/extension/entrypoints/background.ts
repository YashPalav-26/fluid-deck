import {
  ALARM_NAME,
  PROTOCOL,
  PROTOCOL_VERSION,
  OutboxMachine,
  OUTBOX_STORAGE_KEY,
  createAlarmAdapter,
  effectiveDeadlineMs,
} from "@fluid-deck/extension-core";
import type { AlarmApi, OutboxEntry, OutboxRecord, OutboxStorage } from "@fluid-deck/extension-core";

/**
 * EXT-001 — durable outbox lifecycle (R-1).
 *
 * The queue itself lives in `OutboxMachine` (`@fluid-deck/extension-core`):
 * FIFO single-head delivery, 10 s ACK timeout, backoff min(1s·2^n, 60s),
 * permanent-nack drop only, and durable state that survives MV3 suspension.
 * This entrypoint owns only the browser wiring:
 *
 * - the `browser.storage.local` adapter (`fluid-deck:outbox`);
 * - boot / `onStartup` reconciliation, so a suspended or restarted worker
 *   reloads the queue and re-arms the durable alarm;
 * - the alarm adapter, which turns the head's effective deadline into a
 *   one-shot `browser.alarms` wake (the suspension/restart fallback).
 *
 * Delivery is injected. EXT-004 wires the real bridge transport here; until
 * then an attempt has no receiver and resolves `"timeout"`, so the record
 * stays durable and the R-1 backoff applies. Nothing is dropped, nothing is
 * delivered early, and there is exactly one queue.
 */

const STORAGE_KEY = OUTBOX_STORAGE_KEY;

const storageAdapter: OutboxStorage = {
  async load() {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] as OutboxRecord[] | undefined) ?? [];
  },
  async save(records) {
    await browser.storage.local.set({ [STORAGE_KEY]: records });
  },
};

const alarmApi: AlarmApi = {
  create(name, whenSec) {
    return browser.alarms.create(name, { when: whenSec });
  },
  clear(name) {
    return browser.alarms.clear(name);
  },
  getAll() {
    return browser.alarms
      .getAll()
      .then((alarms) => alarms.map((a) => ({ name: a.name, scheduledTime: a.scheduledTime ?? 0 })));
  },
};

const scheduler = createAlarmAdapter(alarmApi);

const outbox = new OutboxMachine({
  store: storageAdapter,
  deliver: async () => "timeout",
  onSchedule: (deadlineMs) => {
    scheduler.scheduleAt(deadlineMs);
    // A zero deadline means the new head is ready *now* (pending, never
    // attempted). The alarm driver deliberately clears epoch-0 alarms, so
    // drain immediately instead of parking the queue until the next wake.
    if (deadlineMs === 0 && outbox.queue().length > 0) {
      setTimeout(() => void outbox.tick().catch(() => undefined), 0);
    }
  },
});

/** Re-arm the durable alarm from the head's effective deadline (retry OR ACK, whichever is next). */
function reconcileAlarm() {
  scheduler.reconcile(effectiveDeadlineMs(outbox.queue()[0], Date.now()));
}

/** Reconcile durable state on boot, then attempt the head if anything is queued. */
export async function reconcile(): Promise<void> {
  await outbox.restore();
  const queue = outbox.queue();
  reconcileAlarm();
  if (queue.length > 0) {
    console.info(
      `[Fluid Deck] outbox: ${queue.length} record(s) recovered (%o)`,
      queue.map((r) => ({ captureId: r.captureId, status: r.status, attempts: r.attempts })),
    );
    await outbox.tick();
  }
}

export { outbox };

/** Alarm wake: reload durable state, rediscover tabs, and attempt the head. */
export async function onAlarmWake(name: string): Promise<void> {
  if (name !== ALARM_NAME) return;
  await outbox.restore();
  const queue = outbox.queue();
  reconcileAlarm();
  console.info(`[Fluid Deck] outbox alarm woke; ${queue.length} record(s) pending`);
  if (queue.length > 0) await outbox.tick();
}

/**
 * Internal test/diagnostics surface (service-worker global only — never
 * reachable from a page). The Playwright bridge test enqueues through it
 * without adding capture triggers early.
 */
export interface FluidDeckTestApi {
  outbox: OutboxMachine;
  reconcile: () => Promise<void>;
  enqueue: (entry: OutboxEntry) => Promise<void>;
  tick: () => Promise<void>;
  queue: () => OutboxRecord[];
}

declare global {
  var __fluidDeck: FluidDeckTestApi | undefined;
}

globalThis.__fluidDeck = {
  outbox,
  reconcile,
  enqueue: (entry) => outbox.enqueue(entry),
  tick: () => outbox.tick(),
  queue: () => outbox.queue(),
};

export default defineBackground(() => {
  console.info(`[Fluid Deck] background ready - ${PROTOCOL} v${PROTOCOL_VERSION}`);
  void browser.storage.local.set({ "fluid-deck:booted": Date.now() });

  // Reconcile durable state + alarm on every worker start.
  void reconcile();
  browser.runtime.onStartup.addListener(() => {
    void reconcile();
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    void onAlarmWake(alarm.name);
  });
});
